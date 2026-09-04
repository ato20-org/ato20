"use client";

import { useEffect } from "react";

import {
  copySelection,
  cutSelection,
  duplicateSelection,
  flipSelection,
  moveSelectionZ,
  nudgeSelection,
  pasteClipboard,
  removeFogSelection,
  removePortraitSelection,
  removeSelection,
  selectAllItems,
} from "@/lib/operator/item-actions";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";

const NUDGE = 1;
const NUDGE_FAST = 10;

const ARROW_DELTA: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function isTyping(target: EventTarget | null): boolean {
  return Boolean(
    (target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']"),
  );
}

/**
 * Atalhos do Operador. O efeito roda uma única vez: as ações leem o estado
 * atual por conta própria, então o listener nunca precisa ser remontado.
 */
export function useOperatorShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;

      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (event.key === "Escape") {
        useSelectionStore.getState().clear();
        return;
      }

      if (modifier) {
        // Desfazer antes do resto: Ctrl+Z é o atalho que não pode falhar.
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) useSceneStore.getState().redo();
          else useSceneStore.getState().undo();
          return;
        }

        if (key === "y") {
          event.preventDefault();
          useSceneStore.getState().redo();
          return;
        }

        const action =
          key === "a"
            ? selectAllItems
            : key === "c"
              ? copySelection
              : key === "x"
                ? cutSelection
                : key === "v"
                  ? pasteClipboard
                  : key === "d"
                    ? duplicateSelection
                    : null;

        if (action) {
          event.preventDefault();
          action();
          return;
        }

        // Zoom: os mesmos atalhos que o browser usa, agora aplicados ao palco.
        if (event.key === "0") {
          event.preventDefault();
          useViewportStore.getState().fit();
          return;
        }

        if (event.key === "=" || event.key === "+") {
          event.preventDefault();
          useViewportStore.getState().zoomIn();
          return;
        }

        if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          useViewportStore.getState().zoomOut();
          return;
        }

        if (event.key === "]" || event.key === "[") {
          event.preventDefault();
          const forward = event.key === "]";
          moveSelectionZ(
            event.shiftKey ? (forward ? "front" : "back") : forward ? "forward" : "backward",
          );
          return;
        }

        return;
      }

      // Espelhar. Shift sozinho, sem Ctrl: Ctrl+V já é colar.
      if (event.shiftKey && (key === "h" || key === "v")) {
        event.preventDefault();
        flipSelection(key === "h" ? "x" : "y");
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        // Backspace navega para trás no browser se não for barrado.
        event.preventDefault();

        const selection = useSelectionStore.getState();

        if (selection.selectedFogId) {
          removeFogSelection();
        } else if (selection.selectedPortraitIds.length > 0) {
          removePortraitSelection();
        } else {
          removeSelection();
        }
        return;
      }

      const arrow = ARROW_DELTA[event.key];
      if (arrow) {
        event.preventDefault();
        const step = event.shiftKey ? NUDGE_FAST : NUDGE;
        nudgeSelection(arrow.x * step, arrow.y * step);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
