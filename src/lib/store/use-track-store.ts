"use client";

import { create } from "zustand";

import { loadTrack, saveTrack } from "@/lib/vault/session";
import type { SessionTrack } from "@/types/scene";

type TrackStore = {
  /** `null` = nenhuma trilha escolhida. */
  track: SessionTrack | null;
  /** Qual campanha esta trilha pertence. Ver `use-scene-store`. */
  hydratedPath: string | null;

  hydrate: (campaignPath: string) => Promise<void>;
  /** Escolhe a faixa e começa a tocar. O instante é estampado aqui. */
  start: (assetId: string, volume: number) => void;
  /** Pausa ou retoma, reiniciando a contagem de posição. */
  setPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
  /**
   * Move a faixa para um instante.
   *
   * Reescreve `startedAt` em vez de mandar um comando de "buscar": é assim que
   * a posição já viajava, e por isso a TV e os celulares seguem sozinhos —
   * cada um recalcula a própria posição a partir dele. Um comando novo exigiria
   * que todos estivessem ouvindo no instante exato do clique.
   */
  seek: (seconds: number) => void;
  setLoop: (loop: boolean) => void;
  clear: () => void;
  /** Aplica um estado recebido do canal, sem regravar no disco. */
  receive: (track: SessionTrack | null) => void;

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
  hydratedPath: null,

  async hydrate(campaignPath) {
    if (get().hydratedPath === campaignPath) return;

    // Zera antes de ler: a música da campanha anterior continuaria tocando
    // sobre a nova enquanto o disco respondesse.
    set({ track: null, hydratedPath: campaignPath });

    try {
      set({ track: await loadTrack() });
    } catch {
      // Sem trilha guardada é estado válido; não vale derrubar a tela por isso.
    }
  },

  start(assetId, volume) {
    persist({ assetId, loop: true, volume, playing: true, startedAt: Date.now() }, set);
  },

  setPlaying(playing) {
    const { track } = get();
    if (!track) return;

    // Reinicia a contagem: sem isso, quem chega depois calcularia a posição da
    // faixa incluindo o tempo em que ela ficou pausada.
    persist({ ...track, playing, startedAt: Date.now() }, set);
  },

  setVolume(volume) {
    const { track } = get();
    if (track) persist({ ...track, volume }, set);
  },

  seek(seconds) {
    const { track } = get();
    if (!track) return;

    persist({ ...track, startedAt: Date.now() - Math.max(0, seconds) * 1000 }, set);
  },

  setLoop(loop) {
    const { track } = get();
    if (track) persist({ ...track, loop }, set);
  },

  clear() {
    persist(null, set);
  },

  receive(track) {
    // Espectador não grava: o disco pertence a quem opera.
    set({ track });
  },
}));

function persist(track: SessionTrack | null, set: (partial: { track: SessionTrack | null }) => void) {
  set({ track });
  void saveTrack(track);
}
