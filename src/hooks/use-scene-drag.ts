"use client";

import { useCallback, type PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import type { Vec } from "@/lib/geometry/transform";

type DragHandlers = {
  /** `delta` é acumulado desde o pointerdown, em unidades de cena. */
  onMove: (delta: Vec, event: PointerEvent) => void;
  onEnd?: (event: PointerEvent) => void;
  /**
   * Deixa o `click` nativo acontecer depois do gesto. Padrão: não deixa.
   *
   * `preventDefault` no pointerdown suprime os eventos de mouse de
   * compatibilidade, e o `click` é um deles. Para item, área e retrato isso é o
   * certo — eles reagem no próprio pointerdown e um clique a mais não
   * significa nada.
   *
   * O ponto de anotação é o caso contrário: o alfinete é o gatilho de um
   * `Popover`, e gatilho de Popover abre no CLIQUE. Matando o clique, abrir
   * virava responsabilidade do `onEnd` daqui — e aí o painel abria no
   * pointerup e o clique seguinte era lido pela lógica de dispensa como
   * pressão externa, fechando no mesmo gesto. O sintoma era um alfinete que
   * arrastava e não abria.
   */
  mantemClique?: boolean;
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

      if (!handlers.mantemClique) event.preventDefault();
      // O `stopPropagation` fica em qualquer caso: ele é o que impede o palco
      // de tratar o mesmo gesto como clique no vazio — marcar vários, ou
      // cravar um ponto por cima do que se estava pegando.
      event.stopPropagation();

      const target = event.currentTarget as HTMLElement;
      const { pointerId, clientX: startX, clientY: startY } = event;

      target.setPointerCapture(pointerId);

      /**
       * Um commit por frame, no máximo.
       *
       * Mouse gamer e caneta reportam bem acima de 60 Hz, e cada evento
       * entregue virava um update de store — logo um render da cena inteira.
       * Os navegadores já agrupam `pointermove` na maior parte dos casos; isto
       * transforma "na maior parte" em garantia, e o último evento da janela é
       * o que vale, que é exatamente o que um arrasto precisa.
       */
      let frame: number | undefined;
      let pending: PointerEvent | null = null;

      const apply = (native: PointerEvent) => {
        handlers.onMove(
          { x: (native.clientX - startX) / scale, y: (native.clientY - startY) / scale },
          native,
        );
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

        // O último movimento pendente entra antes do fim: descartá-lo deixaria
        // o item um frame atrás de onde o mestre soltou.
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
    },
    [scale],
  );
}
