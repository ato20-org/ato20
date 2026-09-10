"use client";

import { memo, useMemo, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, GripVertical, Lock, LockOpen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAssetList } from "@/hooks/use-asset-list";
import { useCharacters } from "@/hooks/use-characters";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useListReorder } from "@/hooks/use-list-reorder";
import { MINIATURA } from "@/lib/miniatura";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { cn } from "@/lib/utils";
import type { CanvasItem, Scene } from "@/types/scene";

/**
 * As imagens que estão na cena, na ordem em que se sobrepõem.
 *
 * A lista é ordenada da frente para o fundo: o topo é o que aparece por cima.
 * Sem esse painel, descobrir qual das cinco imagens empilhadas está na frente
 * exigia clicar em cada uma no palco — e uma imagem escondida atrás de outra
 * não tinha como ser alcançada.
 */
export function LayerList({ scene }: { scene: Scene }) {
  const { assets } = useAssetList("image");
  const { personagens } = useCharacters();

  const selectedIds = useSelectionStore((state) => state.selectedIds);

  /**
   * As AÇÕES saem por `getState()`, e não por assinatura.
   *
   * Elas são fixas na criação do store — assinar nunca trouxe atualização
   * nenhuma —, e a diferença é que agora a linha as chama por conta própria em
   * vez de receber quatro arrows novas por render. É o que faz o `memo` do
   * `LayerRow` valer: ver a nota lá embaixo.
   */
  const moveItemToIndex = useSceneStore.getState().moveItemToIndex;

  const names = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset.name])),
    [assets],
  );

  /**
   * O nome do personagem vence o do arquivo, quando o item é um token.
   *
   * O token do Edgar aparecia como "Personagem - Edgar.png", que é o nome que
   * o arquivo tem no acervo. Numa cena com quatro tokens e três mapas, é a
   * linha que o mestre mais procura e a que dizia menos. Ver `personagemId`.
   *
   * Pelo id, e não por um nome copiado no item: renomear o personagem renomeia
   * a linha, em vez de deixar o nome de antes cravado na cena.
   */
  const porPersonagem = useMemo(
    () => new Map((personagens ?? []).map((personagem) => [personagem.id, personagem.nome])),
    [personagens],
  );

  const nomeDe = (item: CanvasItem) =>
    (item.personagemId ? porPersonagem.get(item.personagemId) : undefined) ??
    names.get(item.assetId);

  // Frente primeiro. É o inverso de como o palco desenha, de propósito: numa
  // lista, o que está por cima se lê no topo.
  const ordered = useMemo(() => [...scene.items].sort((a, b) => b.z - a.z), [scene.items]);

  const { listRef, dropIndex, startReorder } = useListReorder<string>((itemId, index) =>
    moveItemToIndex(scene.id, itemId, index),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-xs font-medium">Em cena</span>
        <span className="text-muted-foreground text-[10px]">
          {ordered.length > 0 ? `${ordered.length} · frente no topo` : null}
        </span>
      </div>

      {ordered.length === 0 ? (
        <p className="text-muted-foreground px-3 pb-3 text-xs">
          Nada na cena. Importe uma imagem acima e clique no <span className="font-medium">+</span>.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul ref={listRef} className="space-y-0.5 px-2 pb-2">
            {ordered.map((item, index) => (
              <LayerRow
                key={item.id}
                sceneId={scene.id}
                item={item}
                name={nomeDe(item)}
                selected={selectedIds.includes(item.id)}
                atFront={index === 0}
                atBack={index === ordered.length - 1}
                dropTarget={dropIndex === index}
                onReorderStart={startReorder}
              />
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}

type LayerRowProps = {
  sceneId: string;
  item: CanvasItem;
  name: string | undefined;
  selected: boolean;
  atFront: boolean;
  atBack: boolean;
  /** Linha onde o item arrastado cairia. */
  dropTarget: boolean;
  /** O do `useListReorder`, cru: ele é estável, e a linha passa o próprio id. */
  onReorderStart: (event: ReactPointerEvent, itemId: string) => void;
};

/**
 * Uma camada, e ela NÃO re-renderiza quando outra se move.
 *
 * `memo` porque o painel fica aberto ao lado do palco, e arrastar um token
 * chama `updateItems` a cada movimento do ponteiro: sem isto, mover UM item
 * reconciliava TODAS as linhas, cada uma com quatro botões de ícone. Medido no
 * cenário `camadas` do `/perf`, com o painel aberto e o mesmo gesto do cenário
 * `arrasto`:
 *
 *   n=20   473 ms de script no palco sozinho, 3686 ms com o painel
 *   n=60   394 ms sozinho, 6737 ms com o painel -- 24,1% dos quadros perdidos
 *   n=200  503 ms sozinho, 6855 ms com o painel -- 14,9 fps, p50 de 66,7 ms
 *
 * O `memo` só pode cortar porque `updateItems` PRESERVA a identidade do item
 * que não mudou (ver `use-scene-store`), e porque nenhuma prop daqui é criada
 * por render: as ações vêm de `getState()` dentro dos handlers, e
 * `onReorderStart` é o `startReorder` estável do `useListReorder`. Trocar
 * qualquer uma delas por uma arrow no `map` desfaz a medida acima sem alterar
 * uma linha deste componente -- é o tipo de regressão que só o cenário de perf
 * pega.
 */
const LayerRow = memo(function LayerRow({
  sceneId,
  item,
  name,
  selected,
  atFront,
  atBack,
  dropTarget,
  onReorderStart,
}: LayerRowProps) {
  const url = useAssetUrl(item.assetId, "mini");

  const onSelect = (event: MouseEvent) => {
    // Shift soma à seleção, igual ao palco.
    const { select, toggle } = useSelectionStore.getState();

    if (event.shiftKey) toggle(item.id);
    else select([item.id]);
  };

  return (
    <li
      className={cn(
        "flex items-center gap-1 rounded-md p-1",
        selected ? "bg-accent" : "hover:bg-accent/50",
        dropTarget && "ring-primary ring-1",
      )}
    >
      <span
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none px-0.5"
        aria-hidden
        onPointerDown={(event) => onReorderStart(event, item.id)}
      >
        <GripVertical className="size-3.5" />
      </span>

      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        aria-current={selected}
        onClick={onSelect}
      >
        <span className="bg-muted size-8 shrink-0 overflow-hidden rounded">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              className="size-full object-cover"
              draggable={false}
              {...MINIATURA}
              // Mesmo espelho do palco, para a miniatura bater com o que se vê.
              style={
                item.flipX || item.flipY
                  ? { transform: `scale(${item.flipX ? -1 : 1}, ${item.flipY ? -1 : 1})` }
                  : undefined
              }
            />
          ) : null}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">
            {/* Asset apagado deixa o item órfão; o nome some mas a camada continua. */}
            {name ?? "Imagem removida"}
          </span>
          <span className="text-muted-foreground block text-[10px]">
            {Math.round(item.width)} × {Math.round(item.height)}
            {item.rotation ? ` · ${Math.round(item.rotation)}°` : ""}
            {item.locked ? " · travada" : ""}
          </span>
        </span>
      </button>

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Trazer ${name ?? "imagem"} para frente`}
        disabled={atFront}
        onClick={() => useSceneStore.getState().moveItemsZ(sceneId, [item.id], "forward")}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Enviar ${name ?? "imagem"} para trás`}
        disabled={atBack}
        onClick={() => useSceneStore.getState().moveItemsZ(sceneId, [item.id], "backward")}
      >
        <ChevronDown />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={item.locked ? "Destravar" : "Travar"}
        onClick={() => useSceneStore.getState().setItemsLocked(sceneId, [item.id], !item.locked)}
      >
        {item.locked ? <Lock /> : <LockOpen />}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Remover da cena"
        onClick={() => useSceneStore.getState().removeItems(sceneId, [item.id])}
      >
        <Trash2 />
      </Button>
    </li>
  );
});
