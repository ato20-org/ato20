"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { toast } from "sonner";

import { t } from "@/lib/i18n/personagens";
import { lerMoldeDeDetalhes } from "@/lib/vault/detalhes";
import type { MoldeDeDetalhes } from "@/types/detalhe";

/**
 * O molde dos detalhes da campanha: os grupos (nome, exibição, lugar) e os
 * modelos.
 *
 * Num store, e não lido por cada ficha, porque toda ficha aberta precisa dos
 * GRUPOS para saber como desenhar o que tem, e a configuração da campanha
 * edita o mesmo molde. Como o cardápio de condições: lê na primeira tela que
 * pede, e esquece ao trocar de campanha.
 */
type MoldeStore = {
  molde: MoldeDeDetalhes | null;
  pedido: number;
  emVoo: boolean;
  /**
   * Sobe quando uma ação do molde mexeu nas fichas -- aplicar em todos,
   * modelo novo, grupo renomeado. A ficha aberta relê os detalhes dela.
   */
  fichasMudaram: number;

  garantir: () => void;
  recarregar: () => void;
  /** O molde mudou e as fichas também: relê o molde e avisa as fichas. */
  avisarFichas: () => void;
  esquecer: () => void;
};

export const useMoldeDeDetalhesStore = create<MoldeStore>((set, get) => ({
  molde: null,
  pedido: 0,
  emVoo: false,
  fichasMudaram: 0,

  garantir() {
    if (get().molde === null && !get().emVoo) buscar(set, get);
  },

  recarregar() {
    buscar(set, get);
  },

  avisarFichas() {
    set({ fichasMudaram: get().fichasMudaram + 1 });
    buscar(set, get);
  },

  esquecer() {
    set({ molde: null, pedido: get().pedido + 1, emVoo: false });
  },
}));

type Set = (parcial: Partial<MoldeStore>) => void;
type Get = () => MoldeStore;

function buscar(set: Set, get: Get): void {
  const meu = get().pedido + 1;
  set({ pedido: meu, emVoo: true });

  lerMoldeDeDetalhes().then(
    (molde) => {
      if (get().pedido !== meu) return;
      set({ molde, emVoo: false });
    },
    (cause: unknown) => {
      if (get().pedido !== meu) return;
      set({ molde: { grupos: [], modelos: [] }, emVoo: false });
      toast.error(cause instanceof Error ? cause.message : t.detalhes.falhaAoLerMolde);
    },
  );
}

/** A campanha passou a ser outra. O gêmeo de `esquecerCondicoes`. */
export function esquecerMoldeDeDetalhes(): void {
  useMoldeDeDetalhesStore.getState().esquecer();
}

/** O molde, lido na montagem se ninguém leu. */
export function useMoldeDeDetalhes(): MoldeDeDetalhes | null {
  const molde = useMoldeDeDetalhesStore((state) => state.molde);
  const garantir = useMoldeDeDetalhesStore((state) => state.garantir);

  useEffect(() => garantir(), [garantir]);

  return molde;
}
