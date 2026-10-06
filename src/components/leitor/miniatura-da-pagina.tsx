"use client";

import { useEffect, useRef, useState } from "react";

import { t } from "@/lib/i18n/palco";
import { filaDasMiniaturas, pegarDocDoLivro } from "@/lib/leitor/doc-do-livro";
import { cn } from "@/lib/utils";

/** O mesmo teto da folha do leitor: acima disso o bitmap cresce e ninguém vê. */
const DPR_MAX = 2;

/** A proporção de uma página A4 em pé, até a de verdade chegar. */
const RAZAO_PADRAO = 1.414;

/**
 * Uma página de um livro da estante, desenhada pequena num canvas.
 *
 * É a prévia da menção `!rótulo`: a regra que o mestre marcou, para ele ver
 * se é a página certa antes de abrir o livro. Fora do palco sempre -- no
 * tooltip, que sai por portal, e na nota aberta --: sob o `zoom` do palco o
 * canvas teria o tamanho errado, e no cartão do quadro a prévia é só texto.
 *
 * `largura` em pixel de CSS. A altura sai da página, e até ela chegar a caixa
 * reserva a de uma A4, para o tooltip não crescer depois de aberto.
 */
export function MiniaturaDaPagina({
  livroId,
  pagina,
  largura,
  className,
}: {
  livroId: string;
  pagina: number;
  largura: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [razao, setRazao] = useState(RAZAO_PADRAO);
  const [estado, setEstado] = useState<"abrindo" | "pronta" | "falhou">("abrindo");

  useEffect(() => {
    let ativo = true;
    let tarefa: { cancel: () => void; promise: Promise<void> } | null = null;
    const { promessa, soltar } = pegarDocDoLivro(livroId);

    const cancelarNaFila = filaDasMiniaturas.pedir(
      `${livroId}:${pagina}:${largura}`,
      0,
      async () => {
        if (!ativo) return;

        try {
          const doc = await promessa;
          if (!ativo) return;

          // Limitada ao livro: o marcador pode apontar para depois do fim se o
          // PDF foi trocado por uma edição menor com o mesmo nome.
          const page = await doc.getPage(Math.min(Math.max(pagina, 1), doc.numPages));
          if (!ativo) return;

          const natural = page.getViewport({ scale: 1 });
          setRazao(natural.height / natural.width);

          const viewport = page.getViewport({ scale: largura / natural.width });
          const alvo = canvas.current;
          const contexto = alvo?.getContext("2d");
          if (!alvo || !contexto) return;

          const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
          alvo.width = Math.floor(viewport.width * dpr);
          alvo.height = Math.floor(viewport.height * dpr);
          contexto.setTransform(dpr, 0, 0, dpr, 0, 0);

          tarefa = page.render({ canvas: alvo, canvasContext: contexto, viewport });
          await tarefa.promise;

          if (ativo) setEstado("pronta");
        } catch {
          // Cancelada ao sair é o caminho normal do hover, e não falha.
          if (ativo) setEstado("falhou");
        }
      },
    );

    return () => {
      ativo = false;
      cancelarNaFila();
      tarefa?.cancel();
      soltar();
    };
  }, [livroId, pagina, largura]);

  return (
    <div
      className={cn("relative overflow-hidden rounded-[0.3em] bg-white", className)}
      style={{ width: largura, height: Math.round(largura * razao) }}
    >
      <canvas
        ref={canvas}
        className={cn("absolute inset-0 size-full", estado !== "pronta" && "invisible")}
      />
      {estado === "pronta" ? null : (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500">
          {estado === "abrindo" ? t.leitor.abrindo : t.leitor.naoAbriu}
        </span>
      )}
    </div>
  );
}
