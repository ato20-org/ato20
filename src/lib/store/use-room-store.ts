"use client";

import { create } from "zustand";

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { ensureMasterRoom, joinRoomByCode, type Room } from "@/lib/supabase/rooms";

export type RoomStatus =
  /** Nada tentado ainda. */
  | "idle"
  /** Sem Supabase configurado: o app segue local, sem Plateia. */
  | "offline"
  | "loading"
  | "ready"
  | "error";

type RoomStore = {
  status: RoomStatus;
  room: Room | null;
  role: "master" | "player" | null;
  error: string | null;

  /** Chamado pelo Operador: garante sessão anônima e a sala permanente dele. */
  connectAsMaster: () => Promise<void>;
  /** Chamado pela Plateia com o código digitado ou vindo da URL. */
  connectAsPlayer: (code: string) => Promise<void>;
};

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;

  return "Falha ao conectar na sala";
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  status: "idle",
  room: null,
  role: null,
  error: null,

  async connectAsMaster() {
    if (!isSupabaseConfigured()) {
      set({ status: "offline" });
      return;
    }

    // Duas montagens do Operador não devem abrir duas salas.
    if (get().status === "loading" || get().status === "ready") return;

    set({ status: "loading", error: null });

    try {
      set({ room: await ensureMasterRoom(), role: "master", status: "ready" });
    } catch (cause) {
      set({ status: "error", error: describe(cause) });
    }
  },

  async connectAsPlayer(code) {
    if (!isSupabaseConfigured()) {
      set({ status: "offline" });
      return;
    }

    if (get().status === "loading") return;

    // Já dentro desta mesma mesa: sair daqui evita um RPC redundante quando o
    // efeito de auto-entrada roda de novo, por exemplo depois de a URL ganhar
    // o código.
    const normalized = code.trim().toUpperCase();
    if (get().status === "ready" && get().room?.code === normalized) return;

    set({ status: "loading", error: null });

    try {
      set({ room: await joinRoomByCode(normalized), role: "player", status: "ready" });
    } catch (cause) {
      set({ status: "error", error: describe(cause) });
    }
  },
}));
