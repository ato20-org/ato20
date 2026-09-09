"use client";

import { create } from "zustand";

import type { Medida } from "@/types/scene";

type ReguaStore = {
  /** `null` = ninguém medindo. */
  medida: Medida | null;
  medir: (medida: Medida) => void;
  limpar: () => void;
};

/**
 * A medida em curso, que a mesa também vê.
 *
 * Store e não estado do palco porque ela é PUBLICADA: quem monta o quadro para
 * a mesa é o `OperatorShell`, e um estado local do palco não chega até lá.
 *
 * Mesmo desenho do `useSpotlightStore`: da sessão, fora da cena, sem passar
 * pelo vault nem pelo histórico de desfazer. Medida não é conteúdo de campanha
 * — ela vive enquanto o dedo está no botão.
 *
 * Publica a cada quadro do arrasto, e isso é o mesmo custo que arrastar um
 * retrato já tem: o publicador manda o quadro inteiro quando qualquer campo
 * muda. Se um dia isso pesar, o lugar de resolver é lá, para os dois gestos.
 */
export const useReguaStore = create<ReguaStore>((set) => ({
  medida: null,
  medir: (medida) => set({ medida }),
  limpar: () => set({ medida: null }),
}));
