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
  /** Número do último pedido disparado. Ver `buscar`. */
  pedido: number;
  /**
   * Há leitura a caminho.
   *
   * Separado do `pedido` porque os dois respondem perguntas diferentes, e
   * confundi-los custou um bug: o `garantir` pedia `pedido === 0` para dizer
   * "ninguém leu ainda", e o contador nunca volta a zero. Zerá-lo para
   * destravar seria pior -- uma resposta da campanha anterior ainda a caminho
   * voltaria a bater com o número do pedido novo e seria aceita.
   */
  emVoo: boolean;

  /** Lê se ninguém leu ainda. É o que cada tela chama ao montar. */
  garantir: () => void;
  /** Relê agora: alguém mexeu nos personagens. */
  recarregar: () => void;
  /** A campanha passou a ser outra: esqueça o que foi lido. */
  esquecer: () => void;
  /**
   * A sondagem de presença leu a mesa de novo: aceite a lista se ela mudou.
   *
   * Quem entra na mesa não mexe em personagem nenhum, então nada chamava
   * `recarregar`, e a ficha seguia dizendo "ninguém entrou" enquanto o chip do
   * canto já mostrava o jogador. O chip sonda o disco de qualquer jeito; em vez
   * de uma segunda ida ao IPC, ele entrega o que leu. Só grava se a composição
   * mudou, senão cada sondagem re-renderizaria toda ficha aberta.
   */
  receberJogadores: (mesa: Player[]) => void;
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
  emVoo: false,

  garantir() {
    // Nunca lido e nada em voo: a primeira tela a montar dispara, as outras
    // pegam o resultado dela.
    if (get().personagens === null && !get().emVoo) buscar(set, get);
  },

  recarregar() {
    buscar(set, get);
  },

  receberJogadores(mesa) {
    const atual = get().jogadores;
    const igual =
      atual.length === mesa.length &&
      atual.every(
        (jogador, i) =>
          jogador.id === mesa[i]?.id && jogador.nome === mesa[i]?.nome,
      );
    if (!igual) set({ jogadores: mesa });
  },

  esquecer() {
    // O número sobe, e é o que descarta a resposta de uma leitura da campanha
    // anterior que ainda esteja a caminho. `emVoo` volta a falso para o
    // `garantir` da próxima tela poder disparar de novo.
    //
    // O `versao` sobe junto: o `useCharacterOwners` e o `useCharacterNames`
    // leem os vínculos por conta própria, e sem este empurrão continuariam
    // mostrando quem jogava o quê na campanha que acabou de fechar.
    set({
      personagens: null,
      jogadores: [],
      pedido: get().pedido + 1,
      emVoo: false,
      versao: get().versao + 1,
    });
  },
}));

/**
 * O elenco passou a ser outro: esqueça o que foi lido. Ver `esquecer`.
 *
 * Uma campanha é uma pasta, e trocar de pasta troca os personagens. Sem isto as
 * telas montavam mostrando o elenco da campanha que acabou de fechar, e nenhuma
 * delas tinha razão para reler -- o store é de módulo e sobrevive à troca, então
 * só recarregar a janela consertava.
 *
 * O gêmeo de `esquecerAcervo`, e pela mesma razão. Ver `use-assets-store`.
 */
export function esquecerPersonagens(): void {
  useCharactersStore.getState().esquecer();
}

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
  set({ pedido: meu, emVoo: true });

  void Promise.all([listCharacters(), listPlayers()]).then(
    ([lista, mesa]) => {
      if (get().pedido !== meu) return;

      set({
        personagens: lista,
        jogadores: mesa,
        versao: get().versao + 1,
        emVoo: false,
      });
    },
    (cause) => {
      if (get().pedido !== meu) return;

      // Lista vazia, e não `null`: `null` faria cada tela mostrar "Lendo…" para
      // sempre. Vazio é um estado que elas sabem desenhar.
      set({ personagens: [], versao: get().versao + 1, emVoo: false });
      toast.error(cause instanceof Error ? cause.message : "Falha ao ler os personagens.");
    },
  );
}
