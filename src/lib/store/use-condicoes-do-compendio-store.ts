"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { toast } from "sonner";

import { t } from "@/lib/i18n/mestre";
import { listarCondicoesDoCompendio } from "@/lib/vault/compendio";
import type { MoldeDeCondicao } from "@/types/character";

type CondicoesDoCompendioStore = {
  /** `null` = ainda não leu. */
  lista: MoldeDeCondicao[] | null;
  pedido: number;
  emVoo: boolean;
  garantir: () => void;
  recarregar: () => void;
  esquecer: () => void;
};

/**
 * A biblioteca de condições da campanha: as que estão no Compêndio, e não no
 * menu do token. Ver `compendio-condicoes.json`, em `compendio.rs`.
 *
 * Em store, e não em estado da janela, porque são duas telas que a mudam: o
 * Compêndio, e a Configuração, que guarda a condição do menu aqui. O gêmeo do
 * `useCondicoesStore`, que é o menu.
 */
export const useCondicoesDoCompendioStore = create<CondicoesDoCompendioStore>((set, get) => ({
  lista: null,
  pedido: 0,
  emVoo: false,

  garantir() {
    if (get().lista === null && !get().emVoo) buscar(set, get);
  },

  recarregar() {
    buscar(set, get);
  },

  esquecer() {
    set({ lista: null, pedido: get().pedido + 1, emVoo: false });
  },
}));

type Set = (parcial: Partial<CondicoesDoCompendioStore>) => void;
type Get = () => CondicoesDoCompendioStore;

function buscar(set: Set, get: Get): void {
  const meu = get().pedido + 1;
  set({ pedido: meu, emVoo: true });

  listarCondicoesDoCompendio().then(
    (lista) => {
      if (get().pedido !== meu) return;
      set({ lista, emVoo: false });
    },
    (cause: unknown) => {
      if (get().pedido !== meu) return;
      set({ lista: [], emVoo: false });
      toast.error(cause instanceof Error ? cause.message : t.compendio.falhou);
    },
  );
}

/** A campanha passou a ser outra. O gêmeo de `esquecerCondicoes`. */
export function esquecerCondicoesDoCompendio(): void {
  useCondicoesDoCompendioStore.getState().esquecer();
}

/** A biblioteca, lida na montagem se ninguém leu. */
export function useCondicoesDoCompendio(): {
  lista: MoldeDeCondicao[] | null;
  recarregar: () => void;
} {
  const lista = useCondicoesDoCompendioStore((state) => state.lista);
  const recarregar = useCondicoesDoCompendioStore((state) => state.recarregar);
  const garantir = useCondicoesDoCompendioStore((state) => state.garantir);

  useEffect(() => {
    garantir();
  }, [garantir]);

  return { lista, recarregar };
}
