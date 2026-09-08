"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Reordenar uma lista arrastando a linha pela alça.
 *
 * O índice de destino sai da ALTURA DO CURSOR sobre a lista, e não de qual
 * linha recebeu o evento. É por causa do `setPointerCapture`: com a captura
 * ativa todos os eventos vão para a linha de origem, e ela nunca saberia por
 * cima de quem está passando. Sem a captura, arrastar rápido o bastante para o
 * cursor sair da linha encerraria o gesto no meio.
 *
 * Saiu do painel de camadas quando a lista de cenas passou a precisar do mesmo
 * gesto. Um laço de pointer capture é justamente o tipo de código que diverge
 * entre duas cópias — uma ganha o cancelamento por `pointercancel`, a outra
 * não —, e aqui as duas listas fazem exatamente a mesma coisa.
 */
export function useListReorder<T>(onDrop: (id: T, index: number) => void) {
  const listRef = useRef<HTMLUListElement>(null);
  /** Índice sob o cursor durante o arrasto, para a linha de inserção. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function startReorder(event: ReactPointerEvent, id: T) {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement;
    const { pointerId } = event;
    target.setPointerCapture(pointerId);

    const indexFor = (clientY: number): number => {
      const rows = [...(listRef.current?.children ?? [])] as HTMLElement[];
      if (rows.length === 0) return 0;

      for (const [index, row] of rows.entries()) {
        const rect = row.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return index;
      }

      return rows.length - 1;
    };

    const handleMove = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;

      setDropIndex(indexFor(native.clientY));
    };

    const handleEnd = (native: PointerEvent) => {
      if (native.pointerId !== pointerId) return;

      target.releasePointerCapture(pointerId);
      target.removeEventListener("pointermove", handleMove);
      target.removeEventListener("pointerup", handleEnd);
      target.removeEventListener("pointercancel", handleEnd);

      onDrop(id, indexFor(native.clientY));
      setDropIndex(null);
    };

    target.addEventListener("pointermove", handleMove);
    target.addEventListener("pointerup", handleEnd);
    target.addEventListener("pointercancel", handleEnd);
  }

  return { listRef, dropIndex, startReorder };
}
