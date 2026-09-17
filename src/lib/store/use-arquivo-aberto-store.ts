"use client";

import { create } from "zustand";

/**
 * O que ocupa o painel principal do Mestre: o palco da cena em edição, ou o
 * editor de uma nota. Como no Obsidian, abrir um arquivo troca a vista; abrir
 * uma cena volta ao palco. Não persiste: ao reabrir, o palco.
 */
type ArquivoAbertoStore = {
  notaId: string | null;
  abrirNota: (notaId: string) => void;
  fechar: () => void;
};

export const useArquivoAbertoStore = create<ArquivoAbertoStore>((set) => ({
  notaId: null,
  abrirNota: (notaId) => set({ notaId }),
  fechar: () => set({ notaId: null }),
}));
