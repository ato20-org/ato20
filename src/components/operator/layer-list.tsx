"use client";

import { useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, GripVertical, Lock, LockOpen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAssetList } from "@/hooks/use-asset-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
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

  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const select = useSelectionStore((state) => state.select);
  const toggle = useSelectionStore((state) => state.toggle);

  const moveItemsZ = useSceneStore((state) => state.moveItemsZ);
  const moveItemToIndex = useSceneStore((state) => state.moveItemToIndex);
  const removeItems = useSceneStore((state) => state.removeItems);
  const setItemsLocked = useSceneStore((state) => state.setItemsLocked);

  const names = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset.name])),
    [assets],
  );

  // Frente primeiro. É o inverso de como o palco desenha, de propósito: numa
  // lista, o que está por cima se lê no topo.
  const ordered = useMemo(() => [...scene.items].sort((a, b) => b.z - a.z), [scene.items]);

  const listRef = useRef<HTMLUListElement>(null);
  /** Índice sob o cursor durante o arrasto, para a linha de inserção. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  /**
   * Arrasta a linha para reordenar.
   *
   * O índice de destino sai da altura do cursor sobre a lista, não de qual
   * linha recebeu o evento: com `setPointerCapture`, todos os eventos vão para
   * a linha de origem, e ela nunca saberia sobre quem está passando.
   */
  function startReorder(event: ReactPointerEvent, itemId: string) {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement;
    const { pointerId } = event;
    target.setPointerCapture(pointerId);

    const indexFor = (clientY: number): number => {
      const rows = [...(listRef.current?.children ?? [])] as HTMLElement[];
      if (rows.length === 0) return 0;

      for (const [index, row] of rows.entries()) {
        const rect = row.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return index;
      }

      return rows.length - 1;
    };

    const handleMove = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;

      setDropIndex(indexFor(native.clientY));
    };

    const handleEnd = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;

      target.releasePointerCapture(pointerId);
      target.removeEventListener("pointermove", handleMove);
      target.removeEventListener("pointerup", handleEnd);
      target.removeEventListener("pointercancel", handleEnd);

      moveItemToIndex(scene.id, itemId, indexFor(native.clientY));
      setDropIndex(null);
    };

    target.addEventListener("pointermove", handleMove);
    target.addEventListener("pointerup", handleEnd);
    target.addEventListener("pointercancel", handleEnd);
  }

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
          Nada na cena. Envie uma imagem acima e clique no <span className="font-medium">+</span>.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul ref={listRef} className="space-y-0.5 px-2 pb-2">
            {ordered.map((item, index) => (
              <LayerRow
                key={item.id}
                item={item}
                name={names.get(item.assetId)}
                selected={selectedIds.includes(item.id)}
                atFront={index === 0}
                atBack={index === ordered.length - 1}
                dropTarget={dropIndex === index}
                onReorderStart={(event) => startReorder(event, item.id)}
                onSelect={(event) => {
                  // Shift soma à seleção, igual ao palco.
                  if (event.shiftKey) toggle(item.id);
                  else select([item.id]);
                }}
                onForward={() => moveItemsZ(scene.id, [item.id], "forward")}
                onBackward={() => moveItemsZ(scene.id, [item.id], "backward")}
                onToggleLock={() => setItemsLocked(scene.id, [item.id], !item.locked)}
                onRemove={() => removeItems(scene.id, [item.id])}
              />
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}

type LayerRowProps = {
  item: CanvasItem;
  name: string | undefined;
  selected: boolean;
  atFront: boolean;
  atBack: boolean;
  /** Linha onde o item arrastado cairia. */
  dropTarget: boolean;
  onReorderStart: (event: ReactPointerEvent) => void;
  onSelect: (event: MouseEvent) => void;
  onForward: () => void;
  onBackward: () => void;
  onToggleLock: () => void;
  onRemove: () => void;
};

function LayerRow({
  item,
  name,
  selected,
  atFront,
  atBack,
  dropTarget,
  onReorderStart,
  onSelect,
  onForward,
  onBackward,
  onToggleLock,
  onRemove,
}: LayerRowProps) {
  const url = useAssetUrl(item.assetId);

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
        onPointerDown={onReorderStart}
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
        onClick={onForward}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Enviar ${name ?? "imagem"} para trás`}
        disabled={atBack}
        onClick={onBackward}
      >
        <ChevronDown />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={item.locked ? "Destravar" : "Travar"}
        onClick={onToggleLock}
      >
        {item.locked ? <Lock /> : <LockOpen />}
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="Remover da cena" onClick={onRemove}>
        <Trash2 />
      </Button>
    </li>
  );
}
