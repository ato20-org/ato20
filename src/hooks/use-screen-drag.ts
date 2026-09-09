"use client";

import { useCallback, type PointerEvent as ReactPointerEvent } from "react";

type DragHandlers = {
  /** `delta` é acumulado desde o pointerdown, em pixels de TELA. */
  onMove: (delta: { x: number; y: number }, event: PointerEvent) => void;
  onEnd?: (event: PointerEvent) => void;
};

/**
 * Arrasto em pixels de tela, via pointer capture.
 *
 * Irmão do `useSceneDrag`, e não um parâmetro dele: aquele converte para
 * unidades de cena pela escala do palco e dá `stopPropagation` para o palco não
 * ler o mesmo gesto como clique no vazio. Nada disso serve para uma janela
 * interna — ela não vive dentro da transformação do palco, e o que ela move é
 * um canto medido na tela.
 *
 * O `delta` é sempre relativo ao início do gesto, nunca ao quadro anterior:
 * somar incrementos acumula erro de arredondamento. Quem consome guarda a
 * posição do pointerdown e aplica o delta sobre ela.
 */
export function useScreenDrag() {
  return useCallback((event: ReactPointerEvent, handlers: DragHandlers) => {
    if (event.button !== 0) return;

    // `preventDefault` mata a seleção de texto do cabeçalho no meio do arrasto,
    // que é o que faz o título ficar azul ao mover a janela devagar.
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement;
    const { pointerId, clientX: startX, clientY: startY } = event;

    target.setPointerCapture(pointerId);

    /**
     * Um commit por quadro, no máximo. Mesma razão do `useSceneDrag`: mouse de
     * alta taxa reporta bem acima de 60 Hz, e cada evento entregue viraria uma
     * escrita no store — logo um render.
     */
    let frame: number | undefined;
    let pending: PointerEvent | null = null;

    const apply = (native: PointerEvent) => {
      handlers.onMove({ x: native.clientX - startX, y: native.clientY - startY }, native);
    };

    const handleMove = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;

      pending = native;
      if (frame !== undefined) return;

      frame = requestAnimationFrame(() => {
        frame = undefined;
        const latest = pending;
        pending = null;
        if (latest) apply(latest);
      });
    };

    const handleEnd = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;

      // O último movimento pendente entra antes do fim: descartá-lo deixaria a
      // janela um quadro atrás de onde ela foi solta.
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (pending) apply(pending);
      frame = undefined;
      pending = null;

      target.releasePointerCapture(pointerId);
      target.removeEventListener("pointermove", handleMove);
      target.removeEventListener("pointerup", handleEnd);
      target.removeEventListener("pointercancel", handleEnd);
      handlers.onEnd?.(native);
    };

    target.addEventListener("pointermove", handleMove);
    target.addEventListener("pointerup", handleEnd);
    target.addEventListener("pointercancel", handleEnd);
  }, []);
}
