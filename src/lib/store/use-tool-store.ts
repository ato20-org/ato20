"use client";

import { create } from "zustand";

/**
 * `select` é o modo normal, `hand` desloca a cena no arrasto, `fog` desenha uma
 * área escondida no arrasto e `pin` crava um ponto de anotação no clique.
 *
 * As duas de mira são de gesto diferente de propósito: área é arrasto, porque
 * ela tem tamanho; ponto é clique, porque ele não tem — pedir um arrasto para
 * cravar um alfinete faria o mestre desenhar uma caixa invisível sem saber.
 *
 * `hand` não substitui o espaço segurado, que continua sendo o caminho
 * momentâneo. Ver `usePanMode`, que junta os dois.
 */
export type Tool = "select" | "hand" | "fog" | "pin";

type ToolStore = {
  tool: Tool;
  setTool: (tool: Tool) => void;
};

export const useToolStore = create<ToolStore>((set) => ({
  tool: "select",
  setTool: (tool) => set({ tool }),
}));
