"use client";

import { create } from "zustand";

import { chegadaDe } from "@/hooks/use-queda-das-rolagens";
import {
  aplicarNoFio,
  caiAoChegar,
  FIO_VAZIO,
  recomecarFio,
  type EstadoDoFio,
} from "@/lib/fio";
import type { RegistroDoFio } from "@/types/fio";

type FioStore = EstadoDoFio & {
  /**
   * As linhas que chegaram DEPOIS do replay, por id.
   *
   * São as únicas cujo dado cai na tela e as únicas que contam como não lidas:
   * a conversa de ontem que o replay trouxe não é novidade para ninguém.
   */
  aoVivo: ReadonlySet<string>;
  /**
   * Quantas MENSAGENS de outra pessoa chegaram com o fio fechado.
   *
   * Só as de texto. A rolagem também é linha do fio, mas o dado já tem onde
   * aparecer — a bandeja embaixo do retrato, a janela de Rolagens —, e contá-lo
   * deixaria o aviso do chat aceso a sessão inteira, que é o mesmo que nunca
   * avisar.
   */
  naoLidas: number;
  /**
   * A última mensagem ao vivo de OUTRA pessoa.
   *
   * É o que a janela de Chat do Mestre observa para se abrir sozinha, como a de
   * Rolagens faz com o dado: o recado do jogador nasce do outro lado da mesa, e
   * o Mestre pode estar de olho no mapa. Ver `useJanelaDoChat`.
   */
  ultimaMensagemDeFora: string | undefined;
  /** O fio está à vista agora? Com ele aberto, nada fica por ler. */
  lendo: boolean;

  /**
   * Um evento do fluxo. `minha` diz se a linha é de quem está nesta tela —
   * quem sabe é o hook que assina, e não o store, que serve às duas telas.
   */
  receber: (registro: RegistroDoFio, minha: boolean) => void;
  /** O fluxo caiu e vai reconectar. Ver `recomecarFio`. */
  recomecar: () => void;
  /** Saiu da mesa: o fio de outra campanha não pode ficar na tela. */
  esvaziar: () => void;
  ler: (lendo: boolean) => void;
};

export const useFioStore = create<FioStore>((set) => ({
  ...FIO_VAZIO,
  aoVivo: new Set(),
  naoLidas: 0,
  ultimaMensagemDeFora: undefined,
  lendo: false,

  receber: (registro, minha) =>
    set((state) => {
      const fio = aplicarNoFio(state, registro);
      if (fio === state) return state;

      const { linhas, pronto, chegando } = fio;

      // Ao vivo é a linha que entrou direto na lista, com o replay já acabado.
      if (registro.tipo !== "linha" || !state.pronto)
        return { linhas, pronto, chegando };

      // O registro das que chegaram ao vivo vive tanto quanto a linha na tela.
      // Sem o corte, uma janela aberta o dia inteiro guardaria os ids de toda
      // a sessão.
      const naTela = new Set(linhas.map((linha) => linha.id));
      const aoVivo = new Set(
        [...state.aoVivo].filter((id) => naTela.has(id)),
      ).add(registro.id);

      // O dado começa a cair AGORA, e não quando a lista for desenhada: com o
      // fio fechado, abrir a aba cinco minutos depois faria o dado de cinco
      // minutos atrás tombar como se tivesse acabado de ser jogado. O carimbo
      // é o mesmo da bandeja — a linha e a rolagem têm o mesmo id —, e as duas
      // pousam juntas.
      if (caiAoChegar(registro)) chegadaDe(registro.id);

      const deFora = !minha && registro.texto !== undefined;

      return {
        linhas,
        pronto,
        chegando,
        aoVivo,
        naoLidas: deFora && !state.lendo ? state.naoLidas + 1 : state.naoLidas,
        ultimaMensagemDeFora: deFora ? registro.id : state.ultimaMensagemDeFora,
      };
    }),

  recomecar: () => set((state) => recomecarFio(state)),

  esvaziar: () =>
    set({
      ...FIO_VAZIO,
      aoVivo: new Set(),
      naoLidas: 0,
      ultimaMensagemDeFora: undefined,
    }),

  ler: (lendo) =>
    set((state) =>
      state.lendo === lendo && (!lendo || state.naoLidas === 0)
        ? state
        : { lendo, naoLidas: lendo ? 0 : state.naoLidas },
    ),
}));
