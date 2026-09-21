"use client";

import { LeitorPdf } from "@/components/leitor/leitor-pdf";
import { usePdfDoc, type PdfFonte } from "@/hooks/use-pdf-doc";

/**
 * A blob que o visualizador do anexo já baixou, como fonte do pdf.js.
 *
 * Função de módulo, e não uma seta no corpo do componente: `usePdfDoc` a põe
 * numa ref e reabrir o documento significa matar o worker e redesenhar tudo.
 *
 * Nada a resolver aqui, e é o ponto — o anexo não tem rota que o pdf.js possa
 * pedir por faixas: ele fica atrás do token do jogador, e no lado do mestre
 * chega por IPC. Quem trouxe os bytes foi `characterFileUrl` ou `useAnexoUrl`,
 * e o que sobra é apontar o leitor para a blob. Ficha são páginas, não os
 * oitenta megabytes de um manual, então trazer o arquivo inteiro antes de
 * desenhar é o preço certo.
 */
function fonteLocal(url: string): Promise<PdfFonte> {
  return Promise.resolve({ url });
}

/**
 * Um PDF anexado, aberto no leitor do aplicativo.
 *
 * O mesmo leitor que abre o manual da estante — zoom em degraus, lupa e busca
 * no texto —, sem a página lembrada nem os marcadores, que são do livro. Ver
 * `LeitorPdf`.
 *
 * A altura é declarada aqui e não herdada: as duas molduras que mostram anexo
 * são o diálogo modal, que é um grid sem altura para dar, e a janela interna do
 * mestre, que cresce com o conteúdo até o teto dela. Em `dvh` para o modal e
 * com `max-h-full` para quando a moldura de fato tem altura — atracado numa
 * coluna do dock, é ela que manda e o leitor encolhe em vez de rolar duas
 * vezes.
 */
export function PdfBody({
  url,
  saida,
}: {
  /** A blob do arquivo. `null` enquanto ele ainda está sendo baixado. */
  url: string | null;
  /** O que oferecer se o leitor recusar o arquivo. Ver abaixo. */
  saida?: React.ReactNode;
}) {
  const documento = usePdfDoc(url, fonteLocal);

  // O leitor desenha a própria mensagem de falha, mas ela não oferece saída
  // nenhuma — e um PDF que o pdf.js recusa (pede senha, veio truncado) ainda
  // pode abrir no visualizador do sistema, que é a última carta antes de o
  // jogador ficar sem a ficha no meio da sessão.
  if (documento.estado === "falhou") {
    return (
      <div className="space-y-2 py-4">
        <p className="text-destructive text-center text-sm">
          {documento.motivo}
        </p>
        {saida}
      </div>
    );
  }

  return (
    <div className="flex h-[70dvh] max-h-full min-h-0 flex-col overflow-hidden rounded-md border">
      <LeitorPdf documento={documento} />
    </div>
  );
}
