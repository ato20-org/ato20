"use client";

import { createContext, memo, useContext, type ReactNode } from "react";

import { TokenView, type Vinculos } from "@/components/mestre/postit-texto-view";
import { FileiraDePrevias, PreviaDaMencao } from "@/components/playground/previa-da-mencao";
import {
  bloco,
  trechos,
  type Alinhamento,
  trechosComPosicao,
  type Bloco,
  type Trecho,
} from "@/lib/markdown/linha";
import { CRU } from "@/lib/markdown/ponto-no-cru";

/** O que a prévia de imagem pede ao editor: a largura da alça, o alinhamento. */
export type Ajuste = { largura?: number; alinhamento?: Alinhamento };
import { cn } from "@/lib/utils";

/**
 * Sem vínculo nenhum: a menção é só o nome. `@Edgar` sai como texto, sem
 * ficha atrás, sem retrato, sem pular de cena. É o padrão da mesa, que não
 * tem nada disso, e do que quer que desenhe Markdown sem fornecer os seus.
 */
export const SEM_VINCULOS: Vinculos = {
  personagem: () => null,
  arquivo: () => null,
  cena: () => null,
  irParaCena: () => undefined,
  marcador: () => null,
  abrirLivro: () => undefined,
  abrirJanela: () => undefined,
};

/**
 * Os vínculos das menções, por contexto e não por prop: a linha de Markdown é
 * desenhada por três camadas (editor, cartão, mesa) e por dentro de blocos,
 * e passar `vinculos` por cinco níveis para cada `@` seria o mesmo objeto em
 * toda assinatura. O mestre fornece os dele -- ver `useMencoesDoMestre` --
 * uma vez, na raiz de cada camada.
 */
export const VinculosContext = createContext<Vinculos>(SEM_VINCULOS);

/**
 * Marcar cada trecho desenhado com o lugar dele no texto cru. Só o editor liga:
 * é o que traduz um clique ou uma seleção na linha desenhada para o cursor no
 * cru -- ver `pontoNoCru`. Nos cartões do quadro e na mesa fica desligado, e o
 * desenho não ganha um nó por trecho: a folha com sessenta cartões já paga
 * pelos nós de texto que tem.
 */
export const PosicoesDoCruContext = createContext(false);

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
  aoAjustar,
}: {
  linha: string;
  className?: string;
  /**
   * A linha que é só uma imagem ganha a alça da largura e os botões de
   * alinhamento, e mexer neles chama isto -- ver `comAjuste`. Só o editor passa.
   */
  aoAjustar?: (ajuste: Ajuste, item?: number) => void;
}) {
  return (
    <BlocoView
      b={bloco(linha)}
      tamanho={linha.length}
      className={className}
      aoAjustar={aoAjustar}
    />
  );
}

function BlocoView({
  b,
  tamanho,
  className,
  aoAjustar,
}: {
  b: Bloco;
  /** O tamanho da linha crua: o que sobra dele além do conteúdo é o prefixo. */
  tamanho: number;
  className?: string;
  aoAjustar?: (ajuste: Ajuste, item?: number) => void;
}) {
  // Onde o conteúdo começa na linha crua: depois do `## `, do `- [ ] `, do
  // recuo. O conteúdo vai até o fim da linha em todo bloco que tem um.
  const base = "conteudo" in b ? tamanho - b.conteudo.length : 0;

  switch (b.tipo) {
    case "galeria":
      return (
        <Fileira
          bloco={b}
          aoAjustar={aoAjustar}
          // A fileira é a linha inteira, e o texto de sempre é o mesmo tamanho.
          senao={<BlocoView b={b.senao} tamanho={tamanho} className={className} />}
        />
      );
    case "embed":
      return (
        <Embed
          bloco={b}
          aoAjustar={aoAjustar}
          senao={
            <BlocoView
              b={b.senao}
              // Sem o `|320`, que a linha de antes da prévia não tem.
              tamanho={
                tamanho -
                (b.largura === undefined ? 0 : `|${b.largura}`.length) -
                (b.alinhamento === undefined ? 0 : `|${b.alinhamento}`.length)
              }
              className={className}
            />
          }
        />
      );
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
          <Trechos conteudo={b.conteudo} base={base} />
        </div>
      );
    case "item":
      return (
        <div className={cn("relative pl-[1.4em]", className)} style={recuado(b.recuo)}>
          <span className="absolute left-[0.4em]" aria-hidden>
            {MARCADOR[(b.recuo ?? 0) % MARCADOR.length]}
          </span>
          <Trechos conteudo={b.conteudo} base={base} />
        </div>
      );
    case "numero":
      return (
        <div className={cn("relative pl-[1.8em]", className)} style={recuado(b.recuo)}>
          <span className="absolute left-0 w-[1.4em] text-right tabular-nums" aria-hidden>
            {b.numero}.
          </span>
          <Trechos conteudo={b.conteudo} base={base} />
        </div>
      );
    case "tarefa":
      return (
        <div className={cn("relative pl-[1.6em]", className)} style={recuado(b.recuo)}>
          <span
            className={cn(
              "absolute top-[0.25em] left-[0.1em] inline-block size-[1em] rounded-[0.2em] border border-current",
              b.feita && "bg-current",
            )}
            aria-hidden
          />
          <span className={b.feita ? "opacity-60 line-through" : undefined}>
            <Trechos conteudo={b.conteudo} base={base} />
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
          <Trechos conteudo={b.conteudo} base={base} />
        </div>
      );
    case "paragrafo":
      return (
        <div className={className} style={recuado(b.recuo)}>
          <Trechos conteudo={b.conteudo} base={base} />
        </div>
      );
  }
}

/**
 * Só a prévia da linha, se ela for uma menção sozinha que resolve; senão nada.
 * É o que o editor desenha embaixo da linha em edição: o texto cru em cima, a
 * imagem embaixo, e a alça continua na mão enquanto se escreve.
 */
export function PreviaDaLinha({
  linha,
  aoAjustar,
}: {
  linha: string;
  aoAjustar?: (ajuste: Ajuste, item?: number) => void;
}) {
  const b = bloco(linha);
  if (b.tipo === "galeria") return <Fileira bloco={b} aoAjustar={aoAjustar} senao={null} />;
  if (b.tipo !== "embed") return null;

  return <Embed bloco={b} aoAjustar={aoAjustar} senao={null} />;
}

/**
 * Quanto cada nível de recuo anda, em `em`: escala com a fonte, como o resto da
 * linha, e é o bastante para o item de baixo sair debaixo do marcador do de cima.
 */
const RECUO_EM = 1.5;

/** O marcador da lista por nível: o de dentro se distingue do de fora sem ler o recuo. */
const MARCADOR = ["•", "◦", "▪"] as const;

function recuado(recuo: number | undefined): { marginLeft: string } | undefined {
  return recuo ? { marginLeft: `${recuo * RECUO_EM}em` } : undefined;
}

function Embed({
  bloco,
  aoAjustar,
  senao,
}: {
  bloco: Extract<Bloco, { tipo: "embed" }>;
  aoAjustar?: (ajuste: Ajuste, item?: number) => void;
  senao: ReactNode;
}) {
  const vinculos = useContext(VinculosContext);

  return (
    <PreviaDaMencao
      bloco={bloco}
      vinculos={vinculos}
      aoAjustar={aoAjustar}
      senao={senao}
    />
  );
}

function Fileira({
  bloco,
  aoAjustar,
  senao,
}: {
  bloco: Extract<Bloco, { tipo: "galeria" }>;
  aoAjustar?: (ajuste: Ajuste, item?: number) => void;
  senao: ReactNode;
}) {
  const vinculos = useContext(VinculosContext);

  return <FileiraDePrevias bloco={bloco} vinculos={vinculos} aoAjustar={aoAjustar} senao={senao} />;
}

function Trechos({ conteudo, base }: { conteudo: string; base: number }) {
  const comPosicoes = useContext(PosicoesDoCruContext);

  if (!comPosicoes)
    return trechos(conteudo).map((trecho, indice) => (
      <TrechoView key={indice} trecho={trecho} />
    ));

  // Um `<span>` por trecho, com as posições na LINHA crua -- o conteúdo mais
  // o prefixo. A menção não leva `visivel`: é átomo. Ver `TrechoComPosicao`.
  return trechosComPosicao(conteudo).map(({ trecho, inicio, fim, dentro, visivel }, indice) => (
    <span
      key={indice}
      {...{
        [CRU.inicio]: base + inicio,
        [CRU.fim]: base + fim,
        [CRU.dentro]: base + dentro,
        ...(visivel === null ? {} : { [CRU.visivel]: visivel }),
      }}
    >
      <TrechoView trecho={trecho} />
    </span>
  ));
}

function TrechoView({ trecho }: { trecho: Trecho }) {
  const vinculos = useContext(VinculosContext);

  switch (trecho.tipo) {
    case "texto":
      return <>{trecho.valor}</>;
    case "mencao":
      return <TokenView token={trecho.token} vinculos={vinculos} />;
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

/**
 * O documento inteiro desenhado, linha a linha. Só leitura: é o da mesa.
 *
 * `memo` porque quem o monta re-renderiza por razões que não são o texto: o
 * cartão do quadro anda, e a cada quadro do gesto o `MarkdownView` dele
 * recebia o MESMO texto e reanalisava as sessenta linhas -- `bloco()`,
 * `trechos()` e as menções de cada uma -- para reconciliar uma árvore
 * idêntica. O texto é uma string, e igual é igual.
 */
export const MarkdownView = memo(function MarkdownView({
  texto,
  className,
}: {
  texto: string;
  className?: string;
}) {
  const linhas = texto.split("\n");
  return (
    <div className={cn("break-words whitespace-pre-wrap", className)}>
      {linhas.map((linha, indice) => (
        <LinhaMarkdown key={indice} linha={linha} />
      ))}
    </div>
  );
});

export type { Bloco };
