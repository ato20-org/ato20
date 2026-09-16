"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { useBuscaLivro } from "@/hooks/use-busca-livro";

/**
 * A busca no texto do livro, como tira lateral.
 *
 * O resultado é PÁGINA e trecho, e escolher um salta para lá e marca o termo
 * na folha -- ver `Destaque` em `PaginaFolha`. Quem guarda a busca é o leitor,
 * e não esta tira: são as folhas que desenham os achados, e elas ficam fora
 * daqui.
 *
 * `Enter` e `Shift+Enter` andam pelas ocorrências sem tirar a mão do campo, que
 * é como todo leitor de PDF já ensinou; `Esc` fecha.
 */
export function BuscaLivro({
  busca,
  paginaAtual,
  atual,
  aoEscolher,
  aoFechar,
}: {
  busca: ReturnType<typeof useBuscaLivro>;
  paginaAtual: number;
  /** Índice da ocorrência marcada em laranja. `null` = nenhuma escolhida. */
  atual: number | null;
  aoEscolher: (indice: number) => void;
  aoFechar: () => void;
}) {
  const [termo, setTermo] = useState("");
  const { resultados, progresso, buscar, limpar } = busca;
  const campo = useRef<HTMLInputElement | null>(null);

  // Espera a digitação parar. Varrer trezentas páginas por tecla apertada seria
  // trezentas leituras de texto para um termo que ainda está sendo escrito.
  useEffect(() => {
    const relogio = setTimeout(() => void buscar(termo), 350);

    return () => clearTimeout(relogio);
  }, [termo, buscar]);

  // A tira abre para se digitar nela: foco no campo, sem exigir o clique.
  useEffect(() => {
    campo.current?.focus();
  }, []);

  const paginasComAchado = new Set(resultados.map((o) => o.pagina)).size;

  const andar = (direcao: 1 | -1) => {
    if (resultados.length === 0) return;

    const base = atual ?? (direcao === 1 ? -1 : 0);
    aoEscolher((base + direcao + resultados.length) % resultados.length);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            ref={campo}
            value={termo}
            onChange={(evento) => setTermo(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") {
                evento.preventDefault();
                andar(evento.shiftKey ? -1 : 1);
              } else if (evento.key === "Escape") {
                evento.preventDefault();
                aoFechar();
              }
            }}
            placeholder="Buscar no livro"
            className="pl-7"
            aria-label="Buscar no livro"
          />
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Ocorrência anterior"
          disabled={resultados.length === 0}
          onClick={() => andar(-1)}
        >
          <ChevronUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Próxima ocorrência"
          disabled={resultados.length === 0}
          onClick={() => andar(1)}
        >
          <ChevronDown />
        </Button>

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
      ) : resultados.length > 0 ? (
        <p className="text-muted-foreground text-xs tabular-nums">
          {atual !== null ? `${atual + 1} de ` : ""}
          {resultados.length} em {paginasComAchado}{" "}
          {paginasComAchado === 1 ? "página" : "páginas"}
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
              onClick={() => aoEscolher(indice)}
              className="hover:bg-accent aria-[current=true]:bg-accent data-[atual=true]:ring-ring/50 w-full rounded-md p-1.5 text-left data-[atual=true]:ring-1"
              aria-current={ocorrencia.pagina === paginaAtual}
              data-atual={indice === atual}
            >
              <span className="text-muted-foreground text-[0.7rem] tabular-nums">
                p. {ocorrencia.pagina}
              </span>
              <span className="block text-xs leading-snug">
                {ocorrencia.trecho}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
