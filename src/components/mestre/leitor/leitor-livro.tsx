"use client";

import { useCallback, useEffect, useRef } from "react";
import { Columns2, PictureInPicture2, X } from "lucide-react";

import { LeitorPdf } from "@/components/leitor/leitor-pdf";
import { MarcadoresLivro } from "@/components/mestre/leitor/marcadores-livro";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useFecharJanela } from "@/hooks/use-fechar-janela";
import { useLivro } from "@/hooks/use-estante";
import { usePdfDoc } from "@/hooks/use-pdf-doc";
import { useLeitorStore } from "@/lib/store/use-leitor-store";
import { chaveDe } from "@/lib/store/use-window-store";
import { createTrailingThrottle } from "@/lib/sync/throttle";
import { livroFonte, marcarPagina } from "@/lib/vault/estante";

/**
 * Quanto se espera antes de gravar a página no banco.
 *
 * Rolar meio capítulo é um gesto só, e gravar cada página que cruza o meio da
 * tela seriam dezenas de escritas para uma informação que só interessa na
 * última. O `throttle` de cauda nunca perde o último valor — ver
 * `createTrailingThrottle` —, então a página onde o mestre parou chega mesmo que
 * ele feche o leitor logo depois.
 */
const GRAVAR_MS = 1_200;

/**
 * O leitor de Regras: um livro da estante, aberto.
 *
 * O que lê o PDF é o `LeitorPdf`, que é o leitor do aplicativo e não sabe de
 * estante nenhuma. O que esta casca acrescenta é tudo o que só o livro tem: a
 * rota `/livro/{id}` como fonte, a página lembrada no banco da máquina, os
 * marcadores da campanha e os dois botões de mover — a mesma peça abre a ficha
 * em PDF de um personagem, e lá nada disso existe. Ver `PdfBody`.
 *
 * Ele não sabe em qual moldura está — a janela (flutuante ou atracada) ou o
 * split que divide a linha com o palco. O que sabe é se ESTE livro é o que está
 * no split, e é isso que decide qual dos dois botões de mover aparece.
 */
export function LeitorLivro({ livroId }: { livroId: string }) {
  const livro = useLivro(livroId);
  const documento = usePdfDoc(livroId, livroFonte);

  const noSplit = useLeitorStore((state) => state.livroId === livroId);
  const abrirNoSplit = useLeitorStore((state) => state.abrirNoSplit);
  const fecharSplit = useLeitorStore((state) => state.fecharSplit);

  const abrirJanela = useAbrirJanela();
  const fecharJanela = useFecharJanela();

  /**
   * Se o total de páginas já foi enviado nesta abertura.
   *
   * O Rust usa `coalesce`, então mandar o total em cada virada só repetiria a
   * mesma escrita — ver `livro_pagina`. Quem conta as páginas é o leitor: o Rust
   * copia o arquivo sem abri-lo.
   */
  const mandouTotal = useRef(false);
  const gravador = useRef<ReturnType<
    typeof createTrailingThrottle<{ pagina: number; paginas?: number }>
  > | null>(null);

  useEffect(() => {
    const throttle = createTrailingThrottle<{
      pagina: number;
      paginas?: number;
    }>(GRAVAR_MS, ({ pagina, paginas: total }) => {
      // Falha aqui não vira aviso na tela: perder a página lembrada custa uma
      // rolagem na próxima abertura, e um toast no meio da leitura custa a
      // atenção do mestre numa sessão em andamento.
      void marcarPagina(livroId, pagina, total).catch(() => {});
    });

    gravador.current = throttle;

    return () => {
      // Descarrega o pendente ao sair: fechar o leitor logo depois de rolar é
      // exatamente quando o último valor importa.
      throttle.flush();
      throttle.cancel();
      gravador.current = null;
      mandouTotal.current = false;
    };
  }, [livroId]);

  // Estável de propósito: o `LeitorPdf` põe isto em dependência de efeito, e
  // tudo o que muda entre uma chamada e outra está em ref.
  const aoMudarPagina = useCallback((pagina: number, paginas: number) => {
    const total = mandouTotal.current ? undefined : paginas;
    mandouTotal.current = true;

    gravador.current?.run({ pagina, paginas: total });
  }, []);

  return (
    <LeitorPdf
      // `key` no livro: trocar o livro do split troca a PROP de um leitor que
      // continua montado, e a retomada da página, o zoom e a lupa são do
      // documento, não da moldura.
      key={livroId}
      documento={documento}
      // `null` enquanto a linha do banco não chegou: é o que faz o leitor
      // esperar em vez de abrir na primeira página e saltar depois. Sem a linha
      // — leitura que falhou —, `useLivro` fica `null` e o livro abre na 1 sem
      // gravar nada, que é o comportamento honesto.
      paginaInicial={livro ? livro.pagina : null}
      aoMudarPagina={aoMudarPagina}
      marcadores={({ paginaAtual, aoEscolher }) => (
        <MarcadoresLivro
          livroId={livroId}
          paginaAtual={paginaAtual}
          aoEscolher={aoEscolher}
        />
      )}
      acoes={
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    noSplit ? "Soltar como janela" : "Abrir ao lado do palco"
                  }
                  onClick={() => {
                    if (noSplit) {
                      fecharSplit();
                      abrirJanela({
                        tipo: "livro",
                        livroId,
                        titulo: livro?.titulo ?? "Livro",
                      });
                      return;
                    }

                    // A janela sai de cena ao ir para o split: o mesmo livro nas
                    // duas casas seriam dois leitores do mesmo PDF, cada um com
                    // sua página, gravando por cima do outro.
                    fecharJanela(
                      chaveDe({ tipo: "livro", livroId, titulo: "" }),
                    );
                    abrirNoSplit(livroId);
                  }}
                >
                  {noSplit ? <PictureInPicture2 /> : <Columns2 />}
                </Button>
              }
            />
            <TooltipContent>
              <p>{noSplit ? "Soltar como janela" : "Abrir ao lado do palco"}</p>
            </TooltipContent>
          </Tooltip>

          {/* Só no split: a janela já tem o X da própria moldura, e um segundo
              fechar dentro do corpo dela seriam dois alvos para o mesmo gesto. */}
          {noSplit ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Fechar o leitor"
              onClick={() => fecharSplit()}
            >
              <X />
            </Button>
          ) : null}
        </>
      }
    />
  );
}
