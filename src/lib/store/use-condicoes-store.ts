"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { toast } from "sonner";

import { t } from "@/lib/i18n/personagens";
import { listarCondicoesDaCampanha } from "@/lib/vault/characters";
import type { Condicao } from "@/types/character";

type CondicoesStore = {
  /** `null` é "ainda não leu", e não um cardápio vazio. */
  modelos: Condicao[] | null;
  /** Número do último pedido disparado. Ver `buscar`. */
  pedido: number;
  emVoo: boolean;
  /** Lê se ninguém leu ainda. */
  garantir: () => void;
  /** Relê agora: alguém mexeu no cardápio. */
  recarregar: () => void;
  /** A campanha passou a ser outra: esqueça o que foi lido. */
  esquecer: () => void;
};

/**
 * O cardápio de condições da campanha, lido UMA vez.
 *
 * Em store, e não em estado de cada tela, pela razão do `useCharactersStore`:
 * são três leitores -- o menu do token, o botão de acrescentar da ficha e a
 * configuração da campanha --, e o menu do token é o que não pode esperar. Ele
 * monta quando o botão direito abre, e ler o disco ali deixaria o submenu vazio
 * no quadro em que o mestre passa o mouse por cima.
 *
 * O disco continua sendo a verdade: quem mexe chama `recarregar`.
 */
export const useCondicoesStore = create<CondicoesStore>((set, get) => ({
  modelos: null,
  pedido: 0,
  emVoo: false,

  garantir() {
    if (get().modelos === null && !get().emVoo) buscar(set, get);
  },

  recarregar() {
    buscar(set, get);
  },

  esquecer() {
    // O número sobe, e é o que descarta a resposta da campanha anterior que
    // ainda esteja a caminho. Mesma conta do `useCharactersStore`.
    set({ modelos: null, pedido: get().pedido + 1, emVoo: false });
  },
}));

type Set = (parcial: Partial<CondicoesStore>) => void;
type Get = () => CondicoesStore;

/** Lê e guarda, se a resposta ainda for a mais nova. Ver `useCharactersStore`. */
function buscar(set: Set, get: Get): void {
  const meu = get().pedido + 1;
  set({ pedido: meu, emVoo: true });

  listarCondicoesDaCampanha().then(
    (lista) => {
      if (get().pedido !== meu) return;
      set({ modelos: lista, emVoo: false });
    },
    (cause: unknown) => {
      if (get().pedido !== meu) return;

      // Vazio, e não `null`: `null` deixaria o menu dizendo "lendo" para
      // sempre. Vazio é um estado que as três telas sabem desenhar.
      set({ modelos: [], emVoo: false });
      toast.error(
        cause instanceof Error ? cause.message : t.stores.falhaAoLerCondicoes,
      );
    },
  );
}

/** A campanha passou a ser outra. O gêmeo de `esquecerPersonagens`. */
export function esquecerCondicoes(): void {
  useCondicoesStore.getState().esquecer();
}

/**
 * O cardápio e o gesto de reler. Lê na montagem se ninguém leu -- na montagem
 * e não na criação do store, pela razão de `useCharacters`: na
 * pré-renderização não há IPC.
 */
export function useCondicoesDaCampanha(): {
  modelos: Condicao[] | null;
  recarregar: () => void;
} {
  const modelos = useCondicoesStore((state) => state.modelos);
  const recarregar = useCondicoesStore((state) => state.recarregar);
  const garantir = useCondicoesStore((state) => state.garantir);

  useEffect(() => {
    garantir();
  }, [garantir]);

  return { modelos, recarregar };
}
