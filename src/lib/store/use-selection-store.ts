"use client";

import { create } from "zustand";

type SelectionStore = {
  /** Ids de itens selecionados no Mestre. Ordem não importa. */
  selectedIds: string[];
  /** Área escondida selecionada. Uma por vez — são poucas e não formam grupo. */
  selectedFogId: string | null;
  /**
   * Retratos selecionados.
   *
   * Lista, e não um só: redimensionar o elenco inteiro na mesma proporção é o
   * gesto que mantém os rostos coerentes entre si, e ele exige grupo.
   */
  selectedPortraitIds: string[];
  /** Medidor selecionado. Um por vez, como a área escondida. */
  selectedMedidorId: string | null;

  select: (itemIds: string[]) => void;
  toggle: (itemId: string) => void;
  selectFog: (fogId: string | null) => void;
  /** `null` limpa. */
  selectMedidor: (medidorId: string | null) => void;
  /** `null` limpa. Substitui a seleção de retratos inteira. */
  selectPortrait: (portraitId: string | null) => void;
  selectPortraits: (portraitIds: string[]) => void;
  togglePortrait: (portraitId: string) => void;
  clear: () => void;
};

/**
 * Seleção é estado de UI do Mestre: não é persistida no board e não viaja
 * no canal. O Jogador e o Espectador nunca sabem o que o mestre tem selecionado.
 *
 * Item, área escondida e retrato são seleções mutuamente exclusivas: os três
 * usam o mesmo gizmo na tela, e permitir dois juntos mostraria dois conjuntos
 * de alças disputando o mesmo clique.
 */
export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selectedIds: [],
  selectedFogId: null,
  selectedPortraitIds: [],
  selectedMedidorId: null,

  select(itemIds) {
    set({ selectedIds: itemIds, selectedFogId: null, selectedPortraitIds: [], selectedMedidorId: null });
  },

  toggle(itemId) {
    const { selectedIds } = get();

    set({
      selectedIds: selectedIds.includes(itemId)
        ? selectedIds.filter((id) => id !== itemId)
        : [...selectedIds, itemId],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: null,
    });
  },

  selectFog(fogId) {
    set({ selectedIds: [], selectedFogId: fogId, selectedPortraitIds: [], selectedMedidorId: null });
  },

  selectMedidor(medidorId) {
    set({
      selectedIds: [],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: medidorId,
    });
  },

  selectPortrait(portraitId) {
    get().selectPortraits(portraitId ? [portraitId] : []);
  },

  selectPortraits(portraitIds) {
    set({
      selectedIds: [],
      selectedFogId: null,
      selectedPortraitIds: portraitIds,
      selectedMedidorId: null,
    });
  },

  togglePortrait(portraitId) {
    const { selectedPortraitIds } = get();

    set({
      selectedIds: [],
      selectedFogId: null,
      selectedPortraitIds: selectedPortraitIds.includes(portraitId)
        ? selectedPortraitIds.filter((id) => id !== portraitId)
        : [...selectedPortraitIds, portraitId],
      selectedMedidorId: null,
    });
  },

  clear() {
    const { selectedIds, selectedFogId, selectedPortraitIds, selectedMedidorId } =
      get();
    if (
      selectedIds.length === 0 &&
      selectedFogId === null &&
      selectedPortraitIds.length === 0 &&
      selectedMedidorId === null
    ) {
      return;
    }

    set({
      selectedIds: [],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: null,
    });
  },
}));
