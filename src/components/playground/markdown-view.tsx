"use client";

import { bloco, trechos, type Bloco, type Trecho } from "@/lib/markdown/linha";
import { cn } from "@/lib/utils";

/**
 * Uma linha de Markdown desenhada. É o mesmo desenho no editor do mestre --
 * para as linhas que não estão sob o cursor -- e na TV, e é isso que faz a
 * prévia ao vivo ser fiel: o que o mestre vê enquanto escreve é o que a mesa
 * vê depois.
 *
 * Tamanhos em `em`: o corpo do cartão escolhe a fonte conforme o zoom, e os
 * títulos escalam junto.
 */
export function LinhaMarkdown({
  linha,
  className,
}: {
  linha: string;
  className?: string;
}) {
  const b = bloco(linha);

  switch (b.tipo) {
    case "vazio":
      // Uma linha vazia ocupa uma linha: é o espaço entre parágrafos.
      return <div className={cn("min-h-[1.5em]", className)} />;
    case "regua":
      return <hr className={cn("border-foreground/20 my-[0.6em]", className)} />;
    case "titulo":
      return (
        <div
          className={cn(
            "font-bold",
            b.nivel === 1 && "mt-[0.4em] text-[1.6em] leading-tight",
            b.nivel === 2 && "mt-[0.3em] text-[1.3em] leading-snug",
            b.nivel === 3 && "mt-[0.2em] text-[1.1em] leading-snug",
            className,
          )}
        >
          <Trechos conteudo={b.conteudo} />
        </div>
      );
    case "item":
      return (
        <div className={cn("relative pl-[1.4em]", className)}>
          <span className="absolute left-[0.4em]" aria-hidden>
            •
          </span>
          <Trechos conteudo={b.conteudo} />
        </div>
      );
    case "numero":
      return (
        <div className={cn("relative pl-[1.8em]", className)}>
          <span className="absolute left-0 w-[1.4em] text-right tabular-nums" aria-hidden>
            {b.numero}.
          </span>
          <Trechos conteudo={b.conteudo} />
        </div>
      );
    case "tarefa":
      return (
        <div className={cn("relative pl-[1.6em]", className)}>
          <span
            className={cn(
              "absolute top-[0.25em] left-[0.1em] inline-block size-[1em] rounded-[0.2em] border border-current",
              b.feita && "bg-current",
            )}
            aria-hidden
          />
          <span className={b.feita ? "opacity-60 line-through" : undefined}>
            <Trechos conteudo={b.conteudo} />
          </span>
        </div>
      );
    case "citacao":
      return (
        <div
          className={cn(
            "border-foreground/30 border-l-[0.2em] pl-[0.7em] italic opacity-80",
            className,
          )}
        >
          <Trechos conteudo={b.conteudo} />
        </div>
      );
    case "paragrafo":
      return (
        <div className={className}>
          <Trechos conteudo={b.conteudo} />
        </div>
      );
  }
}

function Trechos({ conteudo }: { conteudo: string }) {
  return trechos(conteudo).map((trecho, indice) => (
    <TrechoView key={indice} trecho={trecho} />
  ));
}

function TrechoView({ trecho }: { trecho: Trecho }) {
  switch (trecho.tipo) {
    case "texto":
      return <>{trecho.valor}</>;
    case "negrito":
      return <strong className="font-semibold">{trecho.valor}</strong>;
    case "italico":
      return <em>{trecho.valor}</em>;
    case "codigo":
      return (
        <code className="bg-foreground/10 rounded-[0.2em] px-[0.3em] font-mono text-[0.9em]">
          {trecho.valor}
        </code>
      );
    case "link":
      return (
        <a
          href={trecho.url}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {trecho.valor}
        </a>
      );
  }
}

/** O documento inteiro desenhado, linha a linha. Só leitura: é o da mesa. */
export function MarkdownView({ texto, className }: { texto: string; className?: string }) {
  const linhas = texto.split("\n");
  return (
    <div className={cn("break-words whitespace-pre-wrap", className)}>
      {linhas.map((linha, indice) => (
        <LinhaMarkdown key={indice} linha={linha} />
      ))}
    </div>
  );
}

export type { Bloco };
