"use client";

import { create } from "zustand";

/** O detalhe que a busca mandou a ficha mostrar. */
type Alvo = { personagemId: string; detalheId: string };

type FocoNoDetalhe = {
  /** O último detalhe pedido, ou `null` antes do primeiro. */
  alvo: Alvo | null;
  /**
   * Sobe a cada pedido, mesmo repetindo o mesmo detalhe: é o que reacende a
   * piscada quando o jogador busca duas vezes o mesmo, e o que os ouvintes
   * comparam para atender uma vez por clique, e não a cada render.
   */
  pedido: number;
  focar: (alvo: Alvo) => void;
  /** A ficha atendeu: apaga o alvo para não reacender a piscada ao voltar. */
  consumir: () => void;
};

/**
 * A busca manda a ficha mostrar um detalhe: a `BarraLateralDoJogador` volta
 * para a aba Personagem, o `DetalhesDoJogador` daquele personagem abre o grupo
 * certo, rola até ele e o faz piscar.
 *
 * Um store, e não uma prop: quem pede (a busca, por cima de tudo) e quem
 * atende (a ficha, no fundo da pilha) não se falam pela árvore. Ver
 * `useFocoNoDetalhe` nos três.
 */
export const useFocoNoDetalhe = create<FocoNoDetalhe>((set) => ({
  alvo: null,
  pedido: 0,
  focar: (alvo) => set((estado) => ({ alvo, pedido: estado.pedido + 1 })),
  consumir: () => set({ alvo: null }),
}));
