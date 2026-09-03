"use client";

import { create } from "zustand";

import { useRoomStore } from "@/lib/store/use-room-store";
import { uploadAsset } from "@/lib/supabase/asset-sync";

export type UploadState = "pending" | "uploading" | "done" | "error";

type UploadStore = {
  states: Record<string, UploadState>;
  /** Motivo da falha, por arquivo. Sem ele o mestre só vê "falhou". */
  errors: Record<string, string>;
  queue: string[];
  running: boolean;

  /** Idempotente: ignora o que já está na fila, subindo ou pronto. */
  enqueue: (assetIds: string[]) => void;
  retryFailed: () => void;
};

/**
 * Fila de upload dos arquivos da mesa.
 *
 * Um por vez, de propósito. Enviar cinco mapas em paralelo dividiria a banda
 * do mestre e faria todos chegarem tarde; em série, o primeiro já está
 * disponível para a mesa enquanto o resto sobe.
 */
export const useUploadStore = create<UploadStore>((set, get) => {
  async function drain() {
    if (get().running) return;

    set({ running: true });

    try {
      for (;;) {
        const assetId = get().queue[0];
        if (!assetId) break;

        const roomId = useRoomStore.getState().room?.id;
        // Sem sala não há para onde subir. Os itens ficam na fila e a próxima
        // chamada de `enqueue` (quando a sala abrir) retoma daqui.
        if (!roomId) break;

        set((state) => ({
          queue: state.queue.slice(1),
          states: { ...state.states, [assetId]: "uploading" },
        }));

        try {
          await uploadAsset(roomId, assetId);
          set((state) => ({ states: { ...state.states, [assetId]: "done" } }));
        } catch (cause) {
          set((state) => ({
            states: { ...state.states, [assetId]: "error" },
            errors: {
              ...state.errors,
              [assetId]: cause instanceof Error ? cause.message : "Falha no envio",
            },
          }));
        }
      }
    } finally {
      set({ running: false });
    }
  }

  return {
    states: {},
    errors: {},
    queue: [],
    running: false,

    enqueue(assetIds) {
      const { states, queue } = get();
      const fresh = assetIds.filter(
        (id) => !queue.includes(id) && states[id] !== "uploading" && states[id] !== "done",
      );

      if (fresh.length === 0) {
        // Ainda assim tenta drenar: pode haver fila parada por falta de sala.
        void drain();
        return;
      }

      set({
        queue: [...queue, ...fresh],
        states: { ...states, ...Object.fromEntries(fresh.map((id) => [id, "pending" as const])) },
      });

      void drain();
    },

    retryFailed() {
      const failed = Object.entries(get().states)
        .filter(([, state]) => state === "error")
        .map(([id]) => id);
      if (failed.length === 0) return;

      set((state) => ({
        queue: [...state.queue, ...failed],
        states: {
          ...state.states,
          ...Object.fromEntries(failed.map((id) => [id, "pending" as const])),
        },
      }));

      void drain();
    },
  };
});
