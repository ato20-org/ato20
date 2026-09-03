"use client";

import { useCallback, type PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import type { Vec } from "@/lib/geometry/transform";

type DragHandlers = {
  /** `delta` é acumulado desde o pointerdown, em unidades de cena. */
  onMove: (delta: Vec, event: PointerEvent) => void;
  onEnd?: (event: PointerEvent) => void;
};

/**
 * Arrasto em coordenadas de cena, via pointer capture — o movimento continua
 * sendo entregue mesmo quando o cursor sai do elemento ou da janela.
 *
 * O `delta` é sempre relativo ao início do gesto, nunca ao frame anterior.
 * Quem consome precisa guardar o estado do item no pointerdown e aplicar o
 * delta sobre esse retrato: somar incrementos acumula erro de arredondamento.
 */
export function useSceneDrag() {
  const { scale } = useSceneScale();

  return useCallback(
    (event: ReactPointerEvent, handlers: DragHandlers) => {
      if (event.button !== 0 || scale === 0) return;

      event.preventDefault();
      event.stopPropagation();

      const target = event.currentTarget as HTMLElement;
      const { pointerId, clientX: startX, clientY: startY } = event;

      target.setPointerCapture(pointerId);

      const handleMove = (native: PointerEvent) => {
        if (native.pointerId !== pointerId) return;

        handlers.onMove(
          { x: (native.clientX - startX) / scale, y: (native.clientY - startY) / scale },
          native,
        );
      };

      const handleEnd = (native: PointerEvent) => {
        if (native.pointerId !== pointerId) return;

        target.releasePointerCapture(pointerId);
        target.removeEventListener("pointermove", handleMove);
        target.removeEventListener("pointerup", handleEnd);
        target.removeEventListener("pointercancel", handleEnd);
        handlers.onEnd?.(native);
      };

      target.addEventListener("pointermove", handleMove);
      target.addEventListener("pointerup", handleEnd);
      target.addEventListener("pointercancel", handleEnd);
    },
    [scale],
  );
}
