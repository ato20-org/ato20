"use client";

import { create } from "zustand";

const STORAGE_KEY = "ato20:handout";

/**
 * Abaixo do saquinho, na mesma margem: as duas bolinhas nascem empilhadas
 * numa coluna à direita, e o mestre leva cada uma para onde quiser. Ver
 * `POSICAO_PADRAO` em `useDadosStore`.
 */
const POSICAO_PADRAO = { x: 0.955, y: 0.52 };

type Posicao = { x: number; y: number };

type HandoutStore = {
  /**
   * Onde a bolinha está, em fração do palco. Mesmo desenho do saquinho: fração
   * e não pixel, para a bolinha ficar no mesmo canto quando a janela muda de
   * tamanho.
   */
  posicao: Posicao;
  /** `localStorage` já foi lido. Antes disso a posição é só o padrão. */
  restaurado: boolean;

  /**
   * Quem mede a boca da bolinha, enquanto ela está montada. Função e não
   * retângulo: a bolinha anda, e um retângulo copiado no início do gesto
   * apontaria para onde ela ESTAVA.
   */
  boca: (() => DOMRect | null) | null;
  /**
   * Um item do palco está sendo arrastado por cima da boca agora. É o que
   * faz a bolinha inchar antes de engolir, como o saquinho faz com o dado.
   */
  sobreABoca: boolean;

  mover: (posicao: Posicao) => void;
  restaurar: () => void;
  publicarBoca: (boca: (() => DOMRect | null) | null) => void;
  /** Um item do palco passou por aqui. Ver `handleItemPointerDown`. */
  apontar: (clientX: number, clientY: number) => void;
  /** O gesto acabou, sobre a boca ou não. */
  largar: () => void;
};

function limitar(valor: number): number {
  return Math.min(1, Math.max(0, valor));
}

function ler(): Posicao | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Posicao>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number")
      return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;

    return { x: limitar(parsed.x), y: limitar(parsed.y) };
  } catch {
    return null;
  }
}

/** O ponto está dentro da boca da bolinha? Pergunta única, no fim do gesto. */
export function naBoca(clientX: number, clientY: number): boolean {
  const rect = useHandoutStore.getState().boca?.();
  if (!rect) return false;

  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

export const useHandoutStore = create<HandoutStore>((set, get) => ({
  posicao: POSICAO_PADRAO,
  restaurado: false,
  boca: null,
  sobreABoca: false,

  mover: (posicao) =>
    set({ posicao: { x: limitar(posicao.x), y: limitar(posicao.y) } }),

  restaurar() {
    if (get().restaurado) return;

    const guardado = ler();
    set(
      guardado ? { posicao: guardado, restaurado: true } : { restaurado: true },
    );
  },

  publicarBoca: (boca) => set({ boca }),

  apontar(clientX, clientY) {
    const sobre = naBoca(clientX, clientY);
    if (sobre !== get().sobreABoca) set({ sobreABoca: sobre });
  },

  largar() {
    if (get().sobreABoca) set({ sobreABoca: false });
  },
}));

// Grava fora do React, como o saquinho: preferência de máquina, não estado.
useHandoutStore.subscribe((state, anterior) => {
  if (!state.restaurado) return;
  if (
    state.posicao.x === anterior.posicao.x &&
    state.posicao.y === anterior.posicao.y
  )
    return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.posicao));
  } catch {
    // Sem espaço ou sem permissão: perder a preferência é aceitável.
  }
});
