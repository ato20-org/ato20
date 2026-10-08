"use client";

import { useCallback, type PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import type { Vec } from "@/lib/geometry/transform";
import { useChaoStore } from "@/lib/store/use-chao-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";

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
 * Devolve o foco ao documento, como o navegador faria sozinho.
 *
 * O `preventDefault` do pointerdown existe para o arrasto não arrastar seleção
 * de texto, e cancela também a troca de FOCO: clicar no mapa com a busca de
 * personagem focada deixava o cursor piscando nela -- e, com um campo focado,
 * os atalhos do palco se calam (ver `isTyping`) e o que se digitava ia para a
 * busca. O cartão do alfinete e o papel do postit já se defendiam disso cada
 * um por conta própria; aqui é a raiz, e vale para qualquer campo.
 *
 * Só o que está FORA do alvo: o gesto que começa dentro de um campo -- o
 * postit aberto para escrever -- é dele, e tirar o foco ali mataria a escrita.
 */
function soltarFoco(alvo: Element) {
  const ativo = document.activeElement;
  if (!(ativo instanceof HTMLElement) || ativo === document.body) return;
  if (alvo.contains(ativo)) return;

  ativo.blur();
}

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

      if (!handlers.mantemClique) {
        event.preventDefault();
        soltarFoco(event.currentTarget as Element);
      }
      // O `stopPropagation` fica em qualquer caso: ele é o que impede o palco
      // de tratar o mesmo gesto como clique no vazio — marcar vários, ou
      // cravar um ponto por cima do que se estava pegando.
      event.stopPropagation();

      const { pointerId, clientX: startX, clientY: startY } = event;

      /**
       * Quem captura o ponteiro: o CHÃO quando a cena está deitada, e o próprio
       * elemento quando ela está de prumo.
       *
       * Esta linha é o modo de esguelha inteiro, do ponto de vista do gesto.
       * Capturando no chão, todo `pointermove` passa a chegar com
       * `offsetX/offsetY` no sistema DELE -- rotação, inclinação, perspectiva e
       * escala já desfeitas pelo motor --, e o arrasto volta a ser uma
       * subtração. Capturando no item, como sempre se fez, o que chega é pixel
       * de tela, e dividi-lo por `scale` aponta para outro lugar assim que o
       * chão sai do prumo. Ver `useChaoStore`.
       */
      const chao = useChaoStore.getState().chao;
      const target = chao ?? (event.currentTarget as HTMLElement);

      target.setPointerCapture(pointerId);

      // O palco fica sabendo que há gesto: com isso os efeitos animados pausam
      // enquanto o ponteiro anda. Ver `gestos` no store.
      useViewportStore.getState().comecarGesto();

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

      /**
       * Onde o gesto começou, em coordenadas de CHÃO -- e só no modo deitado.
       *
       * Lido no PRIMEIRO movimento, e não no `pointerdown`: o toque aconteceu
       * sobre o item, cujo sistema de coordenadas está girado e levantado, e
       * ali `offsetX` responde sobre a figura, não sobre o chão. Subtrair duas
       * réguas diferentes é o que fazia a peça saltar ao ser pega.
       *
       * O que se perde é o meio pixel andado antes do primeiro `pointermove`,
       * que ninguém vê.
       */
      let inicioNoChao: Vec | null = null;

      const apply = (native: PointerEvent) => {
        if (chao) {
          const agora = { x: native.offsetX, y: native.offsetY };
          inicioNoChao ??= agora;

          handlers.onMove(
            { x: agora.x - inicioNoChao.x, y: agora.y - inicioNoChao.y },
            native,
          );
          return;
        }

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

        useViewportStore.getState().terminarGesto();

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
