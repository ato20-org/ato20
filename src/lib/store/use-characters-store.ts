"use client";

import { create } from "zustand";
import { toast } from "sonner";

import { listCharacters } from "@/lib/vault/characters";
import { listPlayers, type Player } from "@/lib/vault/players";
import type { Personagem } from "@/types/character";

type CharactersStore = {
  /** `null` é "ainda não leu", e não uma lista vazia. */
  personagens: Personagem[] | null;
  jogadores: Player[];
  /**
   * Contador de leituras, para quem deriva algo do vínculo.
   *
   * O `useCharacterOwners` e o `useCharacterNames` leem os vínculos por conta
   * própria — é outra chamada, e nem toda tela precisa dela. Este número é o
   * sinal de "releia também".
   */
  versao: number;
  /** Número do pedido em voo. Ver `buscar`. */
  pedido: number;

  /** Lê se ninguém leu ainda. É o que cada tela chama ao montar. */
  garantir: () => void;
  /** Relê agora: alguém mexeu nos personagens. */
  recarregar: () => void;
};

/**
 * Os personagens da campanha e quem está na mesa, lidos UMA vez.
 *
 * A lista mora no store, e não em estado de cada tela, porque o número de
 * leitores explodiu: a pílula do canto conta quantos são, a janela da lista os
 * mostra, cada ficha aberta procura o seu, e desde o dock cada ABA precisa do
 * nome para se rotular. Com a busca dentro do hook, rotular três abas custava
 * três idas ao IPC — seis chamadas, porque cada uma lia personagens e jogadores.
 *
 * O disco continua sendo a verdade: ninguém escreve aqui. Quem muda algo chama
 * `recarregar`, e todas as telas recebem a leitura nova de uma vez.
 */
export const useCharactersStore = create<CharactersStore>((set, get) => ({
  personagens: null,
  jogadores: [],
  versao: 0,
  pedido: 0,

  garantir() {
    // Nunca lido e nada em voo: a primeira tela a montar dispara, as outras
    // pegam o resultado dela.
    if (get().personagens === null && get().pedido === 0) buscar(set, get);
  },

  recarregar() {
    buscar(set, get);
  },
}));

type Set = (parcial: Partial<CharactersStore>) => void;
type Get = () => CharactersStore;

/**
 * Lê os dois e guarda, se a resposta ainda for a mais nova.
 *
 * O número do pedido é o que descarta resposta velha: vincular um jogador e
 * apagar um personagem em seguida dispara duas leituras, e sem isso a primeira
 * a voltar por último gravaria o estado de antes da segunda mudança.
 *
 * Não recusa pedido novo enquanto há um em voo, de propósito: recusar faria a
 * releitura de quem acabou de mexer em algo ser silenciosamente engolida pela
 * leitura que já estava a caminho.
 */
function buscar(set: Set, get: Get) {
  const meu = get().pedido + 1;
  set({ pedido: meu });

  void Promise.all([listCharacters(), listPlayers()]).then(
    ([lista, mesa]) => {
      if (get().pedido !== meu) return;

      set({ personagens: lista, jogadores: mesa, versao: get().versao + 1 });
    },
    (cause) => {
      if (get().pedido !== meu) return;

      // Lista vazia, e não `null`: `null` faria cada tela mostrar "Lendo…" para
      // sempre. Vazio é um estado que elas sabem desenhar.
      set({ personagens: [], versao: get().versao + 1 });
      toast.error(cause instanceof Error ? cause.message : "Falha ao ler os personagens.");
    },
  );
}
