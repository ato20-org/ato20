"use client";

import { create } from "zustand";

/**
 * A paleta de comandos: aberta ou fechada.
 *
 * Um store e não um `useState` na tela porque quem a abre é um atalho da
 * tabela de `atalhos.ts`, que roda fora de qualquer componente. O estado é só
 * a porta; o que a paleta lista é calculado na hora em que ela abre.
 */
type PaletaStore = {
  aberta: boolean;
  abrir: () => void;
  fechar: () => void;
  alternar: () => void;
};

export const usePaletaStore = create<PaletaStore>((set) => ({
  aberta: false,
  abrir: () => set({ aberta: true }),
  fechar: () => set({ aberta: false }),
  alternar: () => set((state) => ({ aberta: !state.aberta })),
}));
