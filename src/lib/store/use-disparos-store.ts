"use client";

import { create } from "zustand";

import { vidaDoDisparo } from "@/lib/disparo-de-efeito";
import type { Vec } from "@/lib/geometry/transform";
import { useToolStore } from "@/lib/store/use-tool-store";
import type { EfeitoDisparado } from "@/types/efeito-disparado";

/**
 * Quanto o tiro fica no quadro DEPOIS de acabar, em ms.
 *
 * Cada tela começa a contar quando o tiro CHEGA -- e só depois de assar a folha
 * do cone ou do estouro, um instante a mais --, e o Mestre o tira do quadro
 * contando de quando nasceu. Sem a folga, a TV cortaria o estouro no meio.
 */
export const FOLGA_DO_DISPARO_MS = 1_200;

/**
 * Quantos tiros ficam no ar ao mesmo tempo. Doze: a rajada de uma horda de
 * arqueiros pelo botão direito cabe, e um clique preso não enche a mesa.
 */
export const DISPAROS_NO_AR = 12;

type DisparosStore = {
  /** Os tiros no ar, o mais novo na frente. É esta lista que viaja no quadro. */
  ativos: EfeitoDisparado[];
  /** Um tiro saiu. Ele mesmo sai da lista quando acaba. */
  registrar: (disparo: EfeitoDisparado) => void;
  /**
   * O ponto A, esperando o B: o primeiro clique com o Disparo na mão. Na cena
   * em que foi marcado -- trocar de cena com ele pendurado não mira dali.
   */
  mira: { cenaId: string; de: Vec } | null;
  mirar: (cenaId: string, de: Vec) => void;
  largarMira: () => void;
};

export const useDisparosStore = create<DisparosStore>((set) => ({
  ativos: [],

  registrar: (disparo) => {
    set((state) =>
      state.ativos.some((atual) => atual.id === disparo.id)
        ? state
        : { ativos: [disparo, ...state.ativos].slice(0, DISPAROS_NO_AR) },
    );

    // Um relógio por tiro, e não uma varredura: só esta janela dispara, e cada
    // tiro sabe quando acaba.
    setTimeout(
      () =>
        set((state) => ({ ativos: state.ativos.filter((atual) => atual.id !== disparo.id) })),
      vidaDoDisparo(disparo) + FOLGA_DO_DISPARO_MS,
    );
  },

  mira: null,
  mirar: (cenaId, de) => set({ mira: { cenaId, de } }),
  largarMira: () => set({ mira: null }),
}));

/**
 * Largar a ferramenta larga o ponto A, pela razão da seta do quadro: escolher
 * o Disparo de novo cinco minutos depois não pode atirar de um ponto que o
 * mestre já esqueceu. Ver `useQuadroStore`.
 */
useToolStore.subscribe((state, previous) => {
  if (state.tool === previous.tool || state.tool === "disparo") return;
  if (useDisparosStore.getState().mira) useDisparosStore.setState({ mira: null });
});
