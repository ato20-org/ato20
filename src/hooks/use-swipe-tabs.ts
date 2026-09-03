"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";

/** Deslocamento mínimo para valer como arraste de troca de aba. */
const SWIPE_MIN_PX = 60;

type SwipeHandlers = {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
};

/**
 * Arraste lateral para navegar entre abas.
 *
 * Não chama `preventDefault` de propósito: a rolagem vertical do conteúdo tem
 * de continuar funcionando durante o gesto, e a decisão de trocar de aba só
 * acontece ao soltar.
 */
export function useSwipeTabs<T extends string>(
  tabs: readonly T[],
  tab: T,
  setTab: (tab: T) => void,
): SwipeHandlers {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown(event) {
      // Gesto que nasce num controle é interação com ele, não navegação:
      // arrastar dentro de um campo é selecionar texto.
      if ((event.target as HTMLElement).closest("input, textarea, button, a")) {
        start.current = null;
        return;
      }

      start.current = { x: event.clientX, y: event.clientY };
    },

    onPointerUp(event) {
      const from = start.current;
      start.current = null;
      if (!from) return;

      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      // Precisa ser mais horizontal que vertical, senão rolar a ficha para
      // baixo trocaria de aba sem querer.
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return;

      const next = tabs[tabs.indexOf(tab) + (dx < 0 ? 1 : -1)];
      if (next) setTab(next);
    },
  };
}
