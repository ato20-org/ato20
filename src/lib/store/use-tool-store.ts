"use client";

import { create } from "zustand";

/** `fog` desenha uma área escondida no arrasto; `select` é o modo normal. */
export type Tool = "select" | "fog";

type ToolStore = {
  tool: Tool;
  setTool: (tool: Tool) => void;
};

export const useToolStore = create<ToolStore>((set) => ({
  tool: "select",
  setTool: (tool) => set({ tool }),
}));
