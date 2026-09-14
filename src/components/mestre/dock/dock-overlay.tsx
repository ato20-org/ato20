"use client";

import { useDockDragStore } from "@/lib/store/use-dock-drag-store";

/**
 * O retângulo que acende sob a janela sendo arrastada.
 *
 * Mostra o RESULTADO, não a intenção: na borda ele é uma faixa fina do tamanho
 * que a região nova vai ter, no meio é a região inteira, porque ali a janela vai
 * virar aba dela. Um alvo genérico — um contorno igual nos dois casos — deixaria
 * o mestre descobrir a diferença entre dividir e fundir só depois de soltar.
 *
 * Desliza entre zonas com uma transição curta — 100ms, o suficiente para o olho
 * ler que o alvo mudou de "divide" para "funde" sem o retângulo correr atrás do
 * ponteiro. Mais que isso e ele chega depois da decisão; menos e a troca é um
 * salto que passa batido.
 */
export function DockOverlay() {
  const retangulo = useDockDragStore((state) => state.retangulo);
  const alvo = useDockDragStore((state) => state.alvo);

  if (!retangulo || !alvo) return null;

  return (
    <div
      aria-hidden
      // Acima de qualquer janela: a pilha começa em 20 e sobe com o
      // número de janelas abertas, então um z fixo baixo seria coberto.
      className="border-primary bg-primary/20 animate-in fade-in-0 pointer-events-none absolute z-[100] rounded-md border-2 transition-all duration-100 ease-out motion-reduce:animate-none motion-reduce:transition-none"
      style={retangulo}
    />
  );
}
