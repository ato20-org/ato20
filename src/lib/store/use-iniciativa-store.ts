"use client";

import { create } from "zustand";
import {
  type EstadoDeCombate,
  type ParticipanteDeTurno,
  estadoDeCombateVazio,
  iniciarCombate,
  avancarTurno,
  voltarTurno,
  adicionarParticipante,
  removerParticipante,
  encerrarCombate,
  participanteAtivo,
  participantesOrdenados,
} from "@/lib/combate/iniciativa";
import type { CanvasItem } from "@/types/scene";

export interface IniciativaStore {
  estado: EstadoDeCombate;
  iniciar: (lista: ParticipanteDeTurno[]) => void;
  avancarTurno: () => void;
  voltarTurno: () => void;
  adicionarParticipante: (p: ParticipanteDeTurno) => void;
  removerParticipante: (id: string) => void;
  atualizarIniciativa: (id: string, iniciativa: number, desempate?: number) => void;
  puxarTokensDaCena: (
    itens: readonly CanvasItem[],
    resolverNome?: (personagemId?: string, itemId?: string) => string,
  ) => void;
  encerrar: () => void;
  ativo: () => ParticipanteDeTurno | null;
  ordenados: () => ParticipanteDeTurno[];
}

export const useIniciativaStore = create<IniciativaStore>((set, get) => ({
  estado: estadoDeCombateVazio(),

  iniciar: (lista) => set({ estado: iniciarCombate(lista) }),

  avancarTurno: () =>
    set((state) => ({ estado: avancarTurno(state.estado) })),

  voltarTurno: () =>
    set((state) => ({ estado: voltarTurno(state.estado) })),

  adicionarParticipante: (p) =>
    set((state) => ({ estado: adicionarParticipante(state.estado, p) })),

  removerParticipante: (id) =>
    set((state) => ({ estado: removerParticipante(state.estado, id) })),

  atualizarIniciativa: (id, iniciativa, desempate) =>
    set((state) => {
      const atual = state.estado.participantes[id];
      if (!atual) return state;
      return {
        estado: adicionarParticipante(state.estado, {
          ...atual,
          iniciativa,
          ...(desempate !== undefined ? { desempate } : {}),
        }),
      };
    }),

  puxarTokensDaCena: (itens, resolverNome) => {
    const existentes = get().estado.participantes;
    const novos: ParticipanteDeTurno[] = [];

    for (const item of itens) {
      if (!item.personagemId && !item.id) continue;
      const chave = item.personagemId ?? item.id;
      if (existentes[chave]) continue;

      const nome = resolverNome
        ? resolverNome(item.personagemId, item.id)
        : item.personagemId
          ? `Token ${item.personagemId.slice(0, 4)}`
          : `Token ${item.id.slice(0, 4)}`;

      // Rola iniciativa d20 básica (1..20)
      const rolagem = Math.floor(Math.random() * 20) + 1;
      novos.push({
        id: chave,
        nome,
        iniciativa: rolagem,
      });
    }

    if (novos.length === 0) return;

    if (get().estado.rodada === 0) {
      set({ estado: iniciarCombate(novos) });
    } else {
      let estadoAtual = get().estado;
      for (const novo of novos) {
        estadoAtual = adicionarParticipante(estadoAtual, novo);
      }
      set({ estado: estadoAtual });
    }
  },

  encerrar: () => set({ estado: encerrarCombate() }),

  ativo: () => participanteAtivo(get().estado),

  ordenados: () => participantesOrdenados(get().estado),
}));
