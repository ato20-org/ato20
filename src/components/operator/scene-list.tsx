"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CopyPlus,
  MoreVertical,
  Pencil,
  Plus,
  Radio,
  Trash2,
} from "lucide-react";

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
        <ul className="space-y-1 p-2 pt-0">
          {scenes?.map((scene, index) => (
            <SceneRow
              key={scene.id}
              scene={scene}
              onStage={scene.id === editingSceneId}
              live={scene.id === liveSceneId}
              first={index === 0}
              last={index === scenes.length - 1}
              onlyScene={scenes.length === 1}
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
  /** Aberta no palco do Operador. */
  onStage: boolean;
  /** Sendo exibida para a mesa. */
  live: boolean;
  first: boolean;
  last: boolean;
  onlyScene: boolean;
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
  first,
  last,
  onlyScene,
  renaming,
  onRename,
  onRenameDone,
  onGoLive,
  onOpen,
}: SceneRowProps) {
  const renameScene = useSceneStore((state) => state.renameScene);
  const duplicateScene = useSceneStore((state) => state.duplicateScene);
  const moveScene = useSceneStore((state) => state.moveScene);
  const removeScene = useSceneStore((state) => state.removeScene);

  function commitRename(value: string) {
    const name = value.trim();
    if (name && name !== scene.name) renameScene(scene.id, name);
    onRenameDone();
  }

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-md p-1",
        onStage ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        aria-current={onStage}
        onClick={onOpen}
        onDoubleClick={onRename}
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
                <p className="max-w-48">Passa a mesa para esta cena, sem sair da que tu edita.</p>
              </TooltipContent>
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-xs" aria-label={`Opções de ${scene.name}`}>
                  <MoreVertical />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem disabled={live} onClick={onGoLive}>
                <Radio />
                Colocar no ar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRename}>
                <Pencil />
                Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicateScene(scene.id)}>
                <CopyPlus />
                Duplicar
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem disabled={first} onClick={() => moveScene(scene.id, "up")}>
                <ArrowUp />
                Mover para cima
              </DropdownMenuItem>
              <DropdownMenuItem disabled={last} onClick={() => moveScene(scene.id, "down")}>
                <ArrowDown />
                Mover para baixo
              </DropdownMenuItem>

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
