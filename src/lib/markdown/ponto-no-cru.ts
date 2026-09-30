/**
 * De um ponto no texto DESENHADO da nota para o lugar dele no texto CRU.
 *
 * O editor desenha as linhas formatadas -- `**altar**` aparece "altar", em
 * negrito -- e quem clica ou arrasta por cima delas quer o cursor e a seleção
 * no mesmo lugar do texto, que é o cru. Cada trecho desenhado carrega de onde
 * veio (`CRU`, posto por `Trechos` no `markdown-view` quando o editor liga as
 * posições), e isto lê: a linha pelo `data-linha`, o trecho pelo `data-cru`, e
 * dentro dele o deslocamento do nó de texto.
 */

/** Os atributos que dizem, no DOM, de onde cada trecho veio no cru. */
export const CRU = {
  inicio: "data-cru",
  fim: "data-cru-fim",
  dentro: "data-cru-dentro",
  visivel: "data-cru-visivel",
} as const;

export type PontoNoCru = { indice: number; cru: number };

function numero(elemento: Element, atributo: string): number {
  return Number(elemento.getAttribute(atributo));
}

/**
 * O ponto `(no, deslocamento)` -- o de uma `Selection` -- em linha e posição
 * do cru, ou `null` se ele não está numa linha desenhada de `raiz`.
 *
 * - Dentro de um trecho de texto, negrito, itálico, código ou link: a posição
 *   exata, porque o que aparece é o cru sem as marcas.
 * - Dentro de uma menção: o começo dela, ou o fim, pela metade mais perto. O
 *   chip mostra o nome resolvido, e não há letra crua para cada letra dele.
 * - Fora de trecho -- o marcador da lista, o recuo, a prévia de uma linha que
 *   é só uma menção --: o começo do trecho seguinte, ou o fim da linha.
 */
export function pontoNoCru(
  no: Node,
  deslocamento: number,
  raiz: HTMLElement,
  linhas: readonly string[],
): PontoNoCru | null {
  const elemento = no instanceof Element ? no : no.parentElement;
  if (!elemento || !raiz.contains(elemento)) return null;

  const linhaEl = elemento.closest<HTMLElement>("[data-linha]");
  if (!linhaEl || !raiz.contains(linhaEl)) return null;

  const indice = Number(linhaEl.dataset.linha);
  const tamanho = (linhas[indice] ?? "").length;
  const trecho = elemento.closest(`[${CRU.inicio}]`);

  if (trecho && linhaEl.contains(trecho)) {
    const visivel = trecho.getAttribute(CRU.visivel);
    const deTexto = no.nodeType === Node.TEXT_NODE;

    if (visivel === null) {
      const metade = deTexto ? deslocamento > (no.textContent ?? "").length / 2 : deslocamento > 0;
      return { indice, cru: numero(trecho, metade ? CRU.fim : CRU.inicio) };
    }

    const quantos = Number(visivel);
    // Um nó de elemento dá o deslocamento em FILHOS, e não em letras: o ponto
    // está antes de tudo ou depois de tudo.
    const dentro = deTexto ? Math.min(deslocamento, quantos) : deslocamento > 0 ? quantos : 0;
    return { indice, cru: numero(trecho, CRU.dentro) + dentro };
  }

  const trechos = linhaEl.querySelectorAll(`[${CRU.inicio}]`);
  if (trechos.length === 0) return { indice, cru: tamanho };

  const ponto = document.createRange();
  ponto.setStart(no, deslocamento);
  for (const seguinte of trechos) {
    // O começo do trecho está no ponto ou depois dele: é o próximo.
    if (ponto.comparePoint(seguinte, 0) >= 0) return { indice, cru: numero(seguinte, CRU.inicio) };
  }
  return { indice, cru: tamanho };
}
