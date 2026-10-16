"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { TresPontos } from "@/components/mestre/arvore-de-pastas";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { KIT_CONTEXTO, type Kit } from "@/components/ui/menu-kit";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/lib/i18n/mestre";
import type { FiltroDoCompendio } from "@/lib/mestre/compendio";
import { MINIATURA } from "@/lib/miniatura";
import { cn } from "@/lib/utils";
import { imagemDoCompendio, type TipoDeMolde } from "@/lib/vault/compendio";
import type { Medidor } from "@/types/character";

/**
 * As peças das listas do Compêndio: o card, a grade, a montagem aos poucos e
 * os avisos. Moram fora da janela para as abas de condições e de efeitos (ver
 * `compendio-condicoes.tsx` e `compendio-efeitos.tsx`) desenharem o MESMO card
 * que o Bestiário e os Itens -- quatro listas, um gesto só.
 */

const texto = t.compendio;

/** De que Compêndio: o da campanha aberta, ou o da máquina. */
export type Onde = "campanha" | "ato20";

/** As tags de uma coisa sendo editadas, e onde ela mora. */
export type EdicaoDeTags = {
  onde: Onde;
  tipo: TipoDeMolde;
  id: string;
  nome: string;
  tags: string[];
};

/**
 * Se a mão está sobre o card, para o desenho que só se mexe enquanto ela está
 * lá: o boneco do efeito, que mostra o efeito animado nele (ver
 * `compendio-efeitos.tsx`). Por contexto, e não por prop: o desenho chega
 * pronto, de quem monta a lista, e só ele redesenha quando a mão entra.
 */
const EmCimaDoCartao = createContext(false);

export function useEmCimaDoCartao(): boolean {
  return useContext(EmCimaDoCartao);
}

/**
 * O `pointerdown` é do card, e pode virar arrasto? Não quando vem de um campo
 * -- arrastar ali é selecionar o nome que se escreve --, nem quando vem de um
 * popover aberto pelo card: o evento do React atravessa o portal até o card, e
 * o deslizador do efeito levaria a condição para o mapa.
 */
export function daMaoNoCartao(event: ReactPointerEvent): boolean {
  const alvo = event.target;
  return (
    alvo instanceof Element &&
    event.currentTarget.contains(alvo) &&
    !alvo.closest("input, textarea, [contenteditable]")
  );
}

/** Quantos cards entram por vez. Divide por 2, 3 e 4 colunas. */
const LOTE = 48;

/**
 * A grade montada aos poucos: um lote de cards, e o próximo quando a rolagem
 * chega perto do fim.
 *
 * Medido na WebKitGTK: ligar uma tag com 300 moldes levava 785 ms no `next
 * dev`, porque a tag tira quase todos da lista e, desligada, monta todos de
 * novo -- e montar card é o que custa. Com lotes, ligar uma tag custa um lote.
 * O mestre não vê a diferença: o próximo lote chega uma tela antes do fim.
 *
 * `chave` volta ao primeiro lote quando a lista passa a ser OUTRA -- busca,
 * tag --, e não quando um molde entra ou sai dela.
 */
export function useAosPoucos(chave: unknown, total: number) {
  const [limite, setLimite] = useState(LOTE);
  const [chaveDoLimite, setChaveDoLimite] = useState(chave);
  const sentinela = useRef<HTMLDivElement>(null);
  const temMais = total > limite;

  // No render, e não num efeito: um efeito mostraria um quadro com o lote
  // velho da lista nova antes de voltar ao primeiro.
  if (chave !== chaveDoLimite) {
    setChaveDoLimite(chave);
    setLimite(LOTE);
  }

  useEffect(() => {
    const aqui = sentinela.current;
    if (!temMais || !aqui) return;

    // A raiz é a área que rola, e não a janela do aplicativo: com a janela, a
    // margem não valeria dentro da coluna, e o lote só viria ao bater no fim.
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting))
          setLimite((atual) => atual + LOTE);
      },
      { root: aqui.closest("[data-rolagem-do-compendio]"), rootMargin: "0px 0px 600px 0px" },
    );
    observador.observe(aqui);

    return () => observador.disconnect();
  }, [limite, temMais]);

  const fim = temMais ? <div ref={sentinela} aria-hidden className="h-px" /> : null;

  return { limite, fim };
}

export function falhou(cause: unknown) {
  toast.error(cause instanceof Error ? cause.message : texto.falhou);
}

/**
 * A grade dos cards: tantas colunas quanto couberem, cada uma com pelo menos
 * 8,5rem. Na janela solta de 320 são duas; na de 480, três -- o card nunca
 * encolhe a ponto de o retrato virar um selo.
 */
export function GradeDeCartoes({ recuo = 0, children }: { recuo?: number; children: ReactNode }) {
  return (
    <ul
      // A folga da direita é a da barra de rolagem, que passa POR CIMA do
      // conteúdo: sem ela, a borda do card da última coluna some embaixo dela.
      className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 pr-3 pb-1 pl-2"
      style={recuo > 0 ? { paddingLeft: 8 + recuo } : undefined}
    >
      {children}
    </ul>
  );
}

/**
 * O card do bestiário: a cara do monstro em cima, o nome, os dois primeiros
 * medidores e as tags embaixo.
 *
 * Os mesmos gestos da linha -- clicar abre, o botão direito e os três pontos
 * têm o menu, a ação da vez aparece no hover --, só que sobre a imagem: no
 * card, o canto de cima é onde a mão procura o que fazer com ele.
 */
export function Cartao({
  nome,
  nomeEditavel,
  detalhe,
  tags = [],
  medidores = [],
  corpo,
  quadrado = false,
  faixa = false,
  fundo,
  tinta,
  titulo,
  imagem,
  naMao = false,
  onAbrir,
  onPointerDown,
  acao,
  itens,
}: {
  nome: string;
  /**
   * O nome que se edita no próprio card, no lugar do texto: o da condição,
   * que não tem janela onde se renomear. Ver `NomeDoMedidor`.
   */
  nomeEditavel?: ReactNode;
  detalhe?: string;
  tags?: string[];
  medidores?: Medidor[];
  /** O que mais o card mostra embaixo do nome: os atributos do item. */
  corpo?: ReactNode;
  /** Imagem quadrada, e não em pé: o item é objeto, não retrato. */
  quadrado?: boolean;
  /**
   * Imagem deitada e baixa: o desenho da condição e do efeito é um selo, e um
   * quadrado inteiro em volta dele seria só espaço.
   */
  faixa?: boolean;
  /**
   * A mesma imagem, de novo, para virar a COR do card: ampliada, desfocada e
   * com um véu escuro, atrás de tudo. Ausente quando não há imagem -- a
   * caveira desfocada seria só um borrão cinza.
   */
  fundo?: ReactNode;
  /**
   * A cor do card quando ele não tem imagem, mas tem cor: a da condição, a do
   * efeito. Um brilho dela atrás do desenho, sem desfoque -- desfocar uma cor
   * lisa daria a mesma cor, e custaria o mesmo que desfocar um retrato.
   */
  tinta?: string;
  titulo?: string;
  imagem: ReactNode;
  naMao?: boolean;
  onAbrir?: () => void;
  onPointerDown?: (event: ReactPointerEvent) => void;
  acao: ReactNode;
  itens: (kit: Kit) => ReactNode;
}) {
  // Os três pontos e a ação só montam quando a mão chega no card -- ver o
  // comentário no `<li>`.
  const [acordado, setAcordado] = useState(false);
  const acordar = () => setAcordado(true);
  const [emCima, setEmCima] = useState(false);

  const conteudo = (
    <>
      <span
        className={cn(
          "relative flex w-full items-center justify-center overflow-hidden",
          faixa ? "aspect-[2/1]" : quadrado ? "aspect-square" : "aspect-[4/5]",
          !fundo && !tinta && "bg-muted/60",
        )}
        // Com fundo, a imagem SOME para dentro dele em vez de terminar numa
        // linha: o card vira uma peça só, da cor do monstro, e o nome fica
        // sobre essa cor. As duas grafias porque o WebKitGTK ainda lê a
        // prefixada -- ver `item-window`.
        style={fundo ? MASCARA_DO_CARTAO : undefined}
      >
        <EmCimaDoCartao value={emCima}>{imagem}</EmCimaDoCartao>
      </span>

      <span className="flex min-w-0 flex-col gap-1 p-2">
        {nomeEditavel ?? <span className="truncate text-xs font-medium">{nome}</span>}

        {medidores.slice(0, 2).map((medidor) => (
          <MedidorDoCartao key={medidor.id} medidor={medidor} />
        ))}

        {corpo}

        {tags.length > 0 ? (
          <span className="flex min-w-0 flex-wrap gap-1">
            {tags.map((tag) => (
              <Etiqueta key={tag}>{tag}</Etiqueta>
            ))}
          </span>
        ) : null}

        {detalhe ? (
          <span className="text-muted-foreground truncate text-[10px]">{detalhe}</span>
        ) : null}
      </span>
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <li
            className={cn(
              "group bg-card relative isolate flex min-w-0 flex-col overflow-hidden rounded-lg border select-none transition-colors hover:border-foreground/25",
              onPointerDown && "cursor-grab touch-none active:cursor-grabbing",
              naMao && "opacity-40",
            )}
            onPointerDown={onPointerDown}
            // Menus sob demanda: o menu de três pontos e a dica da ação são
            // componentes pesados de montar, e uma grade de 48 cards montava
            // 96 deles que ninguém ia abrir. Montam no primeiro hover ou foco
            // -- que sempre vêm antes de qualquer clique neles.
            onPointerEnter={() => {
              acordar();
              setEmCima(true);
            }}
            onPointerLeave={() => setEmCima(false)}
            onFocus={acordar}
          />
        }
      >
        {/* A cor do card: a imagem ampliada e desfocada atrás de tudo, como o
            cabeçalho da janela do item. A miniatura, e não a imagem grande:
            desfocadas, as duas ficam iguais. O véu escuro é o que mantém o
            nome legível sobre um retrato claro. `-z-10` dentro do `isolate`
            do card: fica atrás do conteúdo e na frente do fundo dele. */}
        {fundo ? (
          <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <span className="absolute inset-0 scale-150 opacity-70 blur-2xl saturate-150">
              {fundo}
            </span>
            <span className="absolute inset-0 bg-black/40" />
          </span>
        ) : null}

        {tinta && !fundo ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background: `radial-gradient(120% 80% at 50% 25%, color-mix(in srgb, ${tinta} 38%, transparent), transparent 75%)`,
            }}
          />
        ) : null}

        {onAbrir ? (
          <button
            type="button"
            className="focus-visible:ring-ring flex min-w-0 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
            title={titulo}
            onClick={onAbrir}
          >
            {conteudo}
          </button>
        ) : (
          <div className="flex min-w-0 flex-col" title={titulo}>
            {conteudo}
          </div>
        )}

        {/* Sobre a imagem, com fundo próprio: o retrato pode ser claro ou
            escuro, e o botão tem de aparecer nos dois. */}
        <span className="bg-background/80 absolute top-1 right-1 flex items-center rounded-md opacity-0 backdrop-blur-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {acordado ? (
            <>
              {acao}
              <TresPontos rotulo={nome} aoFechar={() => {}} itens={itens} />
            </>
          ) : null}
        </span>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">{itens(KIT_CONTEXTO)}</ContextMenuContent>
    </ContextMenu>
  );
}

/** O fim da imagem do card, sumindo para dentro do fundo desfocado. */
const MASCARA_DO_CARTAO = {
  maskImage: "linear-gradient(to bottom, black 70%, transparent)",
  WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent)",
};

/**
 * Um medidor no card: o nome, o número e uma barra na cor dele.
 *
 * Só leitura, e de propósito: mexer na vida do molde é preparar a ficha, e
 * isso se faz na ficha. O medidor escondido aparece igual -- quem olha o
 * Compêndio é o mestre.
 */
function MedidorDoCartao({ medidor }: { medidor: Medidor }) {
  const parte = medidor.maximo > 0 ? Math.min(1, Math.max(0, medidor.atual / medidor.maximo)) : 0;

  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-muted-foreground flex items-baseline justify-between gap-1 text-[10px]">
        <span className="truncate">{medidor.nome}</span>
        <span className="text-foreground shrink-0 tabular-nums">
          {medidor.atual}/{medidor.maximo}
        </span>
      </span>
      <span className="bg-muted h-1 overflow-hidden rounded-full">
        <span
          className="block h-full rounded-full"
          style={{ width: `${parte * 100}%`, backgroundColor: medidor.cor }}
        />
      </span>
    </span>
  );
}

export function AcaoDaLinha({
  rotulo,
  onClick,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={rotulo}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{rotulo}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A miniatura de uma imagem do Compêndio do ATO20, pedida quando a linha chega
 * perto da vista -- os bytes vêm por IPC, e o `loading="lazy"` do navegador não
 * alcança a ida ao Rust. Ver `imagemDoCompendio`.
 */
export function ImagemDaMaquina({ assetId }: { assetId: string }) {
  const ancora = useRef<HTMLSpanElement>(null);
  const [perto, setPerto] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const aqui = ancora.current;
    if (perto || !aqui) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) setPerto(true);
      },
      { rootMargin: "100% 0px" },
    );
    observador.observe(aqui);

    return () => observador.disconnect();
  }, [perto]);

  useEffect(() => {
    if (!perto) return;

    let ativo = true;
    let criada: string | null = null;

    void imagemDoCompendio(assetId).then(
      (endereco) => {
        if (!ativo) {
          URL.revokeObjectURL(endereco);
          return;
        }
        criada = endereco;
        setUrl(endereco);
      },
      () => {},
    );

    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [perto, assetId]);

  return (
    <span ref={ancora} className="absolute inset-0">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" draggable={false} {...MINIATURA} />
      ) : null}
    </span>
  );
}

export function Lendo() {
  return <p className="text-muted-foreground p-3 text-xs">{texto.lendo}</p>;
}

export function NadaCom({ filtro }: { filtro: FiltroDoCompendio }) {
  return (
    <p className="text-muted-foreground p-3 text-xs">
      {filtro.busca.trim() ? texto.nadaCom(filtro.busca.trim()) : texto.nadaComTags}
    </p>
  );
}

/**
 * Há busca ou tag ligada: a lista mostra os achados, planos, e não a árvore.
 * Ver `ArvoreDoCompendio`.
 */
export function filtrando(filtro: FiltroDoCompendio): boolean {
  return filtro.busca.trim() !== "" || filtro.tags.length > 0;
}

/** Uma tag desenhada, sem gesto: a da linha e a do editor. */
export function Etiqueta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-4 shrink-0 items-center rounded-full px-1.5 text-[10px] leading-none",
        className,
      )}
    >
      {children}
    </span>
  );
}
