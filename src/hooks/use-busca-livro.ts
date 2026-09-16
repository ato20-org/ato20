"use client";

import { useCallback, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * Onde o termo está na folha, em FRAÇÃO da página: `x` e `y` do canto de cima
 * à esquerda, `w` e `h`, todos entre 0 e 1.
 *
 * Fração e não pontos: a folha só sabe a própria largura e proporção, e com
 * fração ela desenha o destaque sem perguntar nada ao pdf.js -- e o zoom muda
 * a largura sem recalcular a busca.
 */
export type Retangulo = { x: number; y: number; w: number; h: number };

/** Uma ocorrência do termo: em que página, o texto ao redor, e onde na folha. */
export type Ocorrencia = { pagina: number; trecho: string; retangulos: Retangulo[] };

/** Um item de texto do pdf.js, com a faixa que ele ocupa no texto colado. */
type Pedaco = {
  de: number;
  ate: number;
  /** Posição em pontos: `transform[4]` e `[5]` são a origem da linha de base. */
  transform: number[];
  width: number;
  height: number;
};

/** O que se guarda de uma página lida: o texto, os pedaços, e a medida dela. */
type PaginaLida = {
  texto: string;
  pedacos: Pedaco[];
  largura: number;
  altura: number;
};

/**
 * Os retângulos de um casamento em `[de, ate)` do texto colado.
 *
 * Um por pedaço atravessado: uma palavra partida entre dois itens sai em dois
 * retângulos, e não some. A posição dentro do pedaço é PROPORCIONAL ao número
 * de caracteres -- o pdf.js não dá largura por glifo sem medir DOM, e a
 * aproximação erra por um ou dois pixels em fonte com kerning, que um destaque
 * translúcido não denuncia.
 *
 * A altura sai do `height` do item (o tamanho da fonte, na escala da página), e
 * o retângulo desce um quinto abaixo da linha de base para cobrir o descendente
 * do "g" e do "p". O eixo y do PDF cresce para cima; o da folha, para baixo.
 */
function retangulosDe(pagina: PaginaLida, de: number, ate: number): Retangulo[] {
  const saida: Retangulo[] = [];

  for (const pedaco of pagina.pedacos) {
    if (pedaco.ate <= de || pedaco.de >= ate) continue;

    const total = pedaco.ate - pedaco.de;
    if (total === 0 || pedaco.width === 0) continue;

    const c0 = Math.max(de, pedaco.de) - pedaco.de;
    const c1 = Math.min(ate, pedaco.ate) - pedaco.de;
    const h = pedaco.height || Math.abs(pedaco.transform[3]) || 10;
    const x = pedaco.transform[4] + pedaco.width * (c0 / total);
    const w = pedaco.width * ((c1 - c0) / total);
    const yBase = pedaco.transform[5];

    saida.push({
      x: x / pagina.largura,
      y: (pagina.altura - (yBase + h * 0.8)) / pagina.altura,
      w: w / pagina.largura,
      h: h / pagina.altura,
    });
  }

  return saida;
}

/** Quantos caracteres de contexto entram no trecho, de cada lado do achado. */
const CONTEXTO = 48;

/** Teto de ocorrências. Além disto a lista deixa de ser navegável e vira ruído. */
const MAX = 200;

/**
 * Sem acento e em minúscula.
 *
 * Buscar "condicoes" tem de achar "Condições": o mestre digita depressa no meio
 * da sessão, e num manual em português exigir o acento certo transforma a busca
 * em adivinhação. `NFD` separa a letra do sinal, e o intervalo apaga só os
 * sinais.
 */
function simplificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

type BuscaApi = {
  resultados: Ocorrencia[];
  /** Quantas páginas já foram varridas, e de quantas. `null` fora da busca. */
  progresso: { lidas: number; total: number } | null;
  buscar: (termo: string) => Promise<void>;
  limpar: () => void;
};

/**
 * Busca no texto do livro.
 *
 * Varredura página por página com o texto do próprio pdf.js, e não índice
 * gravado no disco: um índice pede tabela, invalidação e um momento para ser
 * construído — e a pergunta que ele responderia mais rápido é feita uma ou duas
 * vezes por sessão. O texto de cada página fica guardado em memória enquanto o
 * livro está aberto, então a segunda busca não relê nada.
 *
 * Manual escaneado sem OCR não tem texto nenhum, e aí a busca não acha nada.
 * Isso é honesto: o que não existe no arquivo não pode ser encontrado.
 */
export function useBuscaLivro(doc: PDFDocumentProxy | null): BuscaApi {
  const [resultados, setResultados] = useState<Ocorrencia[]>([]);
  const [progresso, setProgresso] = useState<{ lidas: number; total: number } | null>(null);

  /** O que já foi lido, por página. Vive enquanto o livro está aberto. */
  const cache = useRef(new Map<number, PaginaLida>());

  /**
   * Qual busca é a atual.
   *
   * Digitar de novo antes de a varredura terminar tem de ABANDONAR a anterior:
   * sem isso as duas escrevem na mesma lista, e o resultado é a mistura de dois
   * termos.
   */
  const geracao = useRef(0);

  const limpar = useCallback(() => {
    geracao.current += 1;
    setResultados([]);
    setProgresso(null);
  }, []);

  const buscar = useCallback(
    async (termo: string) => {
      const alvo = simplificar(termo.trim());

      // Uma letra acha metade do manual. Duas ainda é pouco, mas é a menor
      // busca útil ("d6", "PV") e o teto de ocorrências protege a lista.
      if (!doc || alvo.length < 2) {
        limpar();
        return;
      }

      geracao.current += 1;
      const minha = geracao.current;

      const total = doc.numPages;
      const achados: Ocorrencia[] = [];

      setResultados([]);
      setProgresso({ lidas: 0, total });

      for (let pagina = 1; pagina <= total; pagina += 1) {
        if (geracao.current !== minha) return;

        let lida = cache.current.get(pagina);

        if (lida === undefined) {
          const page = await doc.getPage(pagina);
          const conteudo = await page.getTextContent();
          const viewport = page.getViewport({ scale: 1 });

          // Fim de linha vira espaço: sem isso "ataque" e "furtivo" em linhas
          // seguidas se colam em "ataquefurtivo", e a busca pelas duas palavras
          // juntas nunca acha o que está ali. Cada item guarda a faixa que ocupa
          // no texto colado, que é o que devolve o achado ao lugar na folha.
          let texto = "";
          const pedacos: Pedaco[] = [];
          for (const item of conteudo.items) {
            if (!("str" in item)) continue;

            pedacos.push({
              de: texto.length,
              ate: texto.length + item.str.length,
              transform: item.transform,
              width: item.width,
              height: item.height,
            });
            texto += item.str + (item.hasEOL ? " " : "");
          }

          lida = { texto, pedacos, largura: viewport.width, altura: viewport.height };
          cache.current.set(pagina, lida);
        }

        const { texto } = lida;
        // A simplificação preserva as posições: `NFD` separa a letra do sinal e
        // o sinal é apagado, então cada caractere original continua onde estava.
        const simples = simplificar(texto);

        for (let de = simples.indexOf(alvo); de !== -1; de = simples.indexOf(alvo, de + 1)) {
          // O trecho sai do texto ORIGINAL, com acento e maiúscula: a
          // simplificação preserva as posições, e mostrar o texto simplificado
          // devolveria ao mestre um manual sem acentos.
          const inicio = Math.max(0, de - CONTEXTO);
          const fim = Math.min(texto.length, de + alvo.length + CONTEXTO);

          achados.push({
            pagina,
            trecho: `${inicio > 0 ? "…" : ""}${texto.slice(inicio, fim).trim()}${
              fim < texto.length ? "…" : ""
            }`,
            retangulos: retangulosDe(lida, de, de + alvo.length),
          });

          if (achados.length >= MAX) break;
        }

        // Resultado parcial a cada página, e não só no fim: num manual de
        // trezentas páginas a primeira ocorrência costuma servir, e esperar a
        // varredura inteira para mostrá-la seria esperar por nada.
        setResultados([...achados]);
        setProgresso({ lidas: pagina, total });

        if (achados.length >= MAX) break;
      }

      if (geracao.current === minha) setProgresso(null);
    },
    [doc, limpar],
  );

  return { resultados, progresso, buscar, limpar };
}
