"use client";

import { useEffect } from "react";
import { ChevronDown } from "lucide-react";

import {
  useSecoesStore,
  type SecaoFicha as Secao,
} from "@/lib/store/use-secoes-store";
import { cn } from "@/lib/utils";

/**
 * Uma seção da ficha, que fecha.
 *
 * Existe porque a ficha passou a empilhar seis blocos: campos, arquivos,
 * inventário, nota. Empilhados e todos abertos, ela media mais de mil pixels de
 * altura — e o mestre que só queria conferir o inventário rolava por cima de
 * tudo o que já sabia.
 *
 * Fechar, e não esconder atrás de abas: a contagem no título continua dizendo o
 * que há lá dentro com a seção fechada. "Arquivos (2)" fechado ainda informa; a
 * aba "Arquivos" não diz se há algum.
 *
 * O estado é global e sobrevive ao fechar o aplicativo — ver `useSecoesStore`.
 */
export function SecaoFicha({
  secao,
  titulo,
  contagem,
  acao,
  children,
}: {
  secao: Secao;
  titulo: string;
  /** Aparece ao lado do título. `undefined` some, e `0` também. */
  contagem?: number;
  /** Um botão à direita do cabeçalho — adicionar item, anexar arquivo. */
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  const aberta = useSecaoAberta(secao);
  const alternar = useSecoesStore((state) => state.alternar);

  const id = `secao-${secao}`;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => alternar(secao)}
          aria-expanded={aberta}
          aria-controls={id}
          className="text-foreground hover:text-foreground/80 focus-visible:ring-ring -mx-1 flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronDown
            className={cn(
              "size-3 shrink-0 transition-transform motion-reduce:transition-none",
              !aberta && "-rotate-90",
            )}
            aria-hidden
          />

          <span className="truncate">{titulo}</span>

          {contagem ? (
            <span className="text-muted-foreground font-normal">
              ({contagem})
            </span>
          ) : null}
        </button>

        {/* A ação fica visível com a seção fechada: adicionar um item não
            deveria exigir abrir a seção antes. */}
        {acao}
      </div>

      {/* Desmonta ao fechar, em vez de esconder com `hidden`: o inventário e a
          lista de arquivos LEEM ao montar, e mantê-los montados invisíveis
          gastaria uma leitura por seção fechada a cada abertura de ficha. O
          preço é reler ao reabrir, que é uma ida ao disco local. */}
      {aberta ? (
        <div
          id={id}
          className="animate-in fade-in-0 duration-100 motion-reduce:animate-none"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

/**
 * A seção está aberta?
 *
 * Hidrata o store na primeira montagem. O disco não é lido na criação do store
 * porque este módulo é importado durante o build estático, onde `localStorage`
 * não existe — ler ali derrubaria o export das telas de espectador.
 */
function useSecaoAberta(secao: Secao): boolean {
  const hidratar = useSecoesStore((state) => state.hidratar);

  useEffect(hidratar, [hidratar]);

  return !useSecoesStore((state) => state.fechadas).has(secao);
}
