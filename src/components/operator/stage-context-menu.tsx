"use client";

import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipVertical,
  Lock,
  LockOpen,
  Maximize,
  MousePointerSquareDashed,
  ScanSearch,
  Scissors,
  Trash2,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  copySelection,
  cutSelection,
  duplicateSelection,
  flipSelection,
  moveSelectionZ,
  pasteClipboard,
  removeFogSelection,
  removeSelection,
  selectAllItems,
  toggleFogRevealed,
  toggleSelectionLock,
} from "@/lib/operator/item-actions";
import { useClipboardStore } from "@/lib/store/use-clipboard-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { Scene } from "@/types/scene";

/**
 * Menu de botão direito do palco. Um único menu para a cena inteira em vez de
 * um por item: o item clicado já entra na seleção no pointerdown, então o
 * menu só precisa olhar o que está selecionado.
 */
export function StageContextMenu({ scene, children }: { scene: Scene; children: ReactNode }) {
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const selectedFogId = useSelectionStore((state) => state.selectedFogId);
  const hasClipboard = useClipboardStore((state) => state.drafts.length > 0);
  const viewport = useViewportStore((state) => state.viewport);
  const setSceneCamera = useSceneStore((state) => state.setSceneCamera);

  const selectedItems = scene.items.filter((item) => selectedIds.includes(item.id));
  const hasSelection = selectedItems.length > 0;
  const allLocked = hasSelection && selectedItems.every((item) => item.locked);
  const selectedFog = scene.fog.find((region) => region.id === selectedFogId);

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col">{children}</ContextMenuTrigger>

      <ContextMenuContent className="w-56">
        {selectedFog ? (
          <>
            <ContextMenuItem onClick={() => toggleFogRevealed()}>
              {selectedFog.revealed ? <EyeOff /> : <Eye />}
              {selectedFog.revealed ? "Esconder de novo" : "Revelar para a mesa"}
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onClick={removeFogSelection}>
              <Trash2 />
              Remover área
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />
          </>
        ) : null}

        {hasSelection ? (
          <>
            <ContextMenuItem onClick={copySelection}>
              <Copy />
              Copiar
              <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={cutSelection}>
              <Scissors />
              Recortar
              <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={duplicateSelection}>
              <CopyPlus />
              Duplicar
              <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={() => flipSelection("x")}>
              <FlipHorizontal />
              Espelhar na horizontal
              <ContextMenuShortcut>Shift+H</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => flipSelection("y")}>
              <FlipVertical />
              Espelhar na vertical
              <ContextMenuShortcut>Shift+V</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={() => moveSelectionZ("front")}>
              <ChevronsUp />
              Trazer para frente
              <ContextMenuShortcut>Ctrl+Shift+]</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => moveSelectionZ("forward")}>
              <ArrowUp />
              Avançar
              <ContextMenuShortcut>Ctrl+]</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => moveSelectionZ("backward")}>
              <ArrowDown />
              Recuar
              <ContextMenuShortcut>Ctrl+[</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => moveSelectionZ("back")}>
              <ChevronsDown />
              Enviar para trás
              <ContextMenuShortcut>Ctrl+Shift+[</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={toggleSelectionLock}>
              {allLocked ? <LockOpen /> : <Lock />}
              {allLocked ? "Destravar" : "Travar"}
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onClick={removeSelection}>
              <Trash2 />
              Remover
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />
          </>
        ) : null}

        <ContextMenuItem disabled={!hasClipboard} onClick={pasteClipboard}>
          <ClipboardPaste />
          Colar
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={scene.items.length === 0} onClick={selectAllItems}>
          <MousePointerSquareDashed />
          Selecionar tudo
          <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => setSceneCamera(scene.id, viewport)}>
          <ScanSearch />
          Enquadrar a mesa aqui
        </ContextMenuItem>
        {scene.camera ? (
          <ContextMenuItem onClick={() => setSceneCamera(scene.id, undefined)}>
            <Maximize />
            Mostrar a cena inteira
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
