"use client";

import { useEffect, useMemo, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { pdfjs, RUNTIME } from "@/lib/leitor/pdfjs";
import { livroFonte } from "@/lib/vault/estante";

export type LivroDoc =
  | { estado: "abrindo" }
  | { estado: "aberto"; doc: PDFDocumentProxy; paginas: number }
  | { estado: "falhou"; motivo: string };

/**
 * Abre um livro da estante, e o fecha ao sair.
 *
 * O documento vem pela rota `/livro/{id}` do daemon, com o token no cabeçalho —
 * e não por IPC como os anexos. É a diferença entre um manual e uma ficha:
 * trazer oitenta megabytes pelo IPC significa serializá-los como array de
 * números, enquanto pelo loopback o pdf.js pede FAIXAS do arquivo e desenha a
 * página 214 sem baixar as outras 299. Ver `livroFonte` e `serve_livro`.
 *
 * Quem se destrói é a TAREFA de carregamento, e não o documento: no pdf.js 6 é
 * ela que mata o worker e libera as páginas decodificadas, e o documento só
 * expõe `cleanup`, que esvazia os caches e mantém o worker vivo. Uma chamada
 * só, e ela serve aos dois casos — a tarefa abandonada no meio, quando o mestre
 * troca de livro depressa, e o documento aberto que a janela fechou.
 */
/**
 * O que a última abertura resolvida deixou, e de que livro ela era.
 *
 * O id viaja junto e é conferido na saída, como no `useAssetUrl`: é o que
 * permite o estado "abrindo" ser DERIVADO — enquanto o resolvido não é deste
 * livro, o leitor está abrindo — em vez de escrito por um `setState` no corpo
 * do efeito, que dispara um render em cascata a cada troca de livro.
 */
type Resolvido =
  | { livroId: string; estado: "aberto"; doc: PDFDocumentProxy; paginas: number }
  | { livroId: string; estado: "falhou"; motivo: string };

export function useLivroDoc(livroId: string): LivroDoc {
  const [resolvido, setResolvido] = useState<Resolvido | null>(null);

  useEffect(() => {
    let ativo = true;
    let encerrar: (() => void) | null = null;

    void (async () => {
      try {
        const [mod, fonte] = await Promise.all([pdfjs(), livroFonte(livroId)]);
        const tarefa = mod.getDocument({ ...fonte, ...RUNTIME });
        encerrar = () => void tarefa.destroy();

        const aberto = await tarefa.promise;

        if (!ativo) {
          void tarefa.destroy();
          return;
        }

        setResolvido({
          livroId,
          estado: "aberto",
          doc: aberto,
          paginas: aberto.numPages,
        });
      } catch (cause) {
        if (!ativo) return;

        setResolvido({
          livroId,
          estado: "falhou",
          motivo: cause instanceof Error ? cause.message : "Não foi possível abrir este livro.",
        });
      }
    })();

    return () => {
      ativo = false;
      encerrar?.();
    };
  }, [livroId]);

  // Memoizado porque quem consome põe isto em dependência de efeito: um objeto
  // novo por render faria o leitor reaplicar a página lembrada a cada quadro.
  return useMemo<LivroDoc>(() => {
    if (resolvido?.livroId !== livroId) return { estado: "abrindo" };

    return resolvido.estado === "aberto"
      ? { estado: "aberto", doc: resolvido.doc, paginas: resolvido.paginas }
      : { estado: "falhou", motivo: resolvido.motivo };
  }, [resolvido, livroId]);
}
