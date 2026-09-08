"use client";

import { create } from "zustand";

import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { loadRoomSession, saveRoomSession } from "@/lib/supabase/session-state";

/**
 * Intervalo entre subidas do estado de sessão.
 *
 * Arrastar um retrato emite uma mudança por frame; agrupar três segundos
 * transforma um gesto inteiro numa gravação. Bem acima do disco (400 ms),
 * porque disco é instantâneo e rede não.
 */
const PUSH_DEBOUNCE_MS = 3000;

type SessionSyncStore = {
  status: "idle" | "syncing" | "ready" | "error";
  error: string | null;
  syncedRoomId: string | null;

  sync: (roomId: string) => Promise<void>;
};

/**
 * Retratos e trilha entre as máquinas do mestre.
 *
 * Os arquivos já atravessavam — o binário mora no bucket e o metadado na
 * tabela do acervo. O que faltava era o arranjo: quem está no ar, em que canto,
 * de que tamanho, e qual música está escolhida. Sem isso, abrir a mesa na outra
 * máquina trazia as cenas completas e o palco sem elenco.
 */
export const useSessionSyncStore = create<SessionSyncStore>((set, get) => ({
  status: "idle",
  error: null,
  syncedRoomId: null,

  async sync(roomId) {
    if (!isSupabaseConfigured()) return;
    if (get().status === "syncing" || get().syncedRoomId === roomId) return;

    set({ status: "syncing", error: null });

    try {
      const remote = await loadRoomSession(roomId);
      const portraits = usePortraitStore.getState().portraits;
      const { track, volume } = useTrackStore.getState();

      if (!remote) {
        // Mesa que nunca gravou sessão: esta máquina é a origem.
        await saveRoomSession(roomId, portraits, track, volume);
      } else if (dirty) {
        // Houve edição aqui antes de abrir a mesa. Quem está na máquina agora
        // ganha -- ver a nota na 0008.
        await saveRoomSession(roomId, portraits, track, volume);
      } else {
        usePortraitStore.getState().adopt(remote.portraits);
        // Trilha entra pausada de proposito: musica comecando sozinha ao abrir
        // o Operador assusta, e retomar e um clique. O volume vem junto: e da
        // mesa, e a outra maquina do mestre continua no ganho ajustado.
        useTrackStore
          .getState()
          .adopt(remote.track ? { ...remote.track, playing: false } : null, remote.volume);
      }

      set({ status: "ready", syncedRoomId: roomId });
      watch(roomId);
    } catch (cause) {
      set({
        status: "error",
        error: cause instanceof Error ? cause.message : "Falha ao sincronizar a sessão",
      });
    }
  },
}));

/**
 * Edição local que ainda não subiu.
 *
 * Módulo e não estado do store: ela precisa valer entre a montagem do Operador
 * e a primeira reconciliação, que é justamente quando o store ainda nem existe
 * na tela.
 */
let dirty = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let watching: string | null = null;

/** Liga a observação uma vez por sala. */
function watch(roomId: string): void {
  if (watching === roomId) return;
  watching = roomId;

  const mark = () => {
    dirty = true;
    schedule(roomId);
  };

  usePortraitStore.subscribe((state, previous) => {
    if (state.portraits !== previous.portraits) mark();
  });

  useTrackStore.subscribe((state, previous) => {
    if (state.track !== previous.track || state.volume !== previous.volume) mark();
  });

  // Fechar a aba não pode custar o arranjo dos retratos: o disco já gravou em
  // 400 ms, mas a nuvem só depois do debounce.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden" || !dirty) return;

      clearTimeout(pushTimer);
      void push(roomId);
    });
  }
}

function schedule(roomId: string): void {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void push(roomId), PUSH_DEBOUNCE_MS);
}

async function push(roomId: string): Promise<void> {
  try {
    await saveRoomSession(
      roomId,
      usePortraitStore.getState().portraits,
      useTrackStore.getState().track,
      useTrackStore.getState().volume,
    );
    dirty = false;
  } catch (cause) {
    useSessionSyncStore.setState({
      status: "error",
      error: cause instanceof Error ? cause.message : "Falha ao gravar a sessão",
    });
  }
}
