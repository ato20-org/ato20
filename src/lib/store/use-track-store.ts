"use client";

import { create } from "zustand";

import { loadAudio, saveAudio } from "@/lib/storage/track";
import { DEFAULT_SESSION_VOLUME, type SessionTrack } from "@/types/scene";

type TrackStore = {
  /** `null` = nenhuma trilha escolhida. */
  track: SessionTrack | null;
  /**
   * Volume do som da sessão, de 0 a 1.
   *
   * Fica fora da faixa e sobrevive a ela: trocar de música não mexe no ganho,
   * e remover a trilha não perde o ajuste. É a barra do sistema, e toda faixa
   * que entrar obedece a ela.
   */
  volume: number;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  /** Escolhe a faixa e começa a tocar. O instante é estampado aqui. */
  start: (assetId: string) => void;
  /** Pausa ou retoma, reiniciando a contagem de posição. */
  setPlaying: (playing: boolean) => void;
  /** Regula o som da sessão. Vale com ou sem trilha escolhida. */
  setVolume: (volume: number) => void;
  setLoop: (loop: boolean) => void;
  clear: () => void;
  /** Aplica um estado recebido do canal, sem regravar no disco. */
  receive: (track: SessionTrack | null) => void;
  /** Assume o som que veio da mesa, gravando no disco. Ver `PortraitStore`. */
  adopt: (track: SessionTrack | null, volume: number) => void;
};

/**
 * A trilha da sessão.
 *
 * Store próprio, separado do board, por dois motivos. O histórico de desfazer
 * tira retratos do board, e a música não deve voltar junto de um Ctrl+Z num
 * item. E a trilha não pertence a nenhuma cena: trocar de cena não pode cortar
 * o som.
 */
export const useTrackStore = create<TrackStore>((set, get) => ({
  track: null,
  volume: DEFAULT_SESSION_VOLUME,
  hydrated: false,

  async hydrate() {
    if (get().hydrated) return;

    try {
      const { track, volume } = await loadAudio();
      set({ track, volume, hydrated: true });
    } catch {
      // Sem trilha guardada é estado válido; não vale derrubar a tela por isso.
      set({ hydrated: true });
    }
  },

  start(assetId) {
    // Sem volume no argumento: a faixa nova entra no volume em que a mesa já
    // está. Passar um padrão aqui era o que fazia o som saltar a cada troca.
    persist({ assetId, loop: true, playing: true, startedAt: Date.now() }, get().volume, set);
  },

  setPlaying(playing) {
    const { track, volume } = get();
    if (!track) return;

    // Reinicia a contagem: sem isso, quem chega depois calcularia a posição da
    // faixa incluindo o tempo em que ela ficou pausada.
    persist({ ...track, playing, startedAt: Date.now() }, volume, set);
  },

  setVolume(volume) {
    persist(get().track, volume, set);
  },

  setLoop(loop) {
    const { track, volume } = get();
    if (track) persist({ ...track, loop }, volume, set);
  },

  clear() {
    // O volume fica: é da sessão, e a próxima faixa entra nele.
    persist(null, get().volume, set);
  },

  receive(track) {
    // Espectador não grava: o disco pertence a quem opera. E não recebe volume
    // pelo store — quem assiste aplica o que vem na mensagem do canal.
    set({ track, hydrated: true });
  },

  adopt(track, volume) {
    persist(track, volume, set);
    set({ hydrated: true });
  },
}));

function persist(
  track: SessionTrack | null,
  volume: number,
  set: (partial: { track: SessionTrack | null; volume: number }) => void,
) {
  set({ track, volume });
  void saveAudio({ track, volume });
}
