"use client";

import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Blend,
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
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  copySelection,
  cutSelection,
  DEGRAUS_OPACIDADE,
  duplicateSelection,
  flipSelection,
  moveSelectionZ,
  opacidadeDaSelecao,
  pasteClipboard,
  removeFogSelection,
  removeSelection,
  selectAllItems,
  setSelectionOpacity,
  toggleFogRevealed,
  toggleSelectionLock,
} from "@/lib/mestre/item-actions";
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
export function StageContextMenu({
  scene,
  children,
}: {
  scene: Scene;
  children: ReactNode;
}) {
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const selectedFogId = useSelectionStore((state) => state.selectedFogId);
  const hasClipboard = useClipboardStore((state) => state.drafts.length > 0);
  const viewport = useViewportStore((state) => state.viewport);
  const setSceneCamera = useSceneStore((state) => state.setSceneCamera);

  const selectedItems = scene.items.filter((item) =>
    selectedIds.includes(item.id),
  );
  const hasSelection = selectedItems.length > 0;
  const allLocked = hasSelection && selectedItems.every((item) => item.locked);
  const opacidade = opacidadeDaSelecao(selectedItems);
  const selectedFog = scene.fog.find((region) => region.id === selectedFogId);

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col">
        {children}
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56">
        {selectedFog ? (
          <>
            <ContextMenuItem onClick={() => toggleFogRevealed()}>
              {selectedFog.revealed ? <EyeOff /> : <Eye />}
              {selectedFog.revealed
                ? "Esconder de novo"
                : "Revelar para a mesa"}
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

            {/* Vizinho do espelhar, e não do travar: os dois mudam como a
                imagem APARECE, e a mesa vê os dois. O travar e a ordem de
                empilhamento são arrumação de bancada. */}
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Blend />
                Opacidade
              </ContextMenuSubTrigger>
              {/* O submenu NÃO fecha ao escolher — é o padrão do item de
                  rádio, e aqui ele vale: escolher opacidade é olhar o palco e
                  corrigir, e um menu que fecha cobraria dois cliques por
                  tentativa. Fecha com Esc ou com um clique fora. */}
              <ContextMenuSubContent className="min-w-28">
                <ContextMenuRadioGroup
                  // `null` quando a seleção discorda: nenhum degrau marcado,
                  // que é o que se sabe. Escolher um iguala os dois.
                  value={opacidade ?? null}
                  onValueChange={(valor: number) => setSelectionOpacity(valor)}
                >
                  {DEGRAUS_OPACIDADE.map((degrau) => (
                    <ContextMenuRadioItem key={degrau} value={degrau}>
                      {degrau === 1 ? "Normal" : `${Math.round(degrau * 100)}%`}
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </ContextMenuSubContent>
            </ContextMenuSub>

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
        <ContextMenuItem
          disabled={scene.items.length === 0}
          onClick={selectAllItems}
        >
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
