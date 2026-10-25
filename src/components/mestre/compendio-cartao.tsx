"use client";

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Plus,
  TextCursorInput,
  Ungroup,
} from "lucide-react";

import {
  CampoDeNome,
  ItensDeMover,
  TresPontos,
} from "@/components/mestre/arvore-de-pastas";
import { LuzDaAura } from "@/components/mestre/luz-da-aura";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { KIT_CONTEXTO, type Kit } from "@/components/ui/menu-kit";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ehElemento } from "@/lib/dom";
import type { AuraDoPlugin } from "@/lib/extensoes/auras";
import { t } from "@/lib/i18n/mestre";
import { aoApertarF2, useRenomearPeloMenu } from "@/hooks/use-renomear-pelo-menu";
import { t as textoDasPastas } from "@/lib/i18n/arquivos";
import {
  caminhoDaPasta,
  conteudoDaPasta,
  descendentes,
  pastaDoMembro,
  trilhaDaPasta,
} from "@/lib/mestre/arvore-de-pastas";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import type { FiltroDoCompendio } from "@/lib/mestre/compendio";
import { MINIATURA } from "@/lib/miniatura";
import { cn } from "@/lib/utils";
import { imagemDoBestiario } from "@/lib/vault/bestiario";
import { imagemDoCompendio, type TipoDeMolde } from "@/lib/vault/compendio";
import type { Medidor } from "@/types/character";
import type { ListaDePastasDoCompendio, Pasta } from "@/types/scene";

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
  // `ehElemento`, e não `instanceof Element`: o card numa janela solta é de
  // outro documento, e a classe do Mestre não o reconhece. Ver `lib/dom`.
  return (
    ehElemento(alvo) &&
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
  aura,
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
  /**
   * A aura de plugin da coisa: a borda na cor dela, com um brilho parado, e a
   * luz da aura só no card sob a mão. Parada nos outros pela conta de sempre:
   * quarenta e oito cards animando a borda são quarenta e oito camadas a
   * compor por quadro. Ver `LuzDaAura`.
   */
  aura?: AuraDoPlugin | null;
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
            style={aura ? { borderColor: aura.cor } : undefined}
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

        {aura ? (
          <>
            <span
              aria-hidden
              className="luz-camada opacity-60"
              style={{ "--luz-cor": aura.cor, "--luz-alcance": "16px" } as CSSProperties}
            />
            {emCima && aura.luz ? <LuzDaAura luz={aura.luz} alcance={22} /> : null}
          </>
        ) : null}

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
  return <ImagemPedida chave={assetId} pedir={() => imagemDoCompendio(assetId)} />;
}

/**
 * A miniatura de uma imagem da pasta de um plugin, do mesmo jeito: pedida
 * perto da vista, pelo IPC. `onUrl` entrega o endereço a quem precisa dele
 * fora do desenho -- o card, que o põe na sombra do arrasto. Ver
 * `imagemDoBestiario`.
 */
export function ImagemDoPlugin({
  extensaoId,
  caminho,
  onUrl,
}: {
  extensaoId: string;
  caminho: string;
  onUrl?: (url: string | null) => void;
}) {
  return (
    <ImagemPedida
      chave={`${extensaoId}/${caminho}`}
      pedir={() => imagemDoBestiario(extensaoId, caminho)}
      onUrl={onUrl}
    />
  );
}

/**
 * Uma imagem que vem por IPC, pedida quando a linha chega perto da vista. A
 * `chave` diz quando é outra imagem; `pedir` e `onUrl` são lidos no efeito
 * (`useEffectEvent`), e trocar de função a cada render não pede de novo.
 */
function ImagemPedida({
  chave,
  pedir,
  onUrl,
}: {
  chave: string;
  pedir: () => Promise<string>;
  onUrl?: (url: string | null) => void;
}) {
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
      // Numa janela solta, a raiz é o documento DELA: a implícita é a do
      // Mestre, e o card do outro monitor nunca "apareceria".
      {
        rootMargin: "100% 0px",
        ...(aqui.ownerDocument !== document ? { root: aqui.ownerDocument } : {}),
      },
    );
    observador.observe(aqui);

    return () => observador.disconnect();
  }, [perto]);

  const pedirAgora = useEffectEvent(pedir);
  const avisar = useEffectEvent((endereco: string | null) => onUrl?.(endereco));

  useEffect(() => {
    if (!perto) return;

    let ativo = true;
    let criada: string | null = null;

    void pedirAgora().then(
      (endereco) => {
        if (!ativo) {
          URL.revokeObjectURL(endereco);
          return;
        }
        criada = endereco;
        setUrl(endereco);
        avisar(endereco);
      },
      () => {},
    );

    return () => {
      ativo = false;
      if (criada) {
        URL.revokeObjectURL(criada);
        avisar(null);
      }
    };
  }, [perto, chave]);

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

/**
 * A pasta aberta em cada aba do Compêndio, e como ir a outra. Quem guarda é a
 * janela -- o "+" e a "Nova pasta" criam DENTRO da pasta aberta --, e quem lê
 * é a lista da aba e a trilha. Contexto, e não prop, porque são quatro listas
 * e uma janela entre as duas pontas.
 */
type NavegacaoDoCompendio = {
  /** A árvore da aba aberta: é o que a pasta diz ao arrasto. Ausente = sem pastas. */
  lista: ListaDePastasDoCompendio | undefined;
  /** Ausente = a raiz da aba. */
  pastaAberta: string | undefined;
  abrirPasta: (pastaId: string | undefined) => void;
};

const NavegacaoDoCompendioContext = createContext<NavegacaoDoCompendio>({
  lista: undefined,
  pastaAberta: undefined,
  abrirPasta: () => {},
});

/**
 * Os atributos que fazem um elemento ser PASTA para o arrasto de um card: o
 * card da pasta, ou um passo da trilha (`undefined` é a raiz). Ver `ler` em
 * `useTokenDrag`.
 */
function alvoDaPasta(
  lista: ListaDePastasDoCompendio | undefined,
  pastaId: string | undefined,
): Record<`data-${string}`, string> {
  return lista ? { "data-pasta-compendio": lista, "data-pasta-id": pastaId ?? "" } : {};
}

/** A mão está sobre esta pasta, com algo que entra nela? Para ela acender. */
function useSoltandoNaPasta(pastaId: string | undefined): boolean {
  return useTokenDragStore(
    (state) =>
      state.arrasto?.destino?.tipo === "pasta-compendio" &&
      state.arrasto.destino.pastaId === pastaId,
  );
}

export const NavegacaoDoCompendioProvider = NavegacaoDoCompendioContext.Provider;

function useNavegacaoDoCompendio(): NavegacaoDoCompendio {
  return useContext(NavegacaoDoCompendioContext);
}

/**
 * O que há numa lista da campanha, como num gerenciador de arquivos: a pasta
 * aberta, com as subpastas dela em ícone de pasta, primeiro, e os cards que
 * moram nela, depois. Clicar na pasta entra; a trilha (`TrilhaDoCompendio`)
 * volta. Era uma árvore, com cada pasta um cabeçalho e o que tinha dentro
 * logo embaixo, e cinquenta goblins numa pasta empurravam a próxima para fora
 * da janela.
 *
 * A mesma para os moldes, os itens, as condições, os efeitos e os disparos --
 * só muda a linha e de que lista são as pastas. Na busca, a lista plana com a
 * pasta de cada um embaixo do nome: entrar numa pasta esconderia o que foi
 * achado nas outras.
 *
 * Soltar o card arrastado numa pasta -- ou num passo da trilha -- o põe lá: é
 * o mesmo arrasto que o leva ao mapa, e quem recebe é a janela (ver o alvo
 * `compendio` no `PainelDoCompendio`). O "Mover para" do menu continua. A
 * pasta em si não se arrasta.
 */
export function ArvoreDoCompendio<T extends { id: string }>({
  achados,
  pastas,
  buscando,
  rotuloCriarAqui,
  onCriarEm,
  linha,
}: {
  achados: T[];
  pastas: Pasta[];
  buscando: boolean;
  rotuloCriarAqui: string;
  onCriarEm: (pastaId: string) => void;
  linha: (coisa: T, depth: number, caminho?: string) => ReactNode;
}) {
  const { pastaAberta, abrirPasta } = useNavegacaoDoCompendio();
  const dentro = useMemo(
    () =>
      buscando
        ? null
        : conteudoDaPasta(achados, pastas, (coisa) => pastaDoMembro(pastas, coisa.id), pastaAberta),
    [achados, buscando, pastas, pastaAberta],
  );
  // Outra pasta é outra lista: volta ao primeiro lote.
  const { limite, fim } = useAosPoucos(dentro ? `${pastaAberta}` : achados, (dentro?.itens ?? achados).length);

  // Na busca, uma grade só, com a pasta de cada um no card.
  if (dentro === null) {
    return (
      <>
        <GradeDeCartoes>
          {achados
            .slice(0, limite)
            .map((coisa) =>
              linha(coisa, 0, caminhoDaPasta(pastas, pastaDoMembro(pastas, coisa.id))),
            )}
        </GradeDeCartoes>
        {fim}
      </>
    );
  }

  if (dentro.pastas.length === 0 && dentro.itens.length === 0)
    return <p className="text-muted-foreground px-3 py-6 text-center text-xs">{texto.pastaVazia}</p>;

  return (
    <>
      <GradeDeCartoes>
        {dentro.pastas.map(({ pasta, total }) => (
          <CartaoDaPasta
            key={pasta.id}
            pasta={pasta}
            pastas={pastas}
            total={total}
            onAbrir={() => abrirPasta(pasta.id)}
            rotuloCriarAqui={rotuloCriarAqui}
            onCriarAqui={() => onCriarEm(pasta.id)}
          />
        ))}
        {dentro.itens.slice(0, limite).map((coisa) => linha(coisa, 0))}
      </GradeDeCartoes>
      {fim}
    </>
  );
}

/**
 * A área de imagem dos cards de cada aba, para a pasta ter a mesma: em pé no
 * bestiário, quadrada nos itens, deitada nas condições e nos efeitos. Ver
 * `Cartao`. O ícone sempre pela LARGURA: a altura da área sai do
 * `aspect-ratio`, e um `h-3/5` dentro dela não tem do que ser três quintos --
 * o SVG cai na altura padrão e estica a área.
 */
const FORMATO_DA_PASTA: Record<ListaDePastasDoCompendio, { area: string; icone: string }> = {
  compendio: { area: "aspect-[4/5]", icone: "w-3/5" },
  "compendio-itens": { area: "aspect-square", icone: "w-3/5" },
  "compendio-condicoes": { area: "aspect-[2/1]", icone: "w-1/3" },
  "compendio-efeitos": { area: "aspect-[2/1]", icone: "w-1/3" },
  "compendio-disparos": { area: "aspect-[2/1]", icone: "w-1/3" },
  "compendio-ambientes": { area: "aspect-[2/1]", icone: "w-1/3" },
};

/**
 * A pasta como num gerenciador de arquivos, do tamanho dos cards ao lado: a
 * mesma moldura e a mesma área de imagem, com o ícone de pasta no lugar do
 * retrato, e o nome e quanto tem dentro onde o card tem o nome. Um ícone solto
 * de cem pixels ao lado de um card de duzentos e tantos parecia outra coisa.
 *
 * Um clique entra. O menu -- botão direito ou os três pontos -- tem o que a
 * linha da pasta tinha: criar aqui, subpasta, renomear, mover e desfazer.
 * Renomear é no lugar, no próprio nome.
 */
function CartaoDaPasta({
  pasta,
  pastas,
  total,
  onAbrir,
  rotuloCriarAqui,
  onCriarAqui,
}: {
  pasta: Pasta;
  /** As da mesma lista: os destinos do "Mover para" e o número da subpasta. */
  pastas: Pasta[];
  total: number;
  onAbrir: () => void;
  rotuloCriarAqui: string;
  onCriarAqui: () => void;
}) {
  const [renomeando, setRenomeando] = useState(false);
  const renomear = useRenomearPeloMenu(() => setRenomeando(true));
  const store = () => useSceneStore.getState();
  const { lista } = useNavegacaoDoCompendio();
  const formato = FORMATO_DA_PASTA[lista ?? "compendio"];
  const soltando = useSoltandoNaPasta(pasta.id);

  // Destinos válidos: nem ela, nem descendente dela.
  const proibidos = new Set(descendentes(pastas, pasta.id));
  const destinos = pastas.filter((outra) => !proibidos.has(outra.id));

  const itens = (kit: Kit) => {
    const { Item, Separator } = kit;
    return (
      <>
        <Item onClick={onAbrir}>
          <FolderOpen />
          {texto.abrir}
        </Item>
        <Item onClick={onCriarAqui}>
          <Plus />
          {rotuloCriarAqui}
        </Item>
        <Item onClick={() => store().criarPasta(textoDasPastas.nomesPadrao.pasta(pastas.length + 1), pasta.id)}>
          <FolderPlus />
          {textoDasPastas.geral.novaSubpasta}
        </Item>
        <Separator />
        <Item onClick={renomear.pedir}>
          <TextCursorInput />
          {textoDasPastas.geral.renomear}
        </Item>
        <ItensDeMover
          kit={kit}
          atual={pasta.parentId}
          destinos={destinos}
          onMover={(destino) => store().moverPasta(pasta.id, destino)}
        />
        <Separator />
        {/* Desfazer solta o que há dentro um nível acima. Nunca apaga o que
            está dentro: é organização, não remoção. */}
        <Item onClick={() => store().removerPasta(pasta.id)}>
          <Ungroup />
          {textoDasPastas.arvoreDePastas.desfazerPasta}
        </Item>
      </>
    );
  };

  return (
    <ContextMenu onOpenChangeComplete={renomear.aoFechar}>
      <ContextMenuTrigger
        render={
          <li
            {...alvoDaPasta(lista, pasta.id)}
            className={cn(
              "group bg-card hover:border-foreground/25 relative isolate flex min-w-0 flex-col overflow-hidden rounded-lg border transition-colors select-none",
              // Com um card na mão por cima: é aqui que ele cai.
              soltando && "border-primary ring-primary ring-2",
            )}
          />
        }
      >
        <button
          type="button"
          className={cn(
            "bg-muted/60 focus-visible:ring-ring flex w-full items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset",
            formato.area,
          )}
          title={texto.abrirPasta(pasta.nome)}
          onClick={onAbrir}
          onKeyDown={aoApertarF2(() => setRenomeando(true))}
        >
          <IconeDePasta vazia={total === 0} className={formato.icone} />
        </button>

        <span className="flex min-w-0 flex-col gap-0.5 p-2">
          {renomeando ? (
            <CampoDeNome
              valor={pasta.nome}
              rotulo={textoDasPastas.geral.nomeDaPasta}
              onConfirmar={(nome) => {
                const limpo = nome.trim();
                if (limpo && limpo !== pasta.nome) store().atualizarPasta(pasta.id, { nome: limpo });
                setRenomeando(false);
              }}
              onCancelar={() => setRenomeando(false)}
            />
          ) : (
            <span className="truncate text-xs font-medium" title={pasta.nome}>
              {pasta.nome}
            </span>
          )}
          <span className="text-muted-foreground text-[10px] tabular-nums">{texto.naPasta(total)}</span>
        </span>

        <span className="absolute top-1 right-1">
          <TresPontos
            rotulo={pasta.nome}
            aoFechar={renomear.aoFechar}
            focoFinal={renomear.focoFinal}
            itens={itens}
          />
        </span>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52" finalFocus={renomear.focoFinal}>
        {itens(KIT_CONTEXTO)}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * A pasta de uma coleção do bestiário de um plugin: o mesmo card da pasta do
 * mestre, pintado com a aura da coleção -- a cor na pasta e o emblema na
 * frente dela -- e só de leitura. Um clique entra; não se renomeia, não se
 * move e não se desfaz, porque não é do mestre: é do plugin, e some com ele.
 *
 * Embaixo do nome, quantas fichas e de que plugin: é pela pasta que o mestre
 * sabe de onde a ameaça veio, e a quem dar o crédito. A mesma pasta serve às
 * coleções de itens, na aba deles: quadrada como os cards ao lado, e contando
 * itens. E às coleções das abas de plugin (os rituais): deitada como os cards
 * de verbete, e só com o número, porque o nome do que se conta é do plugin.
 */
export function CartaoDaColecao({
  nome,
  plugin,
  total,
  aura,
  itens = false,
  verbetes = false,
  onAbrir,
}: {
  nome: string;
  plugin: string;
  total: number;
  aura: AuraDoPlugin | null;
  /** Uma coleção de itens, e não de fichas. */
  itens?: boolean;
  /** Uma coleção de uma aba de plugin: verbetes. */
  verbetes?: boolean;
  onAbrir: () => void;
}) {
  const formato = FORMATO_DA_PASTA[verbetes ? "compendio-condicoes" : itens ? "compendio-itens" : "compendio"];

  return (
    <li
      className="group bg-card hover:border-foreground/25 relative isolate flex min-w-0 flex-col overflow-hidden rounded-lg border transition-colors select-none"
      style={aura ? { borderColor: aura.cor } : undefined}
    >
      <button
        type="button"
        className={cn(
          "bg-muted/60 focus-visible:ring-ring flex w-full items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset",
          formato.area,
        )}
        title={texto.abrirPasta(nome)}
        onClick={onAbrir}
      >
        <span className={cn("relative", formato.icone)}>
          <IconeDePasta vazia={total === 0} cor={aura?.cor} className="w-full" />
          {/* O emblema na FRENTE da pasta: o centro dela fica a 59% da altura
              do desenho, abaixo da aba. */}
          {aura?.emblema ? (
            <span className="absolute top-[59%] left-1/2 aspect-square w-[42%] -translate-x-1/2 -translate-y-1/2">
              <ImagemDoPlugin extensaoId={aura.extensao} caminho={aura.emblema} />
            </span>
          ) : null}
        </span>
      </button>

      <span className="flex min-w-0 flex-col gap-0.5 p-2">
        <span className="truncate text-xs font-medium" title={nome}>
          {nome}
        </span>
        <span className="text-muted-foreground truncate text-[10px] tabular-nums">
          {verbetes
            ? texto.verbetesNaPastaDoPlugin(total, plugin)
            : itens
              ? texto.itensNaPastaDoPlugin(total, plugin)
              : texto.naPastaDoPlugin(total, plugin)}
        </span>
      </span>
    </li>
  );
}

/**
 * O ícone de pasta, desenhado como o do sistema: a aba de trás mais escura e a
 * frente clara por cima. Desenhado, e não o traço do lucide, para ler de longe
 * como PASTA, e não como mais um botão. A vazia fica apagada.
 *
 * Cinza, o dos textos de apoio: a cor do Compêndio é a dos cards -- a da
 * condição, a do efeito --, e uma pasta azul disputava com eles. Do tema, e
 * não um cinza fixo, para continuar cinza no claro e no escuro.
 */
function IconeDePasta({ vazia, cor, className }: { vazia: boolean; cor?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 52"
      aria-hidden
      className={cn(
        "aspect-64/52 drop-shadow-sm",
        !cor && "text-muted-foreground",
        vazia && "opacity-50",
        className,
      )}
      style={cor ? { color: cor } : undefined}
    >
      <path
        d="M4 7a5 5 0 0 1 5-5h13.6a5 5 0 0 1 3.7 1.6L30 7.5h25a5 5 0 0 1 5 5V45a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"
        fill="currentColor"
        fillOpacity={0.55}
      />
      <path
        d="M4 16a5 5 0 0 1 5-5h46a5 5 0 0 1 5 5v29a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * A TRILHA da pasta aberta, em cima da lista: a aba e cada pasta do caminho,
 * para voltar a qualquer uma num clique, e a seta que sobe um nível. Fora da
 * área que rola, como o filtro: é controle da lista, e fica à vista no fundo
 * de uma pasta comprida.
 */
export function TrilhaDoCompendio({
  raiz,
  pastas,
  colecao,
}: {
  raiz: string;
  pastas: Pasta[];
  /**
   * A pasta de um plugin aberta, que não é do board: a trilha é a raiz e ela,
   * e voltar a fecha. Ver `CartaoDaColecao`.
   */
  colecao?: { nome: string; onFechar: () => void };
}) {
  const { lista, pastaAberta, abrirPasta } = useNavegacaoDoCompendio();
  const trilha = trilhaDaPasta(pastas, pastaAberta);
  const mae = trilha.at(-2)?.id;

  if (colecao) {
    return (
      <nav aria-label={texto.trilha} className="flex min-w-0 shrink-0 items-center gap-0.5 px-2 pb-1.5">
        <Button variant="ghost" size="icon-xs" aria-label={texto.voltar} title={texto.voltar} onClick={colecao.onFechar}>
          <ArrowLeft />
        </Button>
        <PassoDaTrilha alvo={{}} pastaId={undefined} atual={false} onClick={colecao.onFechar}>
          {raiz}
        </PassoDaTrilha>
        <ChevronRight className="text-muted-foreground size-3 shrink-0" aria-hidden />
        <PassoDaTrilha alvo={{}} pastaId="" atual onClick={() => {}}>
          {colecao.nome}
        </PassoDaTrilha>
      </nav>
    );
  }

  return (
    <nav aria-label={texto.trilha} className="flex min-w-0 shrink-0 items-center gap-0.5 px-2 pb-1.5">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={texto.voltar}
        title={texto.voltar}
        disabled={trilha.length === 0}
        onClick={() => abrirPasta(mae)}
      >
        <ArrowLeft />
      </Button>
      {/* Cada passo de cima também recebe o card arrastado: soltar na raiz
          tira da pasta, como num gerenciador de arquivos. A pasta aberta,
          não -- o card já está nela. */}
      <PassoDaTrilha
        alvo={trilha.length > 0 ? alvoDaPasta(lista, undefined) : {}}
        pastaId={undefined}
        atual={trilha.length === 0}
        onClick={() => abrirPasta(undefined)}
      >
        {raiz}
      </PassoDaTrilha>
      {trilha.map((pasta, indice) => {
        const ultima = indice === trilha.length - 1;
        return (
          <Fragment key={pasta.id}>
            <ChevronRight className="text-muted-foreground size-3 shrink-0" aria-hidden />
            <PassoDaTrilha
              alvo={ultima ? {} : alvoDaPasta(lista, pasta.id)}
              pastaId={pasta.id}
              atual={ultima}
              onClick={() => abrirPasta(pasta.id)}
            >
              {pasta.nome}
            </PassoDaTrilha>
          </Fragment>
        );
      })}
    </nav>
  );
}

/** Um passo da trilha: volta para lá no clique, e recebe o card arrastado. */
function PassoDaTrilha({
  alvo,
  pastaId,
  atual,
  onClick,
  children,
}: {
  alvo: Record<`data-${string}`, string>;
  pastaId: string | undefined;
  /** A pasta aberta: nem clique, nem alvo. */
  atual: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const soltando = useSoltandoNaPasta(pastaId) && !atual;

  return (
    <button
      type="button"
      {...alvo}
      className={cn(
        "hover:bg-accent min-w-0 shrink-0 truncate rounded px-1.5 py-0.5 text-xs",
        atual ? "font-medium" : "text-muted-foreground",
        soltando && "bg-accent ring-primary ring-2",
      )}
      disabled={atual}
      aria-current={atual ? "page" : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
