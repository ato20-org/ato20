"use client";

import { create } from "zustand";

/**
 * O que o leitor de Regras precisa saber de fora, em qualquer moldura.
 *
 * Era também o split que dividia a linha com o palco, com um livro por vez e a
 * fração dele. Isso virou um painel como os de nota -- ver `usePaineisStore` --,
 * e aqui ficou só o salto de página, que vale tanto para o livro num painel
 * quanto para o de uma janela.
 */
type LeitorStore = {
  /**
   * A página que cada livro deve mostrar quando puder, pedida de fora: a
   * menção `!rótulo` de uma nota. O leitor aplica e descarta -- ver `salto` no
   * `LeitorPdf`. Por livro e não um só, porque o livro pedido pode estar numa
   * janela enquanto outro ocupa o painel.
   */
  saltos: Record<string, { pagina: number; vez: number }>;

  saltar: (livroId: string, pagina: number) => void;
  /** Tira o salto aplicado. Só se ainda for o mesmo: um mais novo fica. */
  descartarSalto: (livroId: string, vez: number) => void;
};

/** Conta os saltos: dois pedidos da mesma página têm de valer os dois. */
let vezes = 0;

export const useLeitorStore = create<LeitorStore>((set, get) => ({
  saltos: {},

  saltar(livroId, pagina) {
    vezes += 1;
    set({ saltos: { ...get().saltos, [livroId]: { pagina, vez: vezes } } });
  },

  descartarSalto(livroId, vez) {
    if (get().saltos[livroId]?.vez !== vez) return;

    const resto = { ...get().saltos };
    delete resto[livroId];
    set({ saltos: resto });
  },
}));
