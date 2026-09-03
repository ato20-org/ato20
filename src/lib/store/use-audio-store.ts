"use client";

import { create } from "zustand";

type AudioStore = {
  /**
   * Este aparelho emite som.
   *
   * É decisão local, não da cena. Operador e Assistir costumam rodar na mesma
   * máquina: os dois emitindo tocariam a mesma faixa com alguns milissegundos
   * de diferença, o que soa como eco. Um por vez resolve.
   */
  enabled: boolean;
  /**
   * O browser recusou tocar por falta de gesto do usuário. Vira `false` no
   * primeiro `play()` que der certo.
   */
  blocked: boolean;
  /** Contador incrementado por "Ativar som" para forçar nova tentativa. */
  nudge: number;
  /** Efeitos tocando agora, por `assetId`, para a interface poder pará-los. */
  playingEffects: string[];

  setEnabled: (enabled: boolean) => void;
  setBlocked: (blocked: boolean) => void;
  retry: () => void;
  setPlayingEffects: (ids: string[]) => void;
};

/**
 * Saída de som deste aparelho.
 *
 * Nada disso entra no board nem viaja no canal: o volume da caixa de som de
 * quem está olhando não é assunto da cena. O que viaja é `Scene.audio`.
 */
export const useAudioStore = create<AudioStore>((set) => ({
  enabled: true,
  blocked: false,
  nudge: 0,
  playingEffects: [],

  setEnabled: (enabled) => set({ enabled }),
  setBlocked: (blocked) => set({ blocked }),
  retry: () => set((state) => ({ nudge: state.nudge + 1 })),
  setPlayingEffects: (playingEffects) => set({ playingEffects }),
}));

/**
 * Ganho final aplicado a um elemento.
 *
 * Um volume só, o da cena, e ele viaja: o mestre regula de um lugar e a TV e
 * os celulares seguem. Um segundo volume por aparelho se multiplicaria com
 * este — trilha a 5% com aparelho a 70% dá 3,5%, e quem arrasta um slider não
 * entende por que o som não sobe. Ajuste fino por aparelho é o volume do
 * próprio sistema, que todo aparelho já tem.
 */
export function outputVolume(trackVolume: number): number {
  if (!useAudioStore.getState().enabled) return 0;

  return Math.max(0, Math.min(1, trackVolume));
}
