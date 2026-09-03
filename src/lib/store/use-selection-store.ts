"use client";

import { create } from "zustand";

type SelectionStore = {
  /** Ids de itens selecionados no Operador. Ordem não importa. */
  selectedIds: string[];
  /** Área escondida selecionada. Uma por vez — são poucas e não formam grupo. */
  selectedFogId: string | null;

  select: (itemIds: string[]) => void;
  toggle: (itemId: string) => void;
  selectFog: (fogId: string | null) => void;
  clear: () => void;
};

/**
 * Seleção é estado de UI do Operador: não é persistida no board e não viaja
 * no canal. A Plateia e o Assistir nunca sabem o que o mestre tem selecionado.
 *
 * Item e área escondida são seleções mutuamente exclusivas: as duas usam o
 * mesmo gizmo na tela, e permitir as duas juntas mostraria dois conjuntos de
 * alças disputando o mesmo clique.
 */
export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selectedIds: [],
  selectedFogId: null,

  select(itemIds) {
    set({ selectedIds: itemIds, selectedFogId: null });
  },

  toggle(itemId) {
    const { selectedIds } = get();

    set({
      selectedIds: selectedIds.includes(itemId)
        ? selectedIds.filter((id) => id !== itemId)
        : [...selectedIds, itemId],
      selectedFogId: null,
    });
  },

  selectFog(fogId) {
    set({ selectedIds: [], selectedFogId: fogId });
  },

  clear() {
    const { selectedIds, selectedFogId } = get();
    if (selectedIds.length === 0 && selectedFogId === null) return;

    set({ selectedIds: [], selectedFogId: null });
  },
}));
