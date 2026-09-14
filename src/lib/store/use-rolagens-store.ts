"use client";

import { create } from "zustand";

import type { RolagemDaMesa } from "@/types/dado";

/**
 * Quanto tempo um dado de jogador fica na mesa depois de cair.
 *
 * Trinta segundos é o que cobre a leitura em voz alta e a conta que vem depois
 * — "dezessete mais três" — sem que a fileira vire um mural. Não é o jogador
 * que decide quando o dado sai da vista do mestre, e não deve ser: quem rolou
 * já viu o número no próprio aparelho, e deixar o dado sumir no aperto de um
 * botão do celular tiraria da mesa uma jogada que ela talvez ainda estivesse
 * discutindo.
 *
 * O prazo mora AQUI, e não no daemon. Quem guarda a bandeja é quem a desenha, e
 * um relógio em Rust só para apagar pixel seria o mesmo estado em dois lugares.
 */
export const PRAZO_DO_DADO_MS = 30_000;

/** Quantas rolagens o histórico da mesa guarda. */
const HISTORICO = 60;

type RolagensStore = {
  /**
   * Os dados de jogador ainda na mesa, o mais novo na frente.
   *
   * Efêmera de propósito, e é ela que viaja no `LiveState`. Trocar de cena não
   * a limpa — a jogada é do momento da mesa, não do mapa —, pelo mesmo motivo
   * que os dados do mestre não pertencem à cena.
   */
  bandeja: RolagemDaMesa[];
  /**
   * O que já foi rolado nesta sessão, o mais novo na frente.
   *
   * Só do Mestre: não entra no quadro publicado. O jogador tem o próprio
   * histórico no aparelho dele, e mandar para a TV a lista do que a mesa tirou
   * nos últimos vinte minutos é mural, não mesa.
   *
   * Não persiste, como o histórico do saquinho do mestre: rolagem de ontem
   * reaparecendo na lista de hoje é lixo, não memória.
   */
  historico: RolagemDaMesa[];

  /** Um dado chegou do daemon. */
  registrar: (rolagem: RolagemDaMesa) => void;
  /** Tira um dado da mesa. Não mexe no histórico — ele ROLOU. */
  apagar: (id: string) => void;
  /** Limpa a mesa inteira, dos jogadores. Os dados do mestre são outro store. */
  limpar: () => void;
  /** Esquece o que foi rolado. Separado de `limpar`: são dois gestos diferentes. */
  esquecer: () => void;
  /**
   * Tira da bandeja o que já venceu.
   *
   * Chamado por um relógio de fora, e não por `setTimeout` por dado: N dados
   * dariam N temporizadores para uma varredura que custa um `filter`, e um
   * temporizador por dado é um vazamento esperando a janela fechar no meio.
   */
  expirar: () => void;
};

export const useRolagensStore = create<RolagensStore>((set) => ({
  bandeja: [],
  historico: [],

  registrar: (rolagem) =>
    set((state) => {
      // Reentrega do mesmo evento — reconexão do fluxo, quadro repetido — não
      // pode virar dois dados. O id vem do daemon e é a identidade da jogada.
      if (state.bandeja.some((atual) => atual.id === rolagem.id)) return state;

      return {
        bandeja: [rolagem, ...state.bandeja],
        historico: [rolagem, ...state.historico].slice(0, HISTORICO),
      };
    }),

  apagar: (id) =>
    set((state) => ({
      bandeja: state.bandeja.filter((rolagem) => rolagem.id !== id),
    })),

  limpar: () => set({ bandeja: [] }),
  esquecer: () => set({ historico: [] }),

  expirar: () =>
    set((state) => {
      const limite = Date.now() - PRAZO_DO_DADO_MS;
      const viva = state.bandeja.filter((rolagem) => rolagem.quando > limite);

      // Mesma referência quando nada venceu: este relógio bate uma vez por
      // segundo, e devolver um array novo a cada batida republicaria o estado
      // e redesenharia a fileira para nada.
      return viva.length === state.bandeja.length ? state : { bandeja: viva };
    }),
}));
