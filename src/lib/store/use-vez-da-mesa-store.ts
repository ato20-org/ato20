"use client";

import { useEffect } from "react";
import { create } from "zustand";

/**
 * De quem é a vez, para quem DESENHA: a marca da vez no retrato.
 *
 * Um store, e não uma prop, pela razão da versão do elenco
 * (`useFichasVersaoStore`): o retrato mora seis camadas abaixo de quem sabe a
 * vez, em quatro telas -- a TV, o celular, a Janela Mesa e o quadro da janela
 * Retratos. Cada tela tem a sua cópia do store, e quem preenche é quem sabe:
 * o Mestre pela iniciativa dele, a TV e o celular pelo quadro da mesa.
 */
export const useVezDaMesaStore = create<{
  vezDe: string | null;
  definir: (vezDe: string | null) => void;
}>((set) => ({
  vezDe: null,
  definir: (vezDe) => set({ vezDe }),
}));

/** Põe no store a vez que esta tela sabe. Ver `useVezDaMesaStore`. */
export function useDefinirVezDaMesa(vezDe: string | null): void {
  const definir = useVezDaMesaStore((state) => state.definir);

  useEffect(() => {
    definir(vezDe);
  }, [definir, vezDe]);
}
