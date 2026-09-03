"use client";

import { create } from "zustand";

import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  createRoom,
  findMasterRoom,
  joinRoomByCode,
  unlockRoom,
  type Room,
} from "@/lib/supabase/rooms";

export type RoomStatus =
  /** Nada tentado ainda. */
  | "idle"
  /** Sem Supabase configurado: o app segue local, sem Plateia. */
  | "offline"
  | "loading"
  /**
   * Ninguém comanda mesa nenhuma neste navegador. Falta o código de operação
   * ou uma mesa nova.
   */
  | "locked"
  | "ready"
  | "error";

type RoomStore = {
  status: RoomStatus;
  room: Room | null;
  role: "master" | "player" | null;
  error: string | null;
  /**
   * Uma ação da porta está em curso.
   *
   * Separado de `status` de propósito: se destravar virasse `loading`, a porta
   * sairia da tela no envio e levaria junto o código digitado e a mensagem de
   * erro — quem errou a senha teria de redigitar do zero para ler o motivo.
   */
  busy: boolean;

  /**
   * Chamado pelo Operador: garante sessão anônima e procura a mesa deste
   * navegador. Não cria mesa — criar é um ato do mestre, não um efeito de
   * abrir a tela.
   */
  connectAsMaster: () => Promise<void>;
  /** Assume a mesa com o código de operação, de qualquer navegador. */
  unlock: (operatorCode: string) => Promise<void>;
  /** Abre uma mesa nova e devolve a senha, que só aparece uma vez. */
  openRoom: () => Promise<string>;
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
  busy: false,

  async connectAsMaster() {
    if (!isSupabaseConfigured()) {
      set({ status: "offline" });
      return;
    }

    // Duas montagens do Operador não devem disparar duas buscas.
    if (get().status === "loading" || get().status === "ready") return;

    set({ status: "loading", error: null });

    try {
      const room = await findMasterRoom();

      // Já mestre neste navegador: entra sem pedir a senha. Ela protege contra
      // quem NÃO comanda a mesa — e exigi-la a cada F5 de quem já comanda
      // seria o mesmo atrito de digitar código que já incomodou na Plateia.
      if (room) {
        set({ room, role: "master", status: "ready" });
        return;
      }

      set({ room: null, role: null, status: "locked" });
    } catch (cause) {
      set({ status: "error", error: describe(cause) });
    }
  },

  async unlock(operatorCode) {
    if (get().busy) return;

    set({ busy: true, error: null });

    try {
      const room = await unlockRoom(operatorCode);
      set({ room, role: "master", status: "ready", busy: false });
    } catch {
      // A mensagem do servidor vem em minúsculas e sem contexto. Distinguir
      // "não existe" de "errada" só ajudaria quem está adivinhando.
      set({ busy: false, error: "Código de operação inválido." });
    }
  },

  async openRoom() {
    set({ busy: true, error: null });

    try {
      const room = await createRoom();
      set({ room: { id: room.id, code: room.code }, role: "master", status: "ready", busy: false });

      return room.operatorCode;
    } catch (cause) {
      set({ busy: false, error: describe(cause) });
      throw cause;
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
