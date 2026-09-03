"use client";

import { create } from "zustand";

type AudioStore = {
  /** Silencia sem alterar a cena: é controle da máquina, não do board. */
  muted: boolean;
  /** Volume geral 0..1. Multiplica o volume que a cena definiu. */
  masterVolume: number;
  /**
   * O browser recusou tocar por falta de gesto do usuário. Vira `false` no
   * primeiro `play()` que der certo.
   */
  blocked: boolean;
  /** Contador incrementado pelo botão "Ativar som" para forçar nova tentativa. */
  nudge: number;

  setMuted: (muted: boolean) => void;
  setMasterVolume: (volume: number) => void;
  setBlocked: (blocked: boolean) => void;
  retry: () => void;
};

/**
 * Estado de reprodução da máquina do mestre. Nada disso entra no board nem
 * viaja no canal: quem toca som é só o Operador, e o volume da caixa de som
 * dele não é assunto da cena.
 */
export const useAudioStore = create<AudioStore>((set) => ({
  muted: false,
  masterVolume: 0.7,
  blocked: false,
  nudge: 0,

  setMuted: (muted) => set({ muted }),
  setMasterVolume: (masterVolume) => set({ masterVolume }),
  setBlocked: (blocked) => set({ blocked }),
  retry: () => set((state) => ({ nudge: state.nudge + 1 })),
}));
