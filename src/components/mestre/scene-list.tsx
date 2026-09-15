"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  CopyPlus,
  GripVertical,
  Image as ImageIcon,
  ImageOff,
  MoreVertical,
  Pencil,
  Plus,
  Radio,
  Trash2,
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
  tirarFundoDaCena,
} from "@/lib/mestre/scene-background";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { cn } from "@/lib/utils";
import type { Scene } from "@/types/scene";

export function SceneList({ ready }: { ready: boolean }) {
  const scenes = useSceneStore((state) => state.board?.scenes);
  const editingSceneId = useSceneStore((state) => state.board?.editingSceneId);
  const liveSceneId = useSceneStore((state) => state.board?.liveSceneId);
  const setEditingSceneId = useSceneStore((state) => state.setEditingSceneId);
  const setLiveSceneId = useSceneStore((state) => state.setLiveSceneId);
  const addScene = useSceneStore((state) => state.addScene);
  const clearSelection = useSelectionStore((state) => state.clear);
  const fitViewport = useViewportStore((state) => state.fit);

  const [renamingId, setRenamingId] = useState<string | null>(null);

  const moveSceneToIndex = useSceneStore((state) => state.moveSceneToIndex);
  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (sceneId, index) => moveSceneToIndex(sceneId, index),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2">
        <Button
          className="w-full"
          variant="outline"
          size="sm"
          onClick={() => addScene()}
          disabled={!ready}
        >
          <Plus />
          Nova cena
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <ul ref={listRef} className="space-y-1 p-2 pt-0">
          {scenes?.map((scene, index) => (
            <SceneRow
              key={scene.id}
              scene={scene}
              onStage={scene.id === editingSceneId}
              live={scene.id === liveSceneId}
              onlyScene={scenes.length === 1}
              dropTarget={dropIndex === index}
              onReorderStart={(event) => startReorder(event, scene.id)}
              renaming={renamingId === scene.id}
              onRename={() => setRenamingId(scene.id)}
              onRenameDone={() => setRenamingId(null)}
              onGoLive={() => setLiveSceneId(scene.id)}
              onOpen={() => {
                setEditingSceneId(scene.id);
                // Seleção é por cena: manter itens da cena anterior
                // selecionados deixaria o gizmo apontando pro vazio.
                clearSelection();
                // Zoom também: o recorte de um mapa não diz nada sobre o outro.
                fitViewport();
              }}
            />
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}

type SceneRowProps = {
  scene: Scene;
  /** Aberta no palco do Mestre. */
  onStage: boolean;
  /** Sendo exibida para a mesa. */
  live: boolean;
  onlyScene: boolean;
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
  onStage,
  live,
  onlyScene,
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
                {scene.items.length} itens · {scene.fog.length} áreas
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

              <DropdownMenuSeparator />

              {/* O fundo mora aqui e não na biblioteca de imagens: ele é da
                  CENA. Na biblioteca, ele era mais uma linha entre imagens que
                  ainda não são de ninguém -- e depois de escolhido continuava
                  ali, oferecendo-se de novo. Ver `escolherFundoDaCena`. */}
              <DropdownMenuItem
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
                <ImageIcon />
                {scene.backgroundAssetId
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

              <DropdownMenuSeparator />

              <DropdownMenuItem
                variant="destructive"
                // Board sem cena nenhuma deixaria o palco vazio sem saída.
                disabled={onlyScene}
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
