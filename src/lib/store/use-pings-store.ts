"use client";

import { create } from "zustand";

import type { Ping } from "@/types/ping";

/**
 * Quanto tempo um ping fica na mesa.
 *
 * Cinco segundos: o bastante para todo mundo virar a cabeça para a TV e achar
 * o ícone, e pouco para o mapa virar mural de setas. A animação de cada tela
 * apaga o ícone um pouco antes disto -- ver `.ping-no-mapa` em `globals.css` --,
 * porque a tela começa a contar quando o ping CHEGA, uma fração de segundo
 * depois de ele nascer aqui.
 */
export const PRAZO_DO_PING_MS = 5_000;

/**
 * Quantos pings de uma mesma pessoa ficam no mapa ao mesmo tempo.
 *
 * Três: apontar a porta, o inimigo e o baú numa frase só é uso de verdade. O
 * quarto empurra o mais velho para fora -- é o que impede um jogador animado
 * (ou um celular com o dedo preso) de cobrir a TV de ícones, sem que o daemon
 * precise contar nada.
 */
export const PINGS_POR_AUTOR = 3;

type PingsStore = {
  /** Os pings no ar, o mais novo na frente. É esta lista que viaja no quadro. */
  ativos: Ping[];
  /** Um ping chegou do daemon, ou o mestre marcou um. */
  registrar: (ping: Ping) => void;
  /** Tira do mapa o que já venceu. Chamado por um relógio de fora, como o dos dados. */
  expirar: () => void;
};

export const usePingsStore = create<PingsStore>((set) => ({
  ativos: [],

  registrar: (ping) =>
    set((state) => {
      // Reentrega do mesmo evento não vira dois pings. O id vem do daemon, ou
      // desta janela para os do mestre.
      if (state.ativos.some((atual) => atual.id === ping.id)) return state;

      let doAutor = 0;
      const ativos = [ping, ...state.ativos].filter((atual) => {
        if (atual.autorId !== ping.autorId) return true;
        doAutor += 1;
        return doAutor <= PINGS_POR_AUTOR;
      });

      return { ativos };
    }),

  expirar: () =>
    set((state) => {
      const limite = Date.now() - PRAZO_DO_PING_MS;
      const vivos = state.ativos.filter((ping) => ping.quando > limite);

      // Mesma referência quando nada venceu: o relógio bate a cada meio
      // segundo, e um array novo a cada batida republicaria o quadro.
      return vivos.length === state.ativos.length ? state : { ativos: vivos };
    }),
}));
