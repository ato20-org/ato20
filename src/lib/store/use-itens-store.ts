"use client";

import { useEffect } from "react";
import { create } from "zustand";

import { useInventarioStore } from "@/lib/store/use-inventario-store";
import { listItens, listPortadores } from "@/lib/vault/itens";
import type { Item, Portador } from "@/types/inventory";

type ItensStore = {
  /** `null` é "ainda não leu", e não um catálogo vazio. */
  itens: Item[] | null;
  /** Quem carrega o quê. Lido junto com o catálogo, e pela mesma razão. */
  portadores: Portador[];
  /** Número do pedido mais novo. Ver `buscar`. */
  pedido: number;
  emVoo: boolean;

  /** Lê se ninguém leu ainda. É o que cada tela chama ao montar. */
  garantir: () => void;
  /** Relê agora, se alguém já tinha lido. */
  recarregar: () => void;
  /** O catálogo passou a ser OUTRO: a campanha trocou. */
  esquecer: () => void;
};

/**
 * O catálogo de itens da campanha, lido UMA vez.
 *
 * Mesmo desenho do `useAssetsStore`, e pela mesma razão: muitas telas perguntam
 * pelo mesmo item — a janela de Itens, o cartão de um ponto, o handout, o gizmo
 * da peça no mapa, o aviso do que está no ar —, e cada uma com a sua leitura
 * envelheceria sozinha. Trocar o nome da espada na janela de Itens deixaria o
 * ponto do mapa mostrando o nome antigo até ser fechado e aberto de novo.
 *
 * O disco continua sendo a verdade, e ninguém escreve aqui: quem muda um item
 * chama `itensMudaram`, e todas as telas recebem a leitura nova de uma vez.
 */
export const useItensStore = create<ItensStore>((set, get) => ({
  itens: null,
  portadores: [],
  pedido: 0,
  emVoo: false,

  garantir() {
    const { itens, emVoo } = get();
    if (itens === null && !emVoo) buscar(set, get);
  },

  recarregar() {
    const { itens, emVoo } = get();

    // Catálogo que ninguém pediu continua sem ser lido: dar um item pela ficha
    // não é razão para ler o catálogo inteiro se nenhuma tela o mostra.
    if (itens === null && !emVoo) return;

    buscar(set, get);
  },

  esquecer() {
    // O número sobe, e é o que descarta a resposta de uma leitura da campanha
    // anterior que ainda esteja a caminho. Mesma conta do `useAssetsStore`.
    set({
      itens: null,
      portadores: [],
      pedido: get().pedido + 1,
      emVoo: false,
    });
  },
}));

type Set = (parcial: Partial<ItensStore>) => void;
type Get = () => ItensStore;

/**
 * Lê o catálogo e os portadores, e guarda se a resposta ainda for a mais nova.
 *
 * Os dois juntos, e não dois pedidos que chegam em momentos diferentes: a
 * janela de Itens desenha a linha com o nome do item E com quem está, e uma
 * resposta sem a outra mostraria por um instante o item novo sem dono.
 */
function buscar(set: Set, get: Get) {
  const meu = get().pedido + 1;
  set({ pedido: meu, emVoo: true });

  void Promise.all([listItens(), listPortadores()]).then(
    ([itens, portadores]) => {
      if (get().pedido !== meu) return;

      set({ itens, portadores, emVoo: false });
    },
    () => {
      // Sem campanha aberta o catálogo é vazio, não quebrado. Ver
      // `useAssetsStore`, que faz a mesma escolha.
      if (get().pedido !== meu) return;

      set({ itens: [], portadores: [], emVoo: false });
    },
  );
}

/** O catálogo, garantido. `null` enquanto lê. */
export function useItens(): Item[] | null {
  const itens = useItensStore((state) => state.itens);

  useEffect(() => {
    useItensStore.getState().garantir();
  }, []);

  return itens;
}

/**
 * Um item do catálogo, por id.
 *
 * `undefined` enquanto lê E quando o item não existe mais — quem desenha
 * distingue os dois pelo `useItens`, quando precisa. Um ponto que cita um item
 * apagado mostra o lugar vazio, e não some com o resto do cartão.
 */
export function useItemDaCampanha(id: string | undefined): Item | undefined {
  const itens = useItens();

  return id ? itens?.find((item) => item.id === id) : undefined;
}

/**
 * Algo mudou nos itens: relê o catálogo, e as fichas abertas releem os
 * inventários delas.
 *
 * `personagens` diz QUAIS inventários mudaram, quando quem chama sabe — dar um
 * item à Mira não tem por que fazer a ficha do Edgar reler a pasta dele. Sem a
 * lista, todos: é o caso de trocar o nome ou a imagem de um item, que aparece
 * em qualquer ficha que o tenha.
 */
export function itensMudaram(personagens?: string[]): void {
  useItensStore.getState().recarregar();

  const { invalidar, invalidarTodos } = useInventarioStore.getState();

  if (personagens) {
    for (const personagemId of personagens) invalidar(personagemId);
  } else {
    invalidarTodos();
  }
}

/** O catálogo passou a ser outro: esqueça o que foi lido. Ver `esquecer`. */
export function esquecerItens(): void {
  useItensStore.getState().esquecer();
}
