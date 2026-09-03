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
  /** Volume deste aparelho, 0 a 1. Multiplica o volume que a cena definiu. */
  masterVolume: number;
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
  setMasterVolume: (volume: number) => void;
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
  masterVolume: 0.7,
  blocked: false,
  nudge: 0,
  playingEffects: [],

  setEnabled: (enabled) => set({ enabled }),
  setMasterVolume: (masterVolume) => set({ masterVolume }),
  setBlocked: (blocked) => set({ blocked }),
  retry: () => set((state) => ({ nudge: state.nudge + 1 })),
  setPlayingEffects: (playingEffects) => set({ playingEffects }),
}));

/** Ganho final aplicado a um elemento, já considerando a saída deste aparelho. */
export function outputVolume(trackVolume: number): number {
  const { enabled, masterVolume } = useAudioStore.getState();
  if (!enabled) return 0;

  return Math.max(0, Math.min(1, trackVolume * masterVolume));
}
