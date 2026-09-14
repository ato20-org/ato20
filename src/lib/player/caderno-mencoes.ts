/**
 * Os sinais que uma nota do caderno entende: `@personagem`, `/arquivo`,
 * `#nota`.
 *
 * O espelho do `postit-mencoes.ts` do mestre, e as diferenças entre os dois são
 * a feature:
 *
 * - `@` só alcança personagem COM JOGADOR. O mestre menciona o vilão que
 *   ninguém viu; o jogador não pode nem ver que ele existe, e quem garante isso
 *   é o daemon em `/eu/mesa/personagens`, não esta lista.
 * - `/` só alcança arquivo dos personagens DELE, mais os que ele mesmo mandou.
 *   O acervo da campanha inteira é do outro lado da mesa.
 * - `>cena` não existe aqui. O celular não tem lista de cenas — tem a que está
 *   no ar —, e um marcador que nunca resolve é pior que marcador nenhum.
 * - `#nota` não existe lá. É o que liga uma nota à outra: a suspeita escrita na
 *   segunda sessão aponta para o nome anotado na primeira, e o caderno vira
 *   caderno em vez de virar uma pilha de papéis soltos.
 *
 * `#` é menção, e NÃO etiqueta. As etiquetas são campo próprio da nota, com
 * lista e filtro: usar o mesmo caractere para as duas coisas deixaria cada `#`
 * digitado ambíguo no meio da frase — e a desambiguação teria de ser adivinhada
 * a cada tecla.
 */

import { parseMencoes, type Token } from "@/lib/mencoes/texto";
import { fragmentoNoCursor, type Fragmento } from "@/lib/mencoes/sugestao";

/** Que tipo de referência cada sinal abre, numa nota. */
export const SINAIS_DA_NOTA = {
  "@": "personagem",
  "/": "arquivo",
  "#": "nota",
} as const;

export type SinalDaNota = keyof typeof SINAIS_DA_NOTA;

export type TipoNaNota = (typeof SINAIS_DA_NOTA)[SinalDaNota];

/** Os mesmos sinais em lista, para a varredura do cursor. */
export const SINAIS_DA_NOTA_EM_ORDEM = Object.keys(SINAIS_DA_NOTA) as SinalDaNota[];

/**
 * O título da lista de sugestões, por sinal.
 *
 * Diz de ONDE a lista saiu, e não só o que ela é: "Arquivos deste personagem" é
 * a diferença visível entre o `/` do caderno e o `/` do postit do mestre, que
 * pinça o acervo inteiro.
 */
export const TITULO_DA_NOTA: Record<SinalDaNota, string> = {
  "@": "Personagens da mesa",
  "/": "Seus arquivos",
  "#": "Notas do caderno",
};

export function parseNota(texto: string): Array<Token<TipoNaNota>> {
  return parseMencoes(texto, SINAIS_DA_NOTA);
}

export function fragmentoDaNota(texto: string, cursor: number): Fragmento<SinalDaNota> | null {
  return fragmentoNoCursor(texto, cursor, SINAIS_DA_NOTA_EM_ORDEM);
}
