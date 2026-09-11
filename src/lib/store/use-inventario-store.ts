"use client";

import { create } from "zustand";

type InventarioStore = {
  /**
   * Um contador por personagem. Ausente é zero.
   *
   * Por personagem, e não um número só: mexer na quantidade de uma poção do
   * Edgar não tem por que fazer a ficha da Mira reler a pasta dela. É a mesma
   * separação que `Ficha` já faz com os anexos, e pelo mesmo motivo.
   */
  versoes: Record<string, number>;
  /** O inventário deste personagem mudou: quem o mostra que releia. */
  invalidar: (personagemId: string) => void;
};

/**
 * O sinal de "releia o inventário", entre janelas.
 *
 * Existe por causa de UM gesto: arrastar um item da ficha do Edgar para a da
 * Mira. As duas fichas são janelas separadas, com estado separado, e quem
 * executa o movimento é a de destino — a de origem não fica sabendo de nada e
 * continuaria mostrando um item que já não está lá, até ser fechada e reaberta.
 *
 * Um contador, e não a lista em si: o disco continua sendo a verdade, e cada
 * ficha lê a sua. Guardar aqui os itens de todo mundo seria um cache a
 * sincronizar para resolver um problema que um número resolve.
 *
 * Mesmo desenho do `versao` em `useCharactersStore`, que sinaliza "releia os
 * vínculos" para quem os deriva.
 */
export const useInventarioStore = create<InventarioStore>((set, get) => ({
  versoes: {},

  invalidar(personagemId) {
    const atual = get().versoes[personagemId] ?? 0;

    set({ versoes: { ...get().versoes, [personagemId]: atual + 1 } });
  },
}));

/** O número desta ficha, para pendurar na dependência do efeito que lê. */
export function useVersaoInventario(personagemId: string): number {
  return useInventarioStore((state) => state.versoes[personagemId] ?? 0);
}
