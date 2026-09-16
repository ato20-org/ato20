"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Crosshair,
  FolderClosed,
  FolderPlus,
  Group,
  Lock,
  LockOpen,
  MoreVertical,
  MousePointerSquareDashed,
  TextCursorInput,
  Trash2,
  Ungroup,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { aoApertarF2, useRenomearPeloMenu } from "@/hooks/use-renomear-pelo-menu";
import { useAssetList } from "@/hooks/use-asset-list";
import { useCharacters } from "@/hooks/use-characters";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useListReorder } from "@/hooks/use-list-reorder";
import {
  agruparSelecao,
  itensDoGrupo,
  selecionarGrupo,
} from "@/lib/mestre/item-actions";
import { MINIATURA } from "@/lib/miniatura";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { cn } from "@/lib/utils";
import type { CanvasItem, Grupo, Scene } from "@/types/scene";

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
    () =>
      new Map(
        (personagens ?? []).map((personagem) => [
          personagem.id,
          personagem.nome,
        ]),
      ),
    [personagens],
  );

  const nomeDe = (item: CanvasItem) =>
    (item.personagemId ? porPersonagem.get(item.personagemId) : undefined) ??
    names.get(item.assetId);

  // Frente primeiro. É o inverso de como o palco desenha, de propósito: numa
  // lista, o que está por cima se lê no topo.
  const ordered = useMemo(
    () => [...scene.items].sort((a, b) => b.z - a.z),
    [scene.items],
  );

  /**
   * A árvore achatada em linhas, na ordem em que aparecem.
   *
   * Grupo entra onde está o item mais à frente dele: a lista continua sendo
   * "frente no topo", e o grupo se lê no lugar do primeiro item seu. Grupo
   * recolhido esconde as linhas de dentro, mas continua contando.
   *
   * Achatada porque `useListReorder` mede o índice pelo `children` do `ul`, e
   * uma lista aninhada não teria índice único. Indentação é `padding`.
   */
  const linhas = useMemo(
    () => achatar(scene, ordered, selectedIds),
    [scene, ordered, selectedIds],
  );

  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (arrastado, index) => {
      const store = useSceneStore.getState();

      // Pasta arrastada: só muda de mãe. Sobre um cabeçalho entra nele; sobre
      // um item, vai para a pasta do item; abaixo de tudo, sai para a raiz. O
      // store recusa ciclo.
      if (arrastado.startsWith(PREFIXO_PASTA)) {
        const grupoId = arrastado.slice(PREFIXO_PASTA.length);
        const alvo = linhas[index];
        const destino = !alvo
          ? undefined
          : alvo.tipo === "grupo"
            ? alvo.grupo.id
            : alvo.item.grupoId;

        if (destino !== grupoId) store.moverGrupo(scene.id, grupoId, destino);
        return;
      }

      // Arrastou um dos selecionados: vão TODOS, na ordem em que estão na
      // pilha. Arrastou outro: só ele, e a seleção fica onde estava. É a
      // mesma regra do painel de imagens.
      const selecao = useSelectionStore.getState().selectedIds;
      const juntos = selecao.includes(arrastado) ? selecao : [arrastado];

      // Abaixo da última linha: fora de toda pasta, no fundo da pilha. É como
      // se tira algo de uma pasta quando não há item solto para soltar em
      // cima -- arrasta para o vazio embaixo, como no Figma.
      if (index >= linhas.length) {
        store.soltarItens(scene.id, juntos, undefined, null);
        return;
      }

      // O índice é da lista VISÍVEL. A linha onde caiu diz em que pasta os
      // arrastados entram e acima de quem eles ficam.
      const alvo = linhas[index];
      if (!alvo) return;

      if (alvo.tipo === "grupo") {
        // Caiu sobre um cabeçalho: entram na pasta, na frente do que há nela.
        store.soltarItens(
          scene.id,
          juntos,
          alvo.grupo.id,
          alvo.primeiroItemId ?? null,
        );
        return;
      }

      // Caiu sobre um item: assumem a pasta dele e o lugar dele.
      store.soltarItens(
        scene.id,
        juntos,
        alvo.item.grupoId,
        alvo.item.id,
      );
    },
    // A linha SOB o cursor, e não a fresta entre duas: soltar em cima da pasta
    // é entrar nela. Ver `ModoDeAlvo`.
    "sobre",
  );

  /**
   * Clique numa linha, com as convenções de qualquer lista de arquivos:
   * simples troca a seleção, Ctrl soma ou tira um, Shift pega o trecho entre o
   * último clicado e este, na ordem em que a lista mostra.
   *
   * A âncora do Shift vive numa ref e o handler é estável: ele desce como
   * prop para cada linha, e uma função nova por render quebraria o `memo`
   * delas. Ver a nota em `LayerRow`.
   */
  const ancora = useRef<string | null>(null);
  const linhasRef = useRef(linhas);
  useEffect(() => {
    linhasRef.current = linhas;
  }, [linhas]);

  const onSelectRow = useCallback((itemId: string, event: MouseEvent) => {
    const { select, toggle, selectedIds: atuais } =
      useSelectionStore.getState();

    if (event.shiftKey && ancora.current) {
      const visiveis = linhasRef.current.flatMap((linha) =>
        linha.tipo === "item" ? [linha.item.id] : [],
      );
      const a = visiveis.indexOf(ancora.current);
      const b = visiveis.indexOf(itemId);
      if (a !== -1 && b !== -1) {
        const trecho = visiveis.slice(Math.min(a, b), Math.max(a, b) + 1);
        select([...new Set([...atuais, ...trecho])]);
        return;
      }
    }

    ancora.current = itemId;

    if (event.ctrlKey || event.metaKey) toggle(itemId);
    else select([itemId]);
  }, []);

  function novaPasta() {
    const ordem = (scene.grupos?.length ?? 0) + 1;
    useSceneStore.getState().criarGrupo(scene.id, `Pasta ${ordem}`, []);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-xs font-medium">Em cena</span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[10px]">
          {ordered.length > 0 ? `${ordered.length} · frente no topo` : null}
        </span>
        {/* Pasta vazia, para arrastar itens para dentro depois. É o outro
            caminho além de "selecionar e Ctrl+G": quem organiza antes de
            povoar começa pela pasta. */}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Nova pasta"
          disabled={ordered.length === 0}
          onClick={() => novaPasta()}
        >
          <FolderPlus />
        </Button>
      </div>

      {ordered.length === 0 ? (
        <p className="text-muted-foreground px-3 pb-3 text-xs">
          Nada na cena. Importe uma imagem acima e clique no{" "}
          <span className="font-medium">+</span>.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {/* O fundo da lista, e SÓ ele, é o gatilho do menu de contexto.
              Envolver as linhas fazia o menu de três pontos de cada pasta
              parar de funcionar: um `Menu.Root` dentro de um
              `ContextMenu.Trigger` passa a se achar filho do menu de
              contexto, e os itens dele deixam de disparar. O próprio base-ui
              tem uma guarda com esse nome. */}
          <div className="relative min-h-full">
            <ContextMenu>
              <ContextMenuTrigger
                render={<div className="absolute inset-0" aria-hidden />}
              />

              <ContextMenuContent>
                <ContextMenuItem onClick={() => novaPasta()}>
                  <FolderPlus />
                  Nova pasta
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={selectedIds.length === 0}
                  onClick={() => void agruparSelecao()}
                >
                  <Group />
                  {selectedIds.length > 1
                    ? `Nova pasta com os ${selectedIds.length} selecionados`
                    : "Nova pasta com o selecionado"}
                  <ContextMenuShortcut>Ctrl+G</ContextMenuShortcut>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>

          <ul ref={listRef} className="relative z-10 space-y-0.5 px-2 pb-2">
            {linhas.map((linha, index) =>
              linha.tipo === "grupo" ? (
                <GroupRow
                  key={linha.grupo.id}
                  sceneId={scene.id}
                  grupo={linha.grupo}
                  grupos={scene.grupos ?? []}
                  depth={linha.depth}
                  total={linha.total}
                  selected={linha.todosSelecionados}
                  dropTarget={dropIndex === index}
                  onReorderStart={startReorder}
                />
              ) : (
                <LayerRow
                  key={linha.item.id}
                  sceneId={scene.id}
                  item={linha.item}
                  depth={linha.depth}
                  name={nomeDe(linha.item)}
                  selected={selectedIds.includes(linha.item.id)}
                  atFront={linha.item.id === ordered[0]?.id}
                  atBack={linha.item.id === ordered[ordered.length - 1]?.id}
                  dropTarget={dropIndex === index}
                  onReorderStart={startReorder}
                  onSelect={onSelectRow}
                />
              ),
            )}
          </ul>

          {/* O vazio abaixo da lista é alvo: soltar aqui tira da pasta. Só se
              anuncia durante o arrasto, quando importa saber. */}
          <div
            className={cn(
              "mx-2 mb-2 min-h-8 rounded-md",
              dropIndex === linhas.length &&
                "ring-primary/60 bg-primary/10 ring-1",
            )}
          >
            {dropIndex === linhas.length ? (
              <p className="text-muted-foreground px-2 py-2 text-[10px]">
                Solte aqui para tirar da pasta
              </p>
            ) : null}
          </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

type Linha =
  | {
      tipo: "grupo";
      grupo: Grupo;
      depth: number;
      /** Quantos itens há dentro, subgrupos incluídos. */
      total: number;
      /** O item mais à frente dentro dele, para "cair no cabeçalho" saber onde. */
      primeiroItemId: string | undefined;
      todosSelecionados: boolean;
    }
  | { tipo: "item"; item: CanvasItem; depth: number };

/** Ver a nota em `linhas`. `ordered` é frente primeiro. */
function achatar(
  scene: Scene,
  ordered: CanvasItem[],
  selectedIds: string[],
): Linha[] {
  const grupos = scene.grupos ?? [];
  const selecionados = new Set(selectedIds);
  const linhas: Linha[] = [];

  /** Posição na ordem do item mais à frente de um grupo, descendentes incluídos. */
  const frenteDe = new Map<string, number>();
  for (const grupo of grupos) {
    const ids = new Set(itensDoGrupo(scene, grupo.id));
    const indice = ordered.findIndex((item) => ids.has(item.id));
    frenteDe.set(grupo.id, indice === -1 ? Number.MAX_SAFE_INTEGER : indice);
  }

  function nivel(parentId: string | undefined, depth: number) {
    // Os filhos diretos deste nível: subgrupos e itens soltos nele, na ordem
    // da frente para o fundo, misturados.
    const entradas: Array<{ pos: number; linha: () => void }> = [];

    for (const grupo of grupos) {
      if (grupo.parentId !== parentId) continue;
      entradas.push({
        pos: frenteDe.get(grupo.id) ?? Number.MAX_SAFE_INTEGER,
        linha: () => {
          const ids = itensDoGrupo(scene, grupo.id);
          const pos = frenteDe.get(grupo.id) ?? -1;
          linhas.push({
            tipo: "grupo",
            grupo,
            depth,
            total: ids.length,
            primeiroItemId: ordered[pos]?.id,
            todosSelecionados:
              ids.length > 0 && ids.every((id) => selecionados.has(id)),
          });
          if (!grupo.recolhido) nivel(grupo.id, depth + 1);
        },
      });
    }

    ordered.forEach((item, pos) => {
      if ((item.grupoId ?? undefined) !== parentId) return;
      // Item cujo grupo não existe mais cai na raiz, em vez de sumir da lista.
      if (item.grupoId && !grupos.some((grupo) => grupo.id === item.grupoId))
        return;
      entradas.push({
        pos,
        linha: () => linhas.push({ tipo: "item", item, depth }),
      });
    });

    if (parentId === undefined)
      ordered.forEach((item, pos) => {
        if (item.grupoId && !grupos.some((grupo) => grupo.id === item.grupoId))
          entradas.push({
            pos,
            linha: () => linhas.push({ tipo: "item", item, depth }),
          });
      });

    entradas.sort((a, b) => a.pos - b.pos).forEach((entrada) => entrada.linha());
  }

  nivel(undefined, 0);

  return linhas;
}

/** Recuo por nível, em pixels. */
const RECUO_PX = 14;

/**
 * Quanto o ponteiro anda antes de a linha inteira virar arrasto. Abaixo disso
 * é clique, e clique seleciona. Ver `useListReorder`.
 */
const LIMIAR_ARRASTO_PX = 5;

/** Id de arrasto de uma pasta na lista, para não colidir com id de item. */
const PREFIXO_PASTA = "pasta:";

type GroupRowProps = {
  sceneId: string;
  grupo: Grupo;
  /** Todas, para o "Mover para" listar destinos. */
  grupos: Grupo[];
  depth: number;
  total: number;
  /** Todos os itens dela estão selecionados: a linha acende. */
  selected: boolean;
  dropTarget: boolean;
  onReorderStart: (
    event: ReactPointerEvent,
    id: string,
    limiar?: number,
  ) => void;
};

/** A pasta e todas as descendentes dela, por id. Espelha a do acervo. */
function descendentes(grupos: Grupo[], id: string): string[] {
  const ids = [id];
  let cresceu = true;

  while (cresceu) {
    cresceu = false;
    for (const grupo of grupos) {
      if (
        grupo.parentId &&
        ids.includes(grupo.parentId) &&
        !ids.includes(grupo.id)
      ) {
        ids.push(grupo.id);
        cresceu = true;
      }
    }
  }

  return ids;
}

/**
 * O cabeçalho de uma pasta da cena, com a mesma cara da pasta do acervo:
 * seta, ícone de pasta, nome, contagem e o menu de três pontos que só aparece
 * no hover. Duas listas no mesmo painel com pastas diferentes seriam duas
 * coisas para aprender.
 *
 * O que muda é o clique no nome: aqui SELECIONA tudo dela no palco, e daí o
 * gizmo de grupo move, escala e gira. A seta recolhe só na lista; no mapa
 * nada muda. A alça da esquerda arrasta a pasta inteira para dentro de outra.
 */
function GroupRow({
  sceneId,
  grupo,
  grupos,
  depth,
  total,
  selected,
  dropTarget,
  onReorderStart,
}: GroupRowProps) {
  const [renomeando, setRenomeando] = useState(false);
  const renomear = useRenomearPeloMenu(() => setRenomeando(true));

  // Destinos válidos: nem ela, nem quem já é a mãe, nem descendente dela.
  const proibidos = new Set(descendentes(grupos, grupo.id));
  const destinos = grupos.filter(
    (outra) => !proibidos.has(outra.id) && outra.id !== grupo.parentId,
  );

  function confirmar(nome: string) {
    const limpo = nome.trim();
    if (limpo && limpo !== grupo.nome)
      useSceneStore.getState().atualizarGrupo(sceneId, grupo.id, { nome: limpo });
    setRenomeando(false);
  }

  function cenaAtual() {
    return useSceneStore
      .getState()
      .board?.scenes.find((cena) => cena.id === sceneId);
  }

  function seguirComCamera() {
    const scene = cenaAtual();
    if (scene) useCameraLockStore.getState().prenderEm(itensDoGrupo(scene, grupo.id));
  }

  function novaSubpasta() {
    const ordem = (cenaAtual()?.grupos?.length ?? 0) + 1;
    useSceneStore.getState().atualizarGrupo(sceneId, grupo.id, { recolhido: false });
    useSceneStore.getState().criarGrupo(sceneId, `Pasta ${ordem}`, [], grupo.id);
  }

  return (
    <li
      className={cn(
        "group flex cursor-grab touch-none items-center gap-1 rounded-md p-1",
        selected ? "bg-accent" : "hover:bg-accent/50",
        dropTarget && "ring-primary ring-1",
      )}
      style={{ paddingLeft: 4 + depth * RECUO_PX }}
      // A linha inteira arrasta, como a imagem no acervo. Botões param a
      // propagação para o toque neles não virar começo de arrasto.
      onPointerDown={(event) =>
        onReorderStart(
          event,
          `${PREFIXO_PASTA}${grupo.id}`,
          LIMIAR_ARRASTO_PX,
        )
      }
    >
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={grupo.recolhido ? `Abrir ${grupo.nome}` : `Fechar ${grupo.nome}`}
        aria-expanded={!grupo.recolhido}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() =>
          useSceneStore
            .getState()
            .atualizarGrupo(sceneId, grupo.id, { recolhido: !grupo.recolhido })
        }
      >
        {grupo.recolhido ? <ChevronRight /> : <ChevronDown />}
      </Button>

      <FolderClosed
        className="text-muted-foreground size-3.5 shrink-0"
        aria-hidden
      />

      {renomeando ? (
        <input
          autoFocus
          defaultValue={grupo.nome}
          className="bg-background h-6 min-w-0 flex-1 rounded px-1.5 text-xs outline-none"
          aria-label="Nome da pasta"
          onPointerDown={(event) => event.stopPropagation()}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => confirmar(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") confirmar(event.currentTarget.value);
            if (event.key === "Escape") setRenomeando(false);
            event.stopPropagation();
          }}
        />
      ) : (
        <>
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-xs font-medium"
            aria-current={selected}
            title="Clique seleciona tudo dela no palco. Ctrl soma. Duplo clique renomeia."
            onClick={(event) => {
              if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
                selecionarGrupo(grupo.id);
                return;
              }
              // Ctrl ou Shift: soma a pasta à seleção que já existe.
              const scene = cenaAtual();
              if (!scene) return;
              const { select, selectedIds } = useSelectionStore.getState();
              select([
                ...new Set([...selectedIds, ...itensDoGrupo(scene, grupo.id)]),
              ]);
            }}
            onDoubleClick={() => setRenomeando(true)}
            onKeyDown={aoApertarF2(() => setRenomeando(true))}
          >
            {grupo.nome}
          </button>
          <span className="text-muted-foreground text-[10px] tabular-nums">
            {total}
          </span>

          <DropdownMenu onOpenChangeComplete={renomear.aoFechar}>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Opções de ${grupo.nome}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  // Escondido até o ponteiro chegar ou o foco entrar, como no
                  // acervo: três pontos em cada linha viram ruído.
                  className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[popup-open]:opacity-100"
                >
                  <MoreVertical />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={novaSubpasta}>
                <FolderPlus />
                Nova subpasta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={renomear.pedir}>
                <TextCursorInput />
                Renomear
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => selecionarGrupo(grupo.id)}>
                <MousePointerSquareDashed />
                Selecionar tudo dela
              </DropdownMenuItem>
              <DropdownMenuItem disabled={total === 0} onClick={seguirComCamera}>
                <Crosshair />
                Câmera segue esta pasta
              </DropdownMenuItem>

              {destinos.length > 0 || grupo.parentId ? (
                <>
                  <DropdownMenuSeparator />
                  {grupo.parentId ? (
                    <DropdownMenuItem
                      onClick={() =>
                        useSceneStore
                          .getState()
                          .moverGrupo(sceneId, grupo.id, undefined)
                      }
                    >
                      <FolderClosed />
                      Tirar para a raiz
                    </DropdownMenuItem>
                  ) : null}
                  {destinos.map((outra) => (
                    <DropdownMenuItem
                      key={outra.id}
                      onClick={() =>
                        useSceneStore
                          .getState()
                          .moverGrupo(sceneId, grupo.id, outra.id)
                      }
                    >
                      <FolderClosed />
                      <span className="truncate">Mover para {outra.nome}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}

              <DropdownMenuSeparator />

              {/* Desfazer a pasta solta o que há dentro um nível acima. Nunca
                  apaga item: é organização, não remoção. */}
              <DropdownMenuItem
                onClick={() =>
                  useSceneStore.getState().removerGrupo(sceneId, grupo.id)
                }
              >
                <Ungroup />
                Desfazer pasta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </li>
  );
}

type LayerRowProps = {
  sceneId: string;
  item: CanvasItem;
  /** Nível na árvore de grupos. 0 = raiz. */
  depth: number;
  name: string | undefined;
  selected: boolean;
  atFront: boolean;
  atBack: boolean;
  /** Linha onde o item arrastado cairia. */
  dropTarget: boolean;
  /** O do `useListReorder`, cru: ele é estável, e a linha passa o próprio id. */
  onReorderStart: (
    event: ReactPointerEvent,
    itemId: string,
    limiar?: number,
  ) => void;
  /** Estável também, pela mesma razão. Ver `onSelectRow`. */
  onSelect: (itemId: string, event: MouseEvent) => void;
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
  depth,
  name,
  selected,
  atFront,
  atBack,
  dropTarget,
  onReorderStart,
  onSelect,
}: LayerRowProps) {
  const url = useAssetUrl(item.assetId, "mini");

  return (
    <li
      className={cn(
        "flex cursor-grab touch-none items-center gap-1 rounded-md p-1",
        selected ? "bg-accent" : "hover:bg-accent/50",
        dropTarget && "ring-primary ring-1",
      )}
      style={depth > 0 ? { paddingLeft: 4 + depth * RECUO_PX } : undefined}
      // A linha inteira arrasta, como a imagem no acervo: pegar em qualquer
      // lugar e largar onde quer que fique. O que fica acima na lista fica
      // acima no mapa. Um toque sem andar continua sendo selecionar.
      onPointerDown={(event) =>
        onReorderStart(event, item.id, LIMIAR_ARRASTO_PX)
      }
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        aria-current={selected}
        onClick={(event) => onSelect(item.id, event)}
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
                  ? {
                      transform: `scale(${item.flipX ? -1 : 1}, ${item.flipY ? -1 : 1})`,
                    }
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
        onPointerDown={(event) => event.stopPropagation()}
        disabled={atFront}
        onClick={() =>
          useSceneStore.getState().moveItemsZ(sceneId, [item.id], "forward")
        }
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Enviar ${name ?? "imagem"} para trás`}
        onPointerDown={(event) => event.stopPropagation()}
        disabled={atBack}
        onClick={() =>
          useSceneStore.getState().moveItemsZ(sceneId, [item.id], "backward")
        }
      >
        <ChevronDown />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={item.locked ? "Destravar" : "Travar"}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() =>
          useSceneStore
            .getState()
            .setItemsLocked(sceneId, [item.id], !item.locked)
        }
      >
        {item.locked ? <Lock /> : <LockOpen />}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Remover da cena"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => useSceneStore.getState().removeItems(sceneId, [item.id])}
      >
        <Trash2 />
      </Button>
    </li>
  );
});
