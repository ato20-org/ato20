"use client";

import { create } from "zustand";

/**
 * `fog` desenha uma área escondida no arrasto, `pin` crava um ponto de
 * anotação no clique, e `select` é o modo normal.
 *
 * As duas de mira são de gesto diferente de propósito: área é arrasto, porque
 * ela tem tamanho; ponto é clique, porque ele não tem — pedir um arrasto para
 * cravar um alfinete faria o mestre desenhar uma caixa invisível sem saber.
 */
export type Tool = "select" | "fog" | "pin";

type ToolStore = {
  tool: Tool;
  setTool: (tool: Tool) => void;
};

export const useToolStore = create<ToolStore>((set) => ({
  tool: "select",
  setTool: (tool) => set({ tool }),
}));
