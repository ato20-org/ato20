"use client";

import { useCallback, useEffect, useRef } from "react";
import { Columns2, PictureInPicture2 } from "lucide-react";

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
import { t } from "@/lib/i18n/mestre";
import { useLeitorStore } from "@/lib/store/use-leitor-store";
import { selectLivroAberto, usePaineisStore } from "@/lib/store/use-paineis-store";
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
 * Ele não sabe em qual moldura está — a janela (flutuante ou atracada) ou um
 * painel ao lado do mapa. O que sabe é se ESTE livro está num painel, e é isso
 * que decide para onde o botão de mover o leva.
 */
export function LeitorLivro({ livroId }: { livroId: string }) {
  const livro = useLivro(livroId);
  const documento = usePdfDoc(livroId, livroFonte);

  const noPainel = usePaineisStore(selectLivroAberto(livroId));
  // A página que uma menção `!rótulo` pediu. Ver `abrirLivroNaPagina`.
  const salto = useLeitorStore((state) => state.saltos[livroId] ?? null);
  const descartarSalto = useLeitorStore((state) => state.descartarSalto);
  const aoSaltar = useCallback(
    (vez: number) => descartarSalto(livroId, vez),
    [descartarSalto, livroId],
  );
  const abrirNoPainel = usePaineisStore((state) => state.abrir);
  const fecharDoPainel = usePaineisStore((state) => state.fechar);

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
    // A marca do "Lendo as regras" no Discord: o clique aqui dentro diz que
    // o mestre está no livro. `contents` para a caixa não existir no layout
    // -- o leitor continua filho direto do painel. Ver `PresencaDoMestre`.
    <div data-presenca-livro="" className="contents">
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
        salto={salto}
        aoSaltar={aoSaltar}
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
                    aria-label={noPainel ? t.leitor.soltar : t.leitor.abrirNoPainel}
                    onClick={() => {
                      const titulo = livro?.titulo ?? t.leitor.livro;

                      if (noPainel) {
                        fecharDoPainel({ tipo: "livro", livroId, titulo });
                        abrirJanela({ tipo: "livro", livroId, titulo });
                        return;
                      }

                      // A janela sai de cena ao ir para o painel: o mesmo livro
                      // nas duas casas seriam dois leitores do mesmo PDF, cada um
                      // com sua página, gravando por cima do outro.
                      fecharJanela(chaveDe({ tipo: "livro", livroId, titulo: "" }));
                      abrirNoPainel({ tipo: "livro", livroId, titulo });
                    }}
                  >
                    {noPainel ? <PictureInPicture2 /> : <Columns2 />}
                  </Button>
                }
              />
              <TooltipContent>
                <p>
                  {noPainel ? t.leitor.soltar : t.leitor.abrirNoPainel}
                </p>
              </TooltipContent>
            </Tooltip>

            {/* Sem fechar aqui dentro: a janela tem o X da moldura e o painel o
                da aba -- um segundo seriam dois alvos para o mesmo gesto. */}
          </>
        }
      />
    </div>
  );
}
