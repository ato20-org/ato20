"use client";

import { create } from "zustand";

/**
 * O que a borracha dos riscos está cortando, ainda fora da cena: por risco
 * tocado, os pedaços que sobram dele. Um risco aqui com lista vazia sumiu
 * inteiro.
 *
 * Aqui, e não no estado do palco: a passada corta a cada amostra, e só a
 * camada dos riscos assina -- o palco inteiro com o mapa e os tokens não
 * renderiza de novo por amostra. A cena recebe a passada UMA vez, ao soltar:
 * um Ctrl+Z, uma publicação para a mesa. Ver `substituirTracos`, e a borracha
 * da névoa, que separa gesto de documento pela mesma razão.
 */
type BorrachaDosRiscosStore = {
  /** `null` = nenhuma passada em curso. */
  pedacos: ReadonlyMap<string, readonly number[][]> | null;
  setPedacos: (pedacos: ReadonlyMap<string, readonly number[][]> | null) => void;
};

export const useBorrachaDosRiscosStore = create<BorrachaDosRiscosStore>((set) => ({
  pedacos: null,
  setPedacos: (pedacos) => set({ pedacos }),
}));
