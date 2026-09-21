"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { pdfjs, RUNTIME } from "@/lib/leitor/pdfjs";

/**
 * De onde o pdf.js lê os bytes.
 *
 * O que o `getDocument` já aceita, e não um endereço nosso, porque os dois
 * documentos que o app abre chegam por caminhos diferentes: o livro é a rota
 * `/livro/{id}` com o token no cabeçalho, e a ficha é uma blob URL que o
 * visualizador do anexo já baixou por IPC. Ver `livroFonte` e `PdfBody`.
 */
export type PdfFonte = {
  url: string;
  httpHeaders?: Record<string, string>;
};

export type PdfDoc =
  | { estado: "abrindo" }
  | { estado: "aberto"; doc: PDFDocumentProxy; paginas: number }
  | { estado: "falhou"; motivo: string };

/**
 * O que a última abertura resolvida deixou, e de que documento ela era.
 *
 * A chave viaja junto e é conferida na saída, como no `useAssetUrl`: é o que
 * permite o estado "abrindo" ser DERIVADO — enquanto o resolvido não é deste
 * documento, o leitor está abrindo — em vez de escrito por um `setState` no
 * corpo do efeito, que dispara um render em cascata a cada troca.
 */
type Resolvido =
  | { chave: string; estado: "aberto"; doc: PDFDocumentProxy; paginas: number }
  | { chave: string; estado: "falhou"; motivo: string };

/**
 * Abre um PDF, e o fecha ao sair.
 *
 * Quem se destrói é a TAREFA de carregamento, e não o documento: no pdf.js 6 é
 * ela que mata o worker e libera as páginas decodificadas, e o documento só
 * expõe `cleanup`, que esvazia os caches e mantém o worker vivo. Uma chamada
 * só, e ela serve aos dois casos — a tarefa abandonada no meio, quando o mestre
 * troca de livro depressa, e o documento aberto que a janela fechou.
 *
 * Trazer oitenta megabytes pelo IPC significaria serializá-los como array de
 * números; pelo loopback o pdf.js pede FAIXAS do arquivo e desenha a página 214
 * sem baixar as outras 299. É por isso que o manual tem rota própria e a fonte
 * é parâmetro daqui — ver `serve_livro`. A ficha, que são duas páginas atrás do
 * token do jogador, vem inteira e já virou blob antes de chegar aqui.
 */
export function usePdfDoc(
  /**
   * O que identifica o documento: o id do livro, a blob URL da ficha. `null`
   * enquanto quem chama ainda não tem o arquivo — o leitor fica "abrindo".
   */
  chave: string | null,
  /**
   * Onde estão os bytes desta chave.
   *
   * Estável, por favor: ela entra na dependência do efeito por uma ref, e uma
   * seta nova a cada render reabriria o documento — matar o worker e redesenhar
   * tudo — em cada passada.
   */
  fonteDe: (chave: string) => Promise<PdfFonte>,
): PdfDoc {
  const [resolvido, setResolvido] = useState<Resolvido | null>(null);

  // Declarado ANTES do efeito de abertura: na primeira montagem o valor já é o
  // da criação da ref, e nas seguintes este efeito atualiza antes de qualquer
  // reabertura.
  const resolver = useRef(fonteDe);
  useEffect(() => {
    resolver.current = fonteDe;
  }, [fonteDe]);

  useEffect(() => {
    if (!chave) return;

    let ativo = true;
    let encerrar: (() => void) | null = null;

    void (async () => {
      try {
        const [mod, fonte] = await Promise.all([pdfjs(), resolver.current(chave)]);
        const tarefa = mod.getDocument({ ...fonte, ...RUNTIME });
        encerrar = () => void tarefa.destroy();

        const aberto = await tarefa.promise;

        if (!ativo) {
          void tarefa.destroy();
          return;
        }

        setResolvido({
          chave,
          estado: "aberto",
          doc: aberto,
          paginas: aberto.numPages,
        });
      } catch (cause) {
        if (!ativo) return;

        setResolvido({ chave, estado: "falhou", motivo: motivoDe(cause) });
      }
    })();

    return () => {
      ativo = false;
      encerrar?.();
    };
  }, [chave]);

  // Memoizado porque quem consome põe isto em dependência de efeito: um objeto
  // novo por render faria o leitor reaplicar a página lembrada a cada quadro.
  return useMemo<PdfDoc>(() => {
    if (!chave || resolvido?.chave !== chave) return { estado: "abrindo" };

    return resolvido.estado === "aberto"
      ? { estado: "aberto", doc: resolvido.doc, paginas: resolvido.paginas }
      : { estado: "falhou", motivo: resolvido.motivo };
  }, [resolvido, chave]);
}

/**
 * A recusa do pdf.js em português.
 *
 * As mensagens dele são em inglês — "No password given", "Invalid PDF
 * structure" —, e esta é uma frase que aparece na tela, no meio da sessão, para
 * um jogador que só queria ver a própria ficha. Pelo NOME da exceção e não pelo
 * texto: o nome é parte da API do pdf.js, e o texto muda de versão.
 *
 * O que não é exceção conhecida dele passa como está: aí o erro é nosso — o
 * daemon que não respondeu, a campanha que fechou — e essas já vêm escritas em
 * português por quem as levantou.
 */
const RECUSAS: Record<string, string> = {
  PasswordException: "Este PDF pede senha, e o leitor não tem onde recebê-la.",
  InvalidPDFException:
    "Este arquivo não é um PDF que o leitor entenda: ou está corrompido, ou veio truncado.",
  MissingPDFException: "Este arquivo não está mais onde estava.",
  UnexpectedResponseException: "Não foi possível baixar este arquivo.",
};

function motivoDe(cause: unknown): string {
  if (!(cause instanceof Error)) return "Não foi possível abrir este PDF.";

  return RECUSAS[cause.name] ?? cause.message;
}
