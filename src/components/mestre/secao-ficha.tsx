"use client";

import { createContext, useContext, useEffect } from "react";
import { ChevronDown } from "lucide-react";

import { Substituto } from "@/components/mestre/substituto";
import {
  useSecoesStore,
  type SecaoFicha as Secao,
} from "@/lib/store/use-secoes-store";
import { cn } from "@/lib/utils";

/**
 * O personagem da ficha aberta, para as seções que precisam dele sem o
 * receber por prop -- o substituto de um plugin, que a `SecaoFicha` desenha
 * e que não sabe de quem é a ficha. Provido em `Ficha`.
 */
export const PersonagemDaFichaContext = createContext<string | undefined>(undefined);

/**
 * Onde a seção está desenhada.
 *
 * `painel` é a grade da aba Ficha: moldura própria, título, fecha. `aba` é a
 * seção que ocupa uma aba inteira -- Inventário, Arquivos --, e ali o título e
 * a seta seriam a segunda vez que a mesma palavra aparece, logo abaixo da aba
 * que a mostra. Fechar a única coisa de uma aba deixaria a aba em branco.
 *
 * Contexto, e não prop: a `SecaoFicha` mora dentro do inventário e da lista de
 * arquivos, e quem sabe onde ela está é a ficha, dois níveis acima.
 */
export const ModoDaSecaoContext = createContext<"painel" | "aba">("painel");

/**
 * Uma seção da ficha, que fecha.
 *
 * Existe porque a ficha passou a empilhar seis blocos: campos, arquivos,
 * inventário, nota. Empilhados e todos abertos, ela media mais de mil pixels de
 * altura — e o mestre que só queria conferir o inventário rolava por cima de
 * tudo o que já sabia.
 *
 * Fechar continua valendo dentro da aba Ficha: a contagem no título diz o que
 * há lá dentro com a seção fechada. As abas que vieram depois carregam a mesma
 * contagem no rótulo -- "Arquivos (2)" -- pelo mesmo motivo.
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
  const personagemId = useContext(PersonagemDaFichaContext);
  const modo = useContext(ModoDaSecaoContext);

  const id = `secao-${secao}`;

  // O miolo de uma seção de fábrica pode ser trocado por um plugin -- é o
  // `secao:medidores` do manifesto. Só as de fábrica: a seção de um plugin já
  // é dele. Sem plugin, isto é `children`.
  const miolo = secao.startsWith("ext:") ? (
    children
  ) : (
    <Substituto alvo={`secao:${secao}`} personagemId={personagemId}>
      {children}
    </Substituto>
  );

  // Sem cabeçalho e sempre aberta: quem dá nome e contagem é a aba. A ação do
  // cabeçalho também sai -- o inventário e os arquivos já têm o lugar de
  // somar dentro do miolo, o quadro vazio e o "Anexar arquivos".
  if (modo === "aba") return <section>{miolo}</section>;

  return (
    <section className="bg-muted/20 space-y-2 rounded-lg border p-2.5">
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
          {miolo}
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
