import type { LinhaDaArvore } from "@/lib/mestre/arvore-de-pastas";
import { normaliza } from "@/lib/search";

/** O que a busca e o filtro de tags do Compêndio pedem. */
export type FiltroDoCompendio = {
  /** O texto da busca: acha pelo nome e pelas tags. */
  busca: string;
  /** As tags ligadas no filtro. A coisa precisa ter TODAS. */
  tags: string[];
};

/**
 * O que bate com a busca e com as tags ligadas, em ordem de nome.
 *
 * O texto acha pelo nome e pelas tags -- "morto" acha o Esqueleto marcado
 * "morto-vivo" --, cada palavra à parte, sem acento nem caixa, como as outras
 * buscas do Mestre. Ver `normaliza`.
 *
 * As tags ligadas SOMAM: "morto-vivo" e "chefe" mostram só o que tem as duas.
 * É o filtro que estreita, e estreitar é o que se quer de um bestiário de
 * trezentas criaturas; "uma ou outra" se faz desligando uma.
 *
 * Em ordem de nome, e não de criação: um bestiário se consulta como um livro.
 * `localeCompare` com `sensitivity: "base"` põe "Órc" junto de "Orc".
 */
export function filtrarNoCompendio<T>(
  lista: T[],
  filtro: FiltroDoCompendio,
  nomeDe: (coisa: T) => string,
  tagsDe: (coisa: T) => string[] = () => [],
): T[] {
  const termos = normaliza(filtro.busca).split(/\s+/).filter(Boolean);
  const exigidas = filtro.tags.map(normaliza);

  return lista
    .filter((coisa) => {
      const tags = tagsDe(coisa).map(normaliza);
      const onde = [normaliza(nomeDe(coisa)), ...tags].join(" ");

      return (
        termos.every((termo) => onde.includes(termo)) &&
        exigidas.every((tag) => tags.includes(tag))
      );
    })
    .sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), undefined, { sensitivity: "base" }));
}

/**
 * As tags de uma lista, cada uma uma vez, com quantas coisas a usam.
 *
 * É a fileira do filtro e as sugestões do editor. Uma vez por grafia sem caixa
 * nem acento -- "Chefe" num goblin e "chefe" num orc são o mesmo botão --, com
 * a grafia que apareceu primeiro. Em ordem de nome.
 */
export function tagsDaLista<T>(
  lista: T[],
  tagsDe: (coisa: T) => string[],
): Array<{ tag: string; total: number }> {
  const contagem = new Map<string, { tag: string; total: number }>();

  for (const coisa of lista) {
    for (const tag of tagsDe(coisa)) {
      const chave = normaliza(tag);
      const atual = contagem.get(chave);
      if (atual) atual.total += 1;
      else contagem.set(chave, { tag, total: 1 });
    }
  }

  return [...contagem.values()].sort((a, b) =>
    a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }),
  );
}

/** A tag está na lista, sem ligar para caixa nem acento. */
export function temTag(tags: string[], tag: string): boolean {
  const chave = normaliza(tag);
  return tags.some((atual) => normaliza(atual) === chave);
}

/**
 * A árvore achatada em BLOCOS, para desenhar em cards: cada pasta é um bloco,
 * e cada sequência de coisas no mesmo nível vira uma grade.
 *
 * A lista desenha uma linha por coisa e não precisa disto; o card precisa,
 * porque uma grade é um elemento só com várias coisas dentro, e as coisas de
 * uma pasta vêm logo depois dela -- e das subpastas dela -- na ordem que
 * `achatarArvore` devolve. Juntar as vizinhas de mesma profundidade é o que
 * põe os goblins da pasta "Humanoides" numa grade embaixo do nome dela.
 */
export function blocosDaArvore<T>(
  linhas: LinhaDaArvore<T>[],
): Array<
  | { tipo: "pasta"; linha: Extract<LinhaDaArvore<T>, { tipo: "pasta" }> }
  | { tipo: "grade"; depth: number; itens: T[] }
> {
  const blocos: ReturnType<typeof blocosDaArvore<T>> = [];

  for (const linha of linhas) {
    if (linha.tipo === "pasta") {
      blocos.push({ tipo: "pasta", linha });
      continue;
    }

    const ultimo = blocos.at(-1);
    if (ultimo?.tipo === "grade" && ultimo.depth === linha.depth) ultimo.itens.push(linha.item);
    else blocos.push({ tipo: "grade", depth: linha.depth, itens: [linha.item] });
  }

  return blocos;
}

/**
 * A árvore só até a `limite`-ésima coisa, com as pastas que vêm antes dela.
 *
 * É a montagem aos poucos da grade: com trezentos moldes, montar todos os
 * cards de uma vez custa caro, e ligar uma tag os desmonta e remonta. Corta-se
 * por COISAS, e não por linhas, porque uma pasta é só um cabeçalho e não pesa;
 * as pastas depois do corte esperam o próximo lote, junto do que há nelas.
 */
export function cortarArvore<T>(linhas: LinhaDaArvore<T>[], limite: number): LinhaDaArvore<T>[] {
  const cortadas: LinhaDaArvore<T>[] = [];
  let coisas = 0;

  for (const linha of linhas) {
    if (linha.tipo === "item") {
      if (coisas >= limite) break;
      coisas += 1;
    } else if (coisas >= limite) {
      break;
    }
    cortadas.push(linha);
  }

  return cortadas;
}
