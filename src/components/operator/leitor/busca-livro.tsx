"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBuscaLivro } from "@/hooks/use-busca-livro";

/**
 * A busca no texto do livro, como tira lateral.
 *
 * O resultado é PÁGINA e trecho, e clicar salta para lá. O termo não é
 * destacado dentro da página: a página é um canvas, e pintar o achado sobre ela
 * pediria a camada de texto do pdf.js posicionada por cima — outra estrutura,
 * que num manual de duas colunas costuma sair torta. O trecho na lista já diz
 * o que foi encontrado, e o mestre acha na página com o olho.
 */
export function BuscaLivro({
  doc,
  paginaAtual,
  aoEscolher,
}: {
  doc: PDFDocumentProxy;
  paginaAtual: number;
  aoEscolher: (pagina: number) => void;
}) {
  const [termo, setTermo] = useState("");
  const { resultados, progresso, buscar, limpar } = useBuscaLivro(doc);

  // Espera a digitação parar. Varrer trezentas páginas por tecla apertada seria
  // trezentas leituras de texto para um termo que ainda está sendo escrito.
  useEffect(() => {
    const relogio = setTimeout(() => void buscar(termo), 350);

    return () => clearTimeout(relogio);
  }, [termo, buscar]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            value={termo}
            onChange={(evento) => setTermo(evento.target.value)}
            placeholder="Buscar no livro"
            className="pl-7"
            aria-label="Buscar no livro"
          />
        </div>

        {termo ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Limpar a busca"
            onClick={() => {
              setTermo("");
              limpar();
            }}
          >
            <X />
          </Button>
        ) : null}
      </div>

      {progresso ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3 animate-spin" />
          Página {progresso.lidas} de {progresso.total}
        </p>
      ) : null}

      {!progresso && termo.trim().length >= 2 && resultados.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Nada encontrado. Manual escaneado sem OCR não tem texto para buscar.
        </p>
      ) : null}

      <ul className="scroll-fade min-h-0 flex-1 space-y-1 overflow-y-auto">
        {resultados.map((ocorrencia, indice) => (
          <li key={`${ocorrencia.pagina}-${indice}`}>
            <button
              type="button"
              onClick={() => aoEscolher(ocorrencia.pagina)}
              className="hover:bg-accent aria-[current=true]:bg-accent w-full rounded-md p-1.5 text-left"
              aria-current={ocorrencia.pagina === paginaAtual}
            >
              <span className="text-muted-foreground text-[0.7rem] tabular-nums">
                p. {ocorrencia.pagina}
              </span>
              <span className="block text-xs leading-snug">{ocorrencia.trecho}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
