"use client";

import { create } from "zustand";

import { checkRoom } from "@/lib/sync/server-channel";

const CODE_LENGTH = 6;

/**
 * A mesa que esta tela de espectador encontrou.
 *
 * Espelha o `use-campaign-store` do Operador, e por isso existe: "qual mesa
 * está aberta aqui" é estado de aplicação, não estado de um formulário. Quem
 * precisa dele são a porta, o cabeçalho da Plateia e a inscrição no SSE — três
 * lugares, o que já descarta guardá-lo dentro de um componente.
 *
 * Ele também resolve um atrito real: a conferência do código é assíncrona e
 * dispara na montagem, e escrever estado de dentro de um efeito para isso
 * encadeia render dentro de render. Num store fora do React o problema não
 * existe.
 */
export type ViewerStatus =
  | "idle"
  /** Conferindo um código — digitado ou vindo da URL. */
  | "conferindo"
  /** Nenhum código aceito ainda. A porta pede um. */
  | "fechada"
  | "aberta";

type ViewerStore = {
  status: ViewerStatus;
  /** Código já conferido. `null` enquanto a porta não abriu. */
  codigo: string | null;
  /** Nome da campanha, para o jogador confirmar que entrou na mesa certa. */
  nome: string | null;
  erro: string | null;

  /**
   * Tenta o código que veio na URL.
   *
   * Chamado na montagem. O QR do Operador já traz o código: a TV não tem quem
   * digite nela, e o jogador não deveria copiar seis caracteres do outro lado
   * da mesa. Sem código na URL, só abre a porta.
   */
  boot: () => Promise<void>;
  conferir: (candidato: string) => Promise<void>;
};

export const useViewerStore = create<ViewerStore>((set, get) => ({
  status: "idle",
  codigo: null,
  nome: null,
  erro: null,

  async boot() {
    if (get().status !== "idle") return;

    const daUrl = (new URLSearchParams(window.location.search).get("code") ?? "")
      .trim()
      .toUpperCase();

    if (daUrl.length !== CODE_LENGTH) {
      set({ status: "fechada" });
      return;
    }

    await get().conferir(daUrl);
  },

  async conferir(candidato) {
    const limpo = candidato.trim().toUpperCase();
    if (limpo.length !== CODE_LENGTH) return;

    set({ status: "conferindo", erro: null });

    // Mesma origem: quem serviu esta página foi o próprio daemon, então não há
    // endereço a descobrir.
    const resultado = await checkRoom("", limpo);

    if ("erro" in resultado) {
      set({ status: "fechada", erro: resultado.erro });
      return;
    }

    set({ status: "aberta", codigo: limpo, nome: resultado.nome, erro: null });

    // Guarda o código na URL para o refresh e o favorito reencontrarem a mesa.
    // `replaceState` e não navegação: navegar remontaria a árvore e reabriria o
    // fluxo que acabou de ser aceito.
    const url = new URL(window.location.href);
    if (url.searchParams.get("code") !== limpo) {
      url.searchParams.set("code", limpo);
      window.history.replaceState(null, "", url);
    }
  },
}));

export { CODE_LENGTH };
