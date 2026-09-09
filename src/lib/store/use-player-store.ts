"use client";

import { create } from "zustand";

import {
  fetchMe,
  forget,
  join,
  patchMe,
  storedToken,
  type PlayerSheet,
} from "@/lib/player/session";

/**
 * A ficha do jogador neste aparelho.
 *
 * Separada do `use-viewer-store` de propósito: entrar na MESA e entrar como
 * JOGADOR são duas coisas. A TV entra na mesa e nunca vira jogador; um jogador
 * que só quer ver o mapa também não precisa criar ficha. Juntar as duas faria
 * cada aparelho que abre a Plateia criar uma linha na campanha do mestre — e a
 * lista dele encheria de fantasmas.
 */
export type PlayerStatus =
  | "idle"
  /** Sem ficha neste aparelho. A aba pede um nome. */
  | "fora"
  | "entrando"
  | "dentro"
  | "erro";

type PlayerStore = {
  status: PlayerStatus;
  sheet: PlayerSheet | null;
  erro: string | null;

  /**
   * Procura uma credencial guardada e abre a ficha.
   *
   * `null` do servidor cobre dois casos que a tela trata igual: nunca entrou, e
   * o mestre tirou este jogador da mesa. No segundo o token já foi esquecido —
   * ver `fetchMe`.
   */
  boot: (codigo: string) => Promise<void>;
  entrar: (codigo: string, nome: string) => Promise<void>;
  /** Grava nome ou notas e atualiza a ficha local. */
  atualizar: (codigo: string, patch: { nome?: string; notas?: string }) => Promise<void>;
  /** Esquece a credencial deste aparelho. Não mexe na mesa. */
  sair: (codigo: string) => void;
};

function descreve(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Falha ao falar com a mesa";
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  status: "idle",
  sheet: null,
  erro: null,

  async boot(codigo) {
    if (get().status !== "idle") return;

    if (!storedToken(codigo)) {
      set({ status: "fora" });
      return;
    }

    try {
      const sheet = await fetchMe(codigo);
      set(sheet ? { status: "dentro", sheet } : { status: "fora", sheet: null });
    } catch (cause) {
      set({ status: "erro", erro: descreve(cause) });
    }
  },

  async entrar(codigo, nome) {
    if (get().status === "entrando") return;

    set({ status: "entrando", erro: null });

    try {
      set({ status: "dentro", sheet: await join(codigo, nome) });
    } catch (cause) {
      // Volta para `fora`, e não `erro`: o caminho de saída é digitar o nome de
      // novo, e é a mesma tela.
      set({ status: "fora", erro: descreve(cause) });
    }
  },

  async atualizar(codigo, patch) {
    const { sheet } = get();
    if (!sheet) return;

    // Otimista: no celular, no meio da sessão, esperar a resposta para o texto
    // aparecer faria a digitação engasgar. O servidor é a verdade, mas ele
    // concorda em praticamente todos os casos.
    set({ sheet: { ...sheet, ...patch } });

    try {
      await patchMe(codigo, patch);
      set({ erro: null });
    } catch (cause) {
      set({ erro: descreve(cause) });
    }
  },

  sair(codigo) {
    forget(codigo);
    set({ status: "fora", sheet: null, erro: null });
  },
}));
