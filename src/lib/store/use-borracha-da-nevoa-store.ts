"use client";

import { create } from "zustand";

import {
  proximoRaioDaBorracha,
  RAIO_DA_BORRACHA_PADRAO,
} from "@/lib/geometry/nevoa-dinamica";
import type { Vec } from "@/lib/geometry/transform";

/**
 * A passada da borracha em curso, ainda fora da cena.
 *
 * Em unidade de cena, e não em fração: a caixa da área não muda no meio do
 * gesto, e quem converte é `furoDoTraco`, uma vez, ao soltar.
 */
export type TracoDaBorracha = {
  areaId: string;
  raio: number;
  pontos: Vec[];
};

type BorrachaDaNevoaStore = {
  /** O raio do pincel, em unidade de cena. Fica entre uma área e outra. */
  raio: number;
  /** `[` e `]`: um passo abaixo ou acima. Ver `proximoRaioDaBorracha`. */
  mudarRaio: (sentido: 1 | -1) => void;
  /** A régua do painel. */
  setRaio: (raio: number) => void;
  /**
   * O traço que a mão está passando. `null` = nenhum.
   *
   * Aqui, e não no estado do palco: o canvas da área que a borracha fura é o
   * único que assina, e cada amostra repinta só ele -- o palco inteiro com o
   * mapa e os tokens não renderiza de novo por amostra. A cena recebe a
   * passada UMA vez, ao soltar: um furo, um Ctrl+Z, uma publicação para a
   * mesa. Ver `useGestoStore`, que separa gesto de documento pela mesma razão.
   */
  traco: TracoDaBorracha | null;
  comecar: (areaId: string, ponto: Vec) => void;
  acrescentar: (ponto: Vec) => void;
  /** Devolve o traço e esquece. */
  terminar: () => TracoDaBorracha | null;
};

export const useBorrachaDaNevoaStore = create<BorrachaDaNevoaStore>(
  (set, get) => ({
    raio: RAIO_DA_BORRACHA_PADRAO,
    mudarRaio: (sentido) =>
      set((estado) => ({ raio: proximoRaioDaBorracha(estado.raio, sentido) })),
    setRaio: (raio) => set({ raio }),
    traco: null,
    comecar: (areaId, ponto) =>
      set((estado) => ({
        traco: { areaId, raio: estado.raio, pontos: [ponto] },
      })),
    acrescentar: (ponto) =>
      set((estado) => {
        const traco = estado.traco;
        if (!traco) return estado;

        // Amostra só quando andou um terço do raio: o pincel é redondo, e
        // pontos mais perto que isso não mudam o furo -- só engordam a cena.
        const ultimo = traco.pontos[traco.pontos.length - 1];
        if (
          ultimo &&
          Math.hypot(ponto.x - ultimo.x, ponto.y - ultimo.y) < traco.raio / 3
        )
          return estado;

        return { traco: { ...traco, pontos: [...traco.pontos, ponto] } };
      }),
    terminar: () => {
      const traco = get().traco;
      set({ traco: null });
      return traco;
    },
  }),
);
