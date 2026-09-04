"use client";

import { create } from "zustand";

const STORAGE_KEY = "ato20:panels";

/** Abas do painel esquerdo. */
export type LeftTab = "cenas" | "areas" | "retratos";

type PanelsStore = {
  /** Cenas e áreas escondidas. */
  left: boolean;
  /** Bibliotecas de imagem e som, mais as camadas da cena. */
  right: boolean;
  /**
   * Aba aberta no painel esquerdo.
   *
   * Vive no store, e não dentro do painel, porque o palco depende dela: com
   * Retratos aberta, ele desenha todos os retratos para o mestre arrastar.
   * Estar na aba É a intenção de editar retrato.
   */
  leftTab: LeftTab;
  /** `localStorage` já foi lido. Antes disso os valores são só o padrão. */
  restored: boolean;

  toggleLeft: () => void;
  toggleRight: () => void;
  setLeftTab: (tab: LeftTab) => void;
  restore: () => void;
};

type Stored = { left: boolean; right: boolean };

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (typeof parsed.left !== "boolean" || typeof parsed.right !== "boolean") return null;

    return { left: parsed.left, right: parsed.right };
  } catch {
    // Modo privado, cota cheia ou JSON corrompido. O padrão serve.
    return null;
  }
}

/**
 * Painéis laterais abertos ou fechados.
 *
 * Lido do `localStorage` só depois da montagem, por `restore()`. Ler na criação
 * do store daria divergência de hidratação: `/operador` é pré-renderizado com
 * os padrões, e o cliente chegaria com outro valor no primeiro render.
 */
export const usePanelsStore = create<PanelsStore>((set, get) => ({
  left: true,
  right: true,
  leftTab: "cenas",
  restored: false,

  toggleLeft: () => set({ left: !get().left }),
  toggleRight: () => set({ right: !get().right }),
  // Não é persistida de propósito: abrir o Operador já com retratos desenhados
  // sobre o mapa surpreenderia quem só quer montar a cena.
  setLeftTab: (leftTab) => set({ leftTab }),

  restore() {
    if (get().restored) return;

    const stored = read();
    set(stored ? { ...stored, restored: true } : { restored: true });
  },
}));

// Grava fora do React: é preferência de máquina, não estado de render.
usePanelsStore.subscribe((state, previous) => {
  if (!state.restored || (state.left === previous.left && state.right === previous.right)) return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: state.left, right: state.right }));
  } catch {
    // Sem espaço ou sem permissão: perder a preferência é aceitável.
  }
});
