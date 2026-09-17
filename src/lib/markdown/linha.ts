/**
 * Markdown do documento, UMA LINHA por vez.
 *
 * Por linha e não por arquivo, de propósito: o editor do cartão é uma prévia
 * ao vivo em que a linha sob o cursor mostra o texto cru e as outras aparecem
 * desenhadas, como no Obsidian. Um analisador que precisasse do arquivo
 * inteiro para decidir o que uma linha é -- bloco de código, tabela --
 * obrigaria a redesenhar tudo a cada tecla. O que fica de fora por isso é
 * justamente o que atravessa linhas: cerca de código, tabela, parágrafo
 * dobrado. Cada linha é um bloco; a quebra é a quebra.
 *
 * Sem dependência: o que um caderno de mestre pede cabe em cem linhas, e uma
 * biblioteca de Markdown inteira pesaria no pacote que a TV também carrega.
 */

import type { Token } from "@/lib/mencoes/texto";
import { parsePostit, type TipoNoPostit } from "@/lib/mestre/postit-mencoes";

export type Bloco =
  | { tipo: "titulo"; nivel: 1 | 2 | 3; conteudo: string }
  | { tipo: "item"; conteudo: string }
  | { tipo: "numero"; numero: string; conteudo: string }
  | { tipo: "tarefa"; feita: boolean; conteudo: string }
  | { tipo: "citacao"; conteudo: string }
  | { tipo: "regua" }
  | { tipo: "vazio" }
  | { tipo: "paragrafo"; conteudo: string };

/** O que a linha é, decidido pelo começo dela. */
export function bloco(linha: string): Bloco {
  if (linha.trim() === "") return { tipo: "vazio" };
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(linha)) return { tipo: "regua" };

  const titulo = /^(#{1,3})\s+(.*)$/.exec(linha);
  if (titulo)
    return {
      tipo: "titulo",
      nivel: titulo[1]!.length as 1 | 2 | 3,
      conteudo: titulo[2]!,
    };

  const tarefa = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(linha);
  if (tarefa)
    return { tipo: "tarefa", feita: tarefa[1] !== " ", conteudo: tarefa[2]! };

  const item = /^\s*[-*]\s+(.*)$/.exec(linha);
  if (item) return { tipo: "item", conteudo: item[1]! };

  const numero = /^\s*(\d+)[.)]\s+(.*)$/.exec(linha);
  if (numero) return { tipo: "numero", numero: numero[1]!, conteudo: numero[2]! };

  const citacao = /^\s*>\s?(.*)$/.exec(linha);
  if (citacao) return { tipo: "citacao", conteudo: citacao[1]! };

  return { tipo: "paragrafo", conteudo: linha };
}

export type Trecho =
  | { tipo: "texto"; valor: string }
  | { tipo: "negrito"; valor: string }
  | { tipo: "italico"; valor: string }
  | { tipo: "codigo"; valor: string }
  | { tipo: "link"; valor: string; url: string }
  /**
   * `@personagem`, `/arquivo` ou `>cena`: as mesmas menções do postit, com o
   * mesmo parser. É o que faz a nota apontar para o que existe na campanha.
   */
  | { tipo: "mencao"; token: Token<TipoNoPostit> };

/**
 * Os trechos de dentro de uma linha: as menções e o `**negrito**` pelo parser
 * do postit, e por cima dos pedaços de texto que sobram, `*itálico*`,
 * `` `código` `` e `[texto](url)`. Sem aninhar: negrito com itálico dentro sai
 * como negrito com asteriscos, e é o custo aceito de um analisador que cabe
 * numa tela.
 */
export function trechos(conteudo: string): Trecho[] {
  const saida: Trecho[] = [];

  for (const token of parsePostit(conteudo)) {
    if (token.tipo === "texto") saida.push(...trechosSimples(token.valor));
    else if (token.tipo === "bold") saida.push({ tipo: "negrito", valor: token.valor });
    else if (token.tipo === "quebra") continue;
    else saida.push({ tipo: "mencao", token });
  }

  return saida;
}

function trechosSimples(conteudo: string): Trecho[] {
  const saida: Trecho[] = [];
  const re = /(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|((?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w]))|((?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w))/g;
  let cursor = 0;

  for (const m of conteudo.matchAll(re)) {
    const inicio = m.index ?? 0;
    if (inicio > cursor) saida.push({ tipo: "texto", valor: conteudo.slice(cursor, inicio) });

    if (m[2] !== undefined) saida.push({ tipo: "codigo", valor: m[2] });
    else if (m[4] !== undefined) saida.push({ tipo: "link", valor: m[4], url: m[5]! });
    else if (m[7] !== undefined) saida.push({ tipo: "italico", valor: m[7] });
    else if (m[9] !== undefined) saida.push({ tipo: "italico", valor: m[9] });

    cursor = inicio + m[0].length;
  }

  if (cursor < conteudo.length)
    saida.push({ tipo: "texto", valor: conteudo.slice(cursor) });

  return saida;
}
