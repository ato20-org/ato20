"use client";

import { create } from "zustand";

/**
 * O sinal de que o Compêndio do ATO20 mudou.
 *
 * O Compêndio da máquina não é campanha: nenhum store o guarda, e a janela do
 * Compêndio o lê quando monta. Mas o "Guardar no ATO20" mora em dois lugares
 * -- na janela e na ficha do molde --, e a janela aberta precisa saber do que
 * a ficha guardou. Um número que sobe, e quem lê relê. Ver
 * `useCompendioDaMaquina`.
 */
export const useCompendioStore = create<{ versao: number; mudou: () => void }>((set) => ({
  versao: 0,
  mudou: () => set((estado) => ({ versao: estado.versao + 1 })),
}));

/** O Compêndio do ATO20 mudou: quem o mostra, relê. */
export function compendioDaMaquinaMudou(): void {
  useCompendioStore.getState().mudou();
}
