"use client";

import { useCallback, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/** Uma ocorrência do termo: em que página, e o texto ao redor. */
export type Ocorrencia = { pagina: number; trecho: string };

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

  /** O texto já lido, por página. Vive enquanto o livro está aberto. */
  const cache = useRef(new Map<number, string>());

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

        let texto = cache.current.get(pagina);

        if (texto === undefined) {
          const page = await doc.getPage(pagina);
          const conteudo = await page.getTextContent();

          // Fim de linha vira espaço: sem isso "ataque" e "furtivo" em linhas
          // seguidas se colam em "ataquefurtivo", e a busca pelas duas palavras
          // juntas nunca acha o que está ali.
          texto = conteudo.items
            .map((item) => ("str" in item ? item.str + (item.hasEOL ? " " : "") : ""))
            .join("");

          cache.current.set(pagina, texto);
        }

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
