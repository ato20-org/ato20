"use client";

import { create } from "zustand";

import type { Spotlight } from "@/types/scene";

type SpotlightStore = {
  /** `null` = nada em evidência. */
  spotlight: Spotlight | null;

  /**
   * Manda uma imagem para a frente de tudo, na TV e nos celulares.
   *
   * O instante é estampado aqui, e não no espectador: transmitir o MESMO
   * arquivo de novo é como se chama a atenção para ele outra vez, e sem um
   * campo que muda a tela não teria como distinguir isso de nada acontecendo.
   */
  transmit: (assetId: string, caption?: string) => void;
  /** Tira da evidência. A mesa volta a ver só a cena. */
  clear: () => void;
};

/**
 * A imagem em evidência.
 *
 * Store próprio, e não um campo da cena, pelo mesmo motivo da trilha: o mestre
 * transmite o retrato de um PNJ e continua montando o mapa embaixo, e trocar
 * de cena não pode derrubar o que a mesa está olhando.
 *
 * Não persiste no vault, e é a única coisa da sessão que não persiste. A
 * trilha é ambiente e faz sentido reencontrar tocando; evidência é um gesto
 * — "olha isto" —, e restaurá-la ao reabrir o aplicativo mandaria para a TV um
 * documento que a mesa já passou meia hora antes. Nada se perde ao não gravar:
 * o anexo continua no ponto de anotação, e retransmitir é um clique.
 */
export const useSpotlightStore = create<SpotlightStore>((set) => ({
  spotlight: null,

  transmit(assetId, caption) {
    set({ spotlight: { assetId, caption, since: Date.now() } });
  },

  clear() {
    set({ spotlight: null });
  },
}));
