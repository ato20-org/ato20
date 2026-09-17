/**
 * Os sinais que um postit do mestre entende: `@personagem`, `/arquivo`,
 * `>cena`.
 *
 * Arquivo de vinte linhas, e não um par de constantes soltas dentro da camada
 * que desenha: a lista de sinais é CONTRATO entre três lugares que não se
 * conhecem — o parser, que pinta o que já está escrito; a sugestão, que
 * completa o que está sendo digitado; e o mapa de candidatos, que enche a
 * lista. Os três erram juntos ou acertam juntos, e a única forma de garantir
 * isso é os três lerem daqui.
 *
 * O caderno do jogador tem o arquivo espelho, com `#nota` no lugar de `>cena`
 * — ver `lib/player/caderno-mencoes.ts`. É a razão de os sinais serem
 * parâmetro em `lib/mencoes/`: o mesmo `/` pinça o acervo inteiro aqui e só os
 * arquivos do próprio personagem lá.
 */

import { parseMencoes, type Token } from "@/lib/mencoes/texto";
import { fragmentoNoCursor, type Fragmento } from "@/lib/mencoes/sugestao";

/** Que tipo de referência cada sinal abre, num postit. */
export const SINAIS_DO_POSTIT = {
  "@": "personagem",
  "/": "arquivo",
  ">": "cena",
} as const;

/** O sinal, como se digita. */
export type SinalDoPostit = keyof typeof SINAIS_DO_POSTIT;

/** O que uma referência do postit aponta. */
export type TipoNoPostit = (typeof SINAIS_DO_POSTIT)[SinalDoPostit];

/**
 * Os mesmos sinais em lista, para a varredura do cursor.
 *
 * Derivada do mapa com `Object.keys`, e não escrita de novo: duas listas
 * concordando por disciplina é a que um dia discorda, e o sintoma seria um
 * marcador que pinta depois de escrito mas nunca abre a lista de sugestões.
 */
export const SINAIS_EM_ORDEM = Object.keys(SINAIS_DO_POSTIT) as SinalDoPostit[];

/** O título da lista de sugestões, por sinal. */
export const TITULO_DO_POSTIT: Record<SinalDoPostit, string> = {
  "@": "Personagens da campanha",
  "/": "Arquivos da campanha",
  ">": "Mapas e quadros",
};

export function parsePostit(texto: string): Array<Token<TipoNoPostit>> {
  return parseMencoes(texto, SINAIS_DO_POSTIT);
}

export function fragmentoDoPostit(
  texto: string,
  cursor: number,
): Fragmento<SinalDoPostit> | null {
  return fragmentoNoCursor(texto, cursor, SINAIS_EM_ORDEM);
}
