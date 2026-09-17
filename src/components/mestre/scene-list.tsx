"use client";

import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  CopyPlus,
  FolderClosed,
  FolderPlus,
  GripVertical,
  Image as ImageIcon,
  ImageOff,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Radio,
  TextCursorInput,
  Trash2,
  Ungroup,
} from "lucide-react";

import { toast } from "sonner";

import { ScenePreview } from "@/components/playground/scene-preview";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useListReorder } from "@/hooks/use-list-reorder";
import {
  aoApertarF2,
  useRenomearPeloMenu,
} from "@/hooks/use-renomear-pelo-menu";
import {
  escolherFundoDaCena,
  useFundoEmVoo,
  tirarFundoDaCena,
} from "@/lib/mestre/scene-background";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { cn } from "@/lib/utils";
import { ehQuadro, type Pasta, type Scene } from "@/types/scene";

/**
 * A lista de cenas de UM tipo: os mapas numa aba, os quadros na outra.
 *
 * Uma lista só no board e duas telas, e não duas listas: o palco, o histórico
 * e a gravação já sabem lidar com `board.scenes`, e separar os quadros num
 * campo próprio duplicaria os três. O que separa as abas é o filtro. Ver
 * `TipoDeCena`.
 */
export function SceneList({
  tipo,
  ready,
}: {
  tipo: "mapa" | "quadro";
  ready: boolean;
}) {
  const todas = useSceneStore((state) => state.board?.scenes);
  const pastas = useSceneStore((state) => state.board?.pastas);
  const quadro = tipo === "quadro";
  const scenes = useMemo(
    () => todas?.filter((scene) => ehQuadro(scene) === quadro),
    [todas, quadro],
  );
  const editingSceneId = useSceneStore((state) => state.board?.editingSceneId);
  const liveSceneId = useSceneStore((state) => state.board?.liveSceneId);
  const setEditingSceneId = useSceneStore((state) => state.setEditingSceneId);
  const setLiveSceneId = useSceneStore((state) => state.setLiveSceneId);
  const addScene = useSceneStore((state) => state.addScene);
  const clearSelection = useSelectionStore((state) => state.clear);
  const fitViewport = useViewportStore((state) => state.fit);

  const [renamingId, setRenamingId] = useState<string | null>(null);

  /**
   * As linhas, na ordem em que aparecem. Mapa é lista rasa; quadro é árvore
   * de pastas, achatada porque `useListReorder` mede o índice pelo `children`
   * do `ul`. Ver `achatar`.
   */
  const linhas = useMemo<Linha[]>(
    () =>
      quadro
        ? achatar(scenes ?? [], pastas ?? [])
        : (scenes ?? []).map((scene) => ({ tipo: "cena", scene, depth: 0 })),
    [quadro, scenes, pastas],
  );

  const moveSceneToIndex = useSceneStore((state) => state.moveSceneToIndex);
  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (arrastado, index) => {
      if (!todas) return;
      const store = useSceneStore.getState();
      const alvo = linhas[index];

      // Pasta arrastada: só muda de mãe. Sobre outra pasta entra nela; sobre
      // um quadro, vai para a pasta dele; abaixo de tudo, sai para a raiz.
      if (arrastado.startsWith(PREFIXO_PASTA)) {
        const pastaId = arrastado.slice(PREFIXO_PASTA.length);
        const destino = !alvo
          ? undefined
          : alvo.tipo === "pasta"
            ? alvo.pasta.id
            : alvo.scene.pastaId;
        if (destino !== pastaId) store.moverPasta(pastaId, destino);
        return;
      }

      // Cena sobre uma pasta: entra nela e fica por último.
      if (alvo?.tipo === "pasta") {
        store.moverParaPasta(arrastado, alvo.pasta.id);
        store.moveSceneToIndex(arrastado, todas.length - 1);
        return;
      }

      // O índice é desta lista; o board tem mapas e quadros misturados. O
      // destino é "o lugar de quem está nessa linha", e depois de todas quando
      // cai no fim. Em quadro, assume também a pasta de quem está lá.
      if (quadro) store.moverParaPasta(arrastado, alvo?.scene.pastaId);
      const destino = alvo
        ? todas.findIndex((scene) => scene.id === alvo.scene.id)
        : todas.length - 1;
      moveSceneToIndex(arrastado, destino);
    },
    // Quadro: a linha SOB o cursor, porque soltar em cima da pasta é entrar
    // nela. Mapa: a fresta entre duas, como sempre foi.
    quadro ? "sobre" : "inserir",
  );

  function novaPasta() {
    const ordem = (pastas?.length ?? 0) + 1;
    useSceneStore.getState().criarPasta(`Pasta ${ordem}`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 p-2">
        <Button
          className="min-w-0 flex-1"
          variant="outline"
          size="sm"
          onClick={() => addScene(undefined, quadro ? "quadro" : undefined)}
          disabled={!ready}
        >
          <Plus />
          {quadro ? "Novo quadro" : "Nova cena"}
        </Button>
        {quadro ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Nova pasta"
                  disabled={!ready}
                  onClick={novaPasta}
                >
                  <FolderPlus />
                </Button>
              }
            />
            <TooltipContent>Nova pasta. Arraste quadros para dentro.</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <ul ref={listRef} className="space-y-1 p-2 pt-0">
          {linhas.map((linha, index) =>
            linha.tipo === "pasta" ? (
              <PastaRow
                key={linha.pasta.id}
                pasta={linha.pasta}
                pastas={pastas ?? []}
                depth={linha.depth}
                total={linha.total}
                dropTarget={dropIndex === index}
                onReorderStart={startReorder}
              />
            ) : (
              <SceneRow
                key={linha.scene.id}
                scene={linha.scene}
                depth={linha.depth}
                onStage={linha.scene.id === editingSceneId}
                live={linha.scene.id === liveSceneId}
                dropTarget={dropIndex === index}
                onReorderStart={(event) => startReorder(event, linha.scene.id)}
                renaming={renamingId === linha.scene.id}
                onRename={() => setRenamingId(linha.scene.id)}
                onRenameDone={() => setRenamingId(null)}
                onGoLive={() => setLiveSceneId(linha.scene.id)}
                onOpen={() => {
                  setEditingSceneId(linha.scene.id);
                  // Seleção é por cena: manter itens da cena anterior
                  // selecionados deixaria o gizmo apontando pro vazio.
                  clearSelection();
                  // Zoom também: o recorte de um mapa não diz nada sobre o outro.
                  fitViewport();
                }}
              />
            ),
          )}
        </ul>

        {/* O vazio abaixo da lista é alvo: soltar aqui tira da pasta. Só se
            anuncia durante o arrasto, quando importa saber. */}
        {quadro ? (
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
        ) : null}
      </ScrollArea>
    </div>
  );
}

type Linha =
  | {
      tipo: "pasta";
      pasta: Pasta;
      depth: number;
      /** Quantos quadros há dentro, subpastas incluídas. */
      total: number;
    }
  | { tipo: "cena"; scene: Scene; depth: number };

/** Recuo por nível, em pixels. O mesmo da lista de camadas. */
const RECUO_PX = 14;

/** Id de arrasto de uma pasta, para não colidir com id de cena. */
const PREFIXO_PASTA = "pasta:";

/**
 * A árvore de pastas achatada em linhas. Em cada nível, as pastas primeiro e
 * depois os quadros soltos, na ordem do board. Pasta recolhida esconde as
 * linhas de dentro, mas continua contando. Quadro cuja pasta sumiu cai na raiz
 * em vez de sumir da lista.
 */
function achatar(scenes: Scene[], pastas: Pasta[]): Linha[] {
  const linhas: Linha[] = [];
  const existe = new Set(pastas.map((pasta) => pasta.id));

  const pastaDe = (scene: Scene) =>
    scene.pastaId && existe.has(scene.pastaId) ? scene.pastaId : undefined;

  function contar(pastaId: string): number {
    let total = scenes.filter((scene) => pastaDe(scene) === pastaId).length;
    for (const filha of pastas)
      if (filha.parentId === pastaId) total += contar(filha.id);
    return total;
  }

  function nivel(parentId: string | undefined, depth: number) {
    for (const pasta of pastas) {
      if (pasta.parentId !== parentId) continue;
      linhas.push({ tipo: "pasta", pasta, depth, total: contar(pasta.id) });
      if (!pasta.recolhido) nivel(pasta.id, depth + 1);
    }
    for (const scene of scenes)
      if (pastaDe(scene) === parentId)
        linhas.push({ tipo: "cena", scene, depth });
  }

  nivel(undefined, 0);

  return linhas;
}

/** A pasta e todas as descendentes dela, por id. Espelha a da lista de camadas. */
function descendentes(pastas: Pasta[], id: string): string[] {
  const ids = [id];
  let cresceu = true;

  while (cresceu) {
    cresceu = false;
    for (const pasta of pastas) {
      if (
        pasta.parentId &&
        ids.includes(pasta.parentId) &&
        !ids.includes(pasta.id)
      ) {
        ids.push(pasta.id);
        cresceu = true;
      }
    }
  }

  return ids;
}

/**
 * O cabeçalho de uma pasta de quadros, com a cara da pasta da lista de
 * camadas: seta, ícone, nome, contagem e o menu que só aparece no hover. A
 * linha inteira arrasta para dentro de outra pasta.
 */
function PastaRow({
  pasta,
  pastas,
  depth,
  total,
  dropTarget,
  onReorderStart,
}: {
  pasta: Pasta;
  /** Todas, para o "Mover para" listar destinos. */
  pastas: Pasta[];
  depth: number;
  total: number;
  dropTarget: boolean;
  onReorderStart: (
    event: ReactPointerEvent,
    id: string,
    limiar?: number,
  ) => void;
}) {
  const [renomeando, setRenomeando] = useState(false);
  const renomear = useRenomearPeloMenu(() => setRenomeando(true));

  // Destinos válidos: nem ela, nem quem já é a mãe, nem descendente dela.
  const proibidos = new Set(descendentes(pastas, pasta.id));
  const destinos = pastas.filter(
    (outra) => !proibidos.has(outra.id) && outra.id !== pasta.parentId,
  );

  function confirmar(nome: string) {
    const limpo = nome.trim();
    if (limpo && limpo !== pasta.nome)
      useSceneStore.getState().atualizarPasta(pasta.id, { nome: limpo });
    setRenomeando(false);
  }

  function novaSubpasta() {
    const store = useSceneStore.getState();
    const ordem = (store.board?.pastas?.length ?? 0) + 1;
    store.atualizarPasta(pasta.id, { recolhido: false });
    store.criarPasta(`Pasta ${ordem}`, pasta.id);
  }

  return (
    <li
      className={cn(
        "group hover:bg-accent/50 flex cursor-grab touch-none items-center gap-1 rounded-md p-1",
        dropTarget && "ring-primary ring-1",
      )}
      style={{ paddingLeft: 4 + depth * RECUO_PX }}
      onPointerDown={(event) =>
        onReorderStart(event, `${PREFIXO_PASTA}${pasta.id}`, LIMIAR_ARRASTO_PX)
      }
    >
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={pasta.recolhido ? `Abrir ${pasta.nome}` : `Fechar ${pasta.nome}`}
        aria-expanded={!pasta.recolhido}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() =>
          useSceneStore
            .getState()
            .atualizarPasta(pasta.id, { recolhido: !pasta.recolhido })
        }
      >
        {pasta.recolhido ? <ChevronRight /> : <ChevronDown />}
      </Button>

      <FolderClosed
        className="text-muted-foreground size-3.5 shrink-0"
        aria-hidden
      />

      {renomeando ? (
        <input
          autoFocus
          defaultValue={pasta.nome}
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
            title="Duplo clique renomeia."
            onClick={() =>
              useSceneStore
                .getState()
                .atualizarPasta(pasta.id, { recolhido: !pasta.recolhido })
            }
            onDoubleClick={() => setRenomeando(true)}
            onKeyDown={aoApertarF2(() => setRenomeando(true))}
          >
            {pasta.nome}
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
                  aria-label={`Opções de ${pasta.nome}`}
                  onPointerDown={(event) => event.stopPropagation()}
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

              {destinos.length > 0 || pasta.parentId ? (
                <>
                  <DropdownMenuSeparator />
                  {pasta.parentId ? (
                    <DropdownMenuItem
                      onClick={() =>
                        useSceneStore.getState().moverPasta(pasta.id, undefined)
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
                        useSceneStore.getState().moverPasta(pasta.id, outra.id)
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
                  apaga quadro: é organização, não remoção. */}
              <DropdownMenuItem
                onClick={() => useSceneStore.getState().removerPasta(pasta.id)}
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

/**
 * Quanto o ponteiro anda antes de a linha inteira da pasta virar arrasto.
 * Abaixo disso é clique, e clique recolhe. Ver `useListReorder`.
 */
const LIMIAR_ARRASTO_PX = 5;

type SceneRowProps = {
  scene: Scene;
  /** Nível na árvore de pastas. Zero nos mapas, que não têm pasta. */
  depth: number;
  /** Aberta no palco do Mestre. */
  onStage: boolean;
  /** Sendo exibida para a mesa. */
  live: boolean;
  /** Linha onde a cena arrastada cairia. */
  dropTarget: boolean;
  onReorderStart: (event: ReactPointerEvent) => void;
  renaming: boolean;
  onRename: () => void;
  onRenameDone: () => void;
  onGoLive: () => void;
  onOpen: () => void;
};

function SceneRow({
  scene,
  depth,
  onStage,
  live,
  dropTarget,
  onReorderStart,
  renaming,
  onRename,
  onRenameDone,
  onGoLive,
  onOpen,
}: SceneRowProps) {
  const renameScene = useSceneStore((state) => state.renameScene);
  const duplicateScene = useSceneStore((state) => state.duplicateScene);
  const removeScene = useSceneStore((state) => state.removeScene);

  // O item do menu não renomeia na hora: ele PEDE, e o campo nasce quando o
  // menu termina de fechar. Ver `useRenomearPeloMenu` — era isto que fazia o
  // botão "Renomear" não fazer nada.
  const renomear = useRenomearPeloMenu(onRename);

  const fundoEmVoo = useFundoEmVoo((state) => state.cenas.includes(scene.id));

  function commitRename(value: string) {
    const name = value.trim();
    if (name && name !== scene.name) renameScene(scene.id, name);
    onRenameDone();
  }

  return (
    <li
      className={cn(
        "flex items-center gap-1 rounded-md p-1",
        onStage ? "bg-accent" : "hover:bg-accent/50",
        dropTarget && "ring-primary ring-1",
      )}
      style={depth > 0 ? { paddingLeft: 4 + depth * RECUO_PX } : undefined}
    >
      {/* A alça, e não a linha toda: a linha inteira já responde ao clique
          abrindo a cena, e arrastar de qualquer ponto dela deixaria os dois
          gestos disputando o mesmo alvo. */}
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
        aria-current={onStage}
        onClick={onOpen}
        onDoubleClick={onRename}
        // F2 renomeia, como no gerenciador de arquivos. Ver `aoApertarF2`.
        onKeyDown={aoApertarF2(onRename)}
      >
        <span className="relative shrink-0">
          <ScenePreview scene={scene} className="h-9 w-16" />
          {/* O fundo está copiando: o giro na miniatura é o que diz que o
              clique de há dois segundos ainda está trabalhando. */}
          {fundoEmVoo ? (
            <span
              className="absolute inset-0 flex items-center justify-center rounded bg-black/50"
              aria-label="Importando o fundo"
            >
              <Loader2 className="size-4 animate-spin" />
            </span>
          ) : null}
          {/* Ponto vermelho na miniatura: qual cena a mesa vê precisa ser
              legível de relance, sem depender de ler o nome. */}
          {live ? (
            <span
              className="absolute top-1 right-1 size-2 rounded-full bg-red-500 shadow-[0_0_6px] shadow-red-500/70"
              aria-hidden
            />
          ) : null}
        </span>

        <span className="min-w-0 flex-1">
          {renaming ? null : (
            <>
              <span className="block truncate text-sm">
                {scene.name}
                {live ? <span className="text-red-500"> · no ar</span> : null}
              </span>
              <span className="text-muted-foreground block text-[10px]">
                {ehQuadro(scene)
                  ? `${scene.items.length} imagens · ${scene.postits?.length ?? 0} postits`
                  : `${scene.items.length} itens · ${scene.fog.length} áreas`}
              </span>
            </>
          )}
        </span>
      </button>

      {renaming ? (
        <Input
          autoFocus
          defaultValue={scene.name}
          className="h-7 flex-1 text-sm"
          onBlur={(event) => commitRename(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitRename(event.currentTarget.value);
            if (event.key === "Escape") onRenameDone();
          }}
        />
      ) : (
        <>
          {live ? null : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Colocar ${scene.name} no ar`}
                    onClick={onGoLive}
                  >
                    <Radio />
                  </Button>
                }
              />
              <TooltipContent>
                <p className="max-w-48">
                  Passa a mesa para esta cena, sem sair da que tu edita.
                </p>
              </TooltipContent>
            </Tooltip>
          )}

          <DropdownMenu onOpenChangeComplete={renomear.aoFechar}>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Opções de ${scene.name}`}
                >
                  <MoreVertical />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem disabled={live} onClick={onGoLive}>
                <Radio />
                Colocar no ar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={renomear.pedir}>
                <Pencil />
                Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicateScene(scene.id)}>
                <CopyPlus />
                Duplicar
              </DropdownMenuItem>

              {/* Quadro não tem fundo: é folha, não mapa. Os dois itens do
                  fundo e o separador deles saem juntos. */}
              {ehQuadro(scene) ? null : (
                <>
              <DropdownMenuSeparator />

              {/* O fundo mora aqui e não na biblioteca de imagens: ele é da
                  CENA. Na biblioteca, ele era mais uma linha entre imagens que
                  ainda não são de ninguém -- e depois de escolhido continuava
                  ali, oferecendo-se de novo. Ver `escolherFundoDaCena`. */}
              <DropdownMenuItem
                disabled={fundoEmVoo}
                onClick={() => {
                  void escolherFundoDaCena(scene.id).catch((cause) =>
                    toast.error(
                      cause instanceof Error
                        ? cause.message
                        : "Falha ao importar.",
                    ),
                  );
                }}
              >
                {fundoEmVoo ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ImageIcon />
                )}
                {fundoEmVoo
                  ? "Importando o fundo…"
                  : scene.backgroundAssetId
                    ? "Trocar o fundo"
                    : "Escolher o fundo"}
              </DropdownMenuItem>

              {scene.backgroundAssetId ? (
                <DropdownMenuItem
                  onClick={() => void tirarFundoDaCena(scene.id)}
                >
                  <ImageOff />
                  Tirar o fundo
                </DropdownMenuItem>
              ) : null}
                </>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                variant="destructive"
                onClick={() => removeScene(scene.id)}
              >
                <Trash2 />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </li>
  );
}
