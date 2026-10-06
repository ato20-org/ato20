"use client";

import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  AArrowDown,
  AArrowUp,
  AtSign,
  Bold,
  ChevronDown,
  ChevronRight,
  Code,
  Columns2,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  ListOrdered,
  ListTodo,
  Maximize2,
  SeparatorHorizontal,
  SquareCode,
  TextQuote,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { ListaDeSugestoes, MARCA_LISTA } from "@/components/mencoes/sugestoes";
import {
  LinhaMarkdown,
  PosicoesDoCruContext,
  PreviaDaLinha,
  VinculosContext,
} from "@/components/playground/markdown-view";
import {
  comBloco,
  comLink,
  comMarca,
  comRecuo,
  cursorDepoisDoBloco,
  prefixoDe,
  type BlocoDaBarra,
  type MarcaDaBarra,
} from "@/lib/markdown/formatar";
import { bloco, comAjuste } from "@/lib/markdown/linha";
import { pontoNoCru, type PontoNoCru } from "@/lib/markdown/ponto-no-cru";
import { cn } from "@/lib/utils";
import {
  aplicaSugestao,
  fantasmaDe,
  filtraSugestoes,
  type Sugestao,
} from "@/lib/mencoes/sugestao";
import {
  fragmentoDoPostit,
  TITULO_DO_POSTIT,
  type SinalDoPostit,
} from "@/lib/mestre/postit-mencoes";
import { normaliza } from "@/lib/search";
import { useMencoesDoMestre } from "@/hooks/use-mencoes-do-mestre";
import { Button } from "@/components/ui/button";
import { aoApertarF2 } from "@/hooks/use-renomear-pelo-menu";
import {
  abrirNotaAoLado,
  fecharNotaEmTodaParte,
  trazerNotaAoCentro,
} from "@/lib/mestre/abrir-nota";
import { useAssetsStore } from "@/lib/store/use-assets-store";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import {
  deslocamentoDe,
  posicaoDe,
  useHistoricoDeTexto,
} from "@/lib/mestre/historico-de-texto";
import { ConfirmarRemocao } from "@/components/mestre/confirmar-remocao";
import { PainelDeMencoes } from "@/components/mestre/mencoes-da-nota";
import { ProcurarNaNota } from "@/components/mestre/procurar-na-nota";
import { useDocumentoStore } from "@/lib/store/use-documento-store";
import { useTokenDragStore, type FonteDoArrasto } from "@/lib/store/use-token-drag-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cursorDoCampo, trazerParaAVista } from "@/lib/mestre/cursor-a-vista";
import { apagarDocumento } from "@/lib/vault/documentos";
import type { Nota } from "@/types/scene";

/** A fonte da nota: de onde começa, até onde vai, e o degrau de cada toque. */
const FONTE_PADRAO = 16;
const FONTE_MIN = 12;
const FONTE_MAX = 28;
const FONTE_PASSO = 2;

/**
 * A vista de uma nota: o editor de Markdown no lugar do palco.
 *
 * Como o Obsidian abre um arquivo no painel principal. Título em cima, editável
 * no clique; o corpo é o `EditorAoVivo`; rodapé com fonte e contagem. O texto
 * vem do `useDocumentoStore`, o mesmo que os cartões do quadro leem -- a nota
 * é uma, os cartões são N.
 */
export function NotaEditor({
  nota,
  onde,
}: {
  nota: Nota;
  /**
   * Onde ela está aberta: no CENTRO, no lugar do palco, ou num painel ao lado
   * do mapa. Decide para onde o botão de dividir a leva. Ver `abrir-nota`.
   */
  onde: "centro" | "painel";
}) {
  const texto = useDocumentoStore((state) => state.textos[nota.arquivo]);
  const carregar = useDocumentoStore((state) => state.carregar);
  const escrever = useDocumentoStore((state) => state.escrever);
  const renomearNota = useSceneStore((state) => state.renomearNota);
  const removerNota = useSceneStore((state) => state.removerNota);
  const { vinculos, candidatos } = useMencoesDoMestre();

  useEffect(() => {
    carregar(nota.arquivo);
  }, [nota.arquivo, carregar]);

  const [renomeando, setRenomeando] = useState(false);
  const [fonte, setFonte] = useState(FONTE_PADRAO);
  /** Um pedido de ir a uma linha, vindo do sumário. `vez` distingue dois cliques na mesma. */
  const [salto, setSalto] = useState<{ indice: number; vez: number } | null>(null);
  const [cru, setCru] = useState(false);
  const barra = useRef<BarraDoEditor | null>(null);
  /** Onde o texto desenhado está, para o Ctrl+F procurar. */
  const textoDesenhado = useRef<HTMLDivElement | null>(null);
  /** A busca aberta, e quantas vezes o Ctrl+F foi apertado: cada vez devolve o foco a ela. */
  const [procura, setProcura] = useState<number | null>(null);
  /** O termo que a lupa do painel de menções pediu. Ver `ProcurarNaNota.termoPedido`. */
  const [termoProcurado, setTermoProcurado] = useState<{ valor: string; vez: number } | undefined>();
  const [mencoesAbertas, setMencoesAbertas] = useState(false);
  /**
   * O Sumário recolhido, lembrado na máquina: quem prefere a nota na largura
   * toda prefere em todas as notas, e reabrir a cada nota seria o mesmo clique
   * toda vez.
   */
  const [sumarioRecolhido, setSumarioRecolhido] = useState(lerSumarioRecolhido);
  function recolherSumario(recolhido: boolean) {
    setSumarioRecolhido(recolhido);
    try {
      localStorage.setItem(CHAVE_SUMARIO, recolhido ? "1" : "0");
    } catch {
      // Armazenamento bloqueado: vale nesta sessão, e volta aberto na próxima.
    }
  }
  const [linhaAtiva, setLinhaAtiva] = useState<string | null>(null);
  /** A raiz do editor: é por ela que se sabe se o foco está nesta nota. */
  const raiz = useRef<HTMLDivElement | null>(null);

  /**
   * Ctrl+F procura na nota. Sai do texto cru, se estava nele: a busca lê o
   * texto DESENHADO, e o cru é um campo só.
   *
   * Ctrl+= e Ctrl+- mudam a fonte da nota, e Ctrl+0 volta ao padrão: são as
   * teclas que todo navegador usa para o tamanho do texto, e com a nota aberta
   * é o texto que se quer maior.
   *
   * Na CAPTURA e no `window`, antes de todo mundo: os mesmos atalhos são o zoom
   * do palco em `atalhos.ts`, e antes do campo da linha, para valer também no
   * meio da escrita.
   *
   * Numa nota dividida ao lado do mapa, só com o foco no painel DELA: sem a
   * pergunta, o Ctrl+= no mapa mudaria a letra da nota, e duas notas abertas
   * brigariam pela mesma tecla. No centro, sempre -- a não ser que o foco
   * esteja num painel lateral, que é de outra nota ou de um livro. O painel
   * recebe o foco ao ser clicado -- ver `PainelDeAbas`.
   */
  useEffect(() => {
    function teclas(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

      const foco = document.activeElement;
      const painel = raiz.current?.closest("[data-painel-lateral]");
      const minha = painel
        ? painel.contains(foco)
        : !foco?.closest("[data-painel-lateral]");
      if (!minha) return;

      if (event.key.toLowerCase() === "f" && !event.shiftKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setCru(false);
        setProcura((vez) => (vez ?? 0) + 1);
        return;
      }

      // `+` e `_` são as mesmas teclas com Shift: `event.key` já vem deslocado.
      const passo =
        event.key === "=" || event.key === "+"
          ? 1
          : event.key === "-" || event.key === "_"
            ? -1
            : event.key === "0"
              ? 0
              : null;
      if (passo === null) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      setFonte((atual) =>
        passo === 0
          ? FONTE_PADRAO
          : Math.min(FONTE_MAX, Math.max(FONTE_MIN, atual + passo * FONTE_PASSO)),
      );
    }

    window.addEventListener("keydown", teclas, true);
    return () => window.removeEventListener("keydown", teclas, true);
  }, []);


  const conteudo = texto ?? "";
  const palavras = conteudo.trim() ? conteudo.trim().split(/\s+/).length : 0;
  const linhas = conteudo ? conteudo.split("\n").length : 0;

  const [confirmando, setConfirmando] = useState(false);

  function apagar() {
    fecharNotaEmTodaParte(nota.id);
    removerNota(nota.id);
    void apagarDocumento(nota.arquivo).catch((cause: unknown) => {
      console.error("falha ao apagar a nota", cause);
    });
  }

  return (
    <VinculosContext value={vinculos}>
    <div ref={raiz} className="bg-background flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
        {renomeando ? (
          <input
            autoFocus
            defaultValue={nota.titulo}
            className="bg-card min-w-0 flex-1 rounded px-2 py-0.5 text-lg font-semibold outline-none"
            aria-label="Título da nota"
            onFocus={(event) => event.currentTarget.select()}
            onBlur={(event) => {
              renomearNota(nota.id, event.currentTarget.value);
              setRenomeando(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setRenomeando(false);
              event.stopPropagation();
            }}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-lg font-semibold"
            title="Clique para renomear"
            onClick={() => setRenomeando(true)}
            onKeyDown={aoApertarF2(() => setRenomeando(true))}
          >
            {nota.titulo}
          </button>
        )}
        <span className="text-muted-foreground shrink-0 text-xs">{nota.arquivo}</span>
        {/* Dividir: a nota sai do lugar do palco e vai para um painel ao lado
            do mapa, e o mapa volta. No painel, o mesmo botão a traz de volta
            ao centro. Ver `abrir-nota`. */}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={onde === "centro" ? "Abrir ao lado do mapa" : "Abrir no centro"}
          title={
            onde === "centro"
              ? "Abrir ao lado do mapa, para ler olhando a mesa"
              : "Abrir no centro, no lugar do mapa"
          }
          onClick={() =>
            onde === "centro" ? abrirNotaAoLado(nota.id) : trazerNotaAoCentro(nota.id)
          }
        >
          {onde === "centro" ? <Columns2 /> : <Maximize2 />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Apagar esta nota"
          title="Apaga a nota, o arquivo .md e os cartões dela nos quadros"
          onClick={() => setConfirmando(true)}
        >
          <Trash2 />
        </Button>
        <ConfirmarRemocao
          aberto={confirmando}
          onAberto={setConfirmando}
          titulo={`Deseja apagar ${nota.titulo}?`}
          itens={["O arquivo .md", "Os cartões desta nota nos quadros"]}
          onConfirmar={apagar}
        />
      </div>

      <BarraDeFormatacao
        linha={cru ? null : linhaAtiva}
        desligada={cru || texto === undefined}
        aoAplicar={(acao) => barra.current?.aplicar(acao)}
        esquerda={
          // Recolhido, o Sumário volta por aqui: é onde ele estava, e a barra
          // é a única coisa que sobra naquele canto.
          sumarioRecolhido && entradasDe(conteudo).length > 0 ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Mostrar o sumário"
              title="Mostrar o sumário: os títulos e as listas da nota"
              onClick={() => recolherSumario(false)}
            >
              <PanelLeftOpen />
            </Button>
          ) : null
        }
        direita={
          <Button
            variant={mencoesAbertas ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            aria-pressed={mencoesAbertas}
            title="Quem e o que esta nota cita, e onde"
            onClick={() => setMencoesAbertas((aberto) => !aberto)}
          >
            <AtSign />
            Menções
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1">
        {/* O sumário: a hierarquia do texto -- títulos e itens -- para achar e
            pular. Como o painel de outline do Obsidian. Fica à esquerda, onde
            o olho procura estrutura, e recolhe por seção. */}
        {sumarioRecolhido ? null : (
          <Sumario
            texto={conteudo}
            onIr={(indice) => {
              // Sai do texto cru, se estava nele: o salto é para uma linha viva.
              setCru(false);
              setSalto({ indice, vez: (salto?.vez ?? 0) + 1 });
            }}
            aoRecolher={() => recolherSumario(true)}
          />
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Fora da área que rola: a busca fica no canto enquanto o texto
            passa por baixo dela. */}
        {procura !== null ? (
          <ProcurarNaNota
            alvo={textoDesenhado}
            pedido={procura}
            termoPedido={termoProcurado}
            aoFechar={() => {
              setProcura(null);
              // Sem isto, o próximo Ctrl+F abriria com o nome que a lupa pediu
              // da última vez, e não vazio.
              setTermoProcurado(undefined);
            }}
          />
        ) : null}
        <div
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
          style={{ fontSize: fonte, lineHeight: 1.6 }}
        >
          <div
            ref={textoDesenhado}
            // Selecionável durante a busca: o `select-none` da raiz do app
            // desce até aqui, e o WebKitGTK não pinta destaque nenhum em texto
            // que não se pode selecionar -- a busca achava e contava "1 de 1",
            // e a tela não mostrava nada. Só com a busca aberta, para o resto
            // do editor continuar como era. Ver `ProcurarNaNota`.
            className={cn("mx-auto max-w-3xl", procura !== null && "select-text")}
          >
            {texto === undefined ? (
              <span className="text-muted-foreground italic">Abrindo…</span>
            ) : (
              <EditorAoVivo
                texto={texto}
                candidatos={candidatos}
                salto={salto}
                cru={cru}
                onCru={setCru}
                onChange={(novo) => escrever(nota.arquivo, novo)}
                barra={barra}
                onLinhaAtiva={setLinhaAtiva}
              />
            )}
          </div>
        </div>
        </div>

        {mencoesAbertas ? (
          <PainelDeMencoes
            texto={conteudo}
            vinculos={vinculos}
            aoIrParaLinha={(indice) => {
              setCru(false);
              setSalto({ indice, vez: (salto?.vez ?? 0) + 1 });
            }}
            aoProcurar={(termo) => {
              setCru(false);
              setTermoProcurado((anterior) => ({ valor: termo, vez: (anterior?.vez ?? 0) + 1 }));
              setProcura((vez) => (vez ?? 0) + 1);
            }}
          />
        ) : null}
      </div>

      <div className="text-muted-foreground flex shrink-0 items-center gap-1 border-t px-3 py-1 text-xs">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Diminuir a fonte"
          title="Diminuir a fonte · Ctrl+-"
          disabled={fonte <= FONTE_MIN}
          onClick={() => setFonte((f) => Math.max(FONTE_MIN, f - FONTE_PASSO))}
        >
          <AArrowDown />
        </Button>
        <span className="min-w-6 text-center tabular-nums" title="Ctrl+0 volta ao tamanho padrão">
          {fonte}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Aumentar a fonte"
          title="Aumentar a fonte · Ctrl+="
          disabled={fonte >= FONTE_MAX}
          onClick={() => setFonte((f) => Math.min(FONTE_MAX, f + FONTE_PASSO))}
        >
          <AArrowUp />
        </Button>
        <Button
          variant={cru ? "secondary" : "ghost"}
          size="icon-xs"
          aria-label={cru ? "Voltar à prévia" : "Ver o texto cru"}
          title={cru ? "Voltar à prévia ao vivo (Esc)" : "Texto cru: o arquivo inteiro num campo só (Ctrl+A)"}
          aria-pressed={cru}
          onClick={() => setCru((atual) => !atual)}
        >
          <Code />
        </Button>
        <span className="flex-1 text-right tabular-nums">
          {palavras} palavras · {linhas} linhas
        </span>
      </div>
    </div>
    </VinculosContext>
  );
}

type BotaoDaBarra = {
  acao: AcaoDaBarra;
  icone: LucideIcon;
  rotulo: string;
  /** O que se digita para ter o mesmo sem a barra. É o que o tooltip ensina. */
  regra: string;
  atalho?: string;
};

/** Os botões, em grupos: título, marca de dentro da linha, bloco, e o resto. */
const BOTOES: BotaoDaBarra[][] = [
  [
    { acao: { tipo: "bloco", bloco: "h1" }, icone: Heading1, rotulo: "Título", regra: "# no começo da linha" },
    { acao: { tipo: "bloco", bloco: "h2" }, icone: Heading2, rotulo: "Subtítulo", regra: "## no começo da linha" },
    { acao: { tipo: "bloco", bloco: "h3" }, icone: Heading3, rotulo: "Título menor", regra: "### no começo da linha" },
  ],
  [
    { acao: { tipo: "marca", marca: "negrito" }, icone: Bold, rotulo: "Negrito", regra: "**texto**", atalho: "Ctrl+B" },
    { acao: { tipo: "marca", marca: "italico" }, icone: Italic, rotulo: "Itálico", regra: "*texto*", atalho: "Ctrl+I" },
    { acao: { tipo: "marca", marca: "codigo" }, icone: SquareCode, rotulo: "Código", regra: "`texto`" },
  ],
  [
    { acao: { tipo: "bloco", bloco: "item" }, icone: List, rotulo: "Lista", regra: "- no começo da linha" },
    { acao: { tipo: "bloco", bloco: "numero" }, icone: ListOrdered, rotulo: "Lista numerada", regra: "1. no começo da linha" },
    { acao: { tipo: "bloco", bloco: "tarefa" }, icone: ListTodo, rotulo: "Tarefa", regra: "- [ ] no começo da linha" },
    { acao: { tipo: "bloco", bloco: "citacao" }, icone: TextQuote, rotulo: "Citação", regra: "> no começo da linha" },
  ],
  [
    { acao: { tipo: "link" }, icone: Link, rotulo: "Link", regra: "[texto](endereço)" },
    { acao: { tipo: "regua" }, icone: SeparatorHorizontal, rotulo: "Linha divisória", regra: "--- numa linha sozinha" },
  ],
];

/**
 * A barra de formatação da nota: o Markdown por botão, para quem não sabe as
 * regras de digitação.
 *
 * Ensina enquanto ajuda. O tooltip de cada botão diz o que ele escreve -- a
 * linha ativa mostra o texto cru, e o `**` aparece ali, na frente de quem
 * clicou -- e o botão do bloco acende quando o cursor está numa linha dele.
 *
 * O `mousedown` não passa: o foco fica no campo da linha, e a seleção que o
 * botão vai marcar continua selecionada. Ver `MARCA_BARRA` para o outro lado,
 * o clique fora que larga a linha.
 */
function BarraDeFormatacao({
  linha,
  desligada,
  aoAplicar,
  esquerda,
  direita,
}: {
  linha: string | null;
  desligada: boolean;
  aoAplicar: (acao: AcaoDaBarra) => void;
  /** O que abre a barra pela esquerda, antes da formatação: o Sumário recolhido. */
  esquerda?: ReactNode;
  /** O que fica na ponta direita da barra, fora da formatação: o painel de menções. */
  direita?: ReactNode;
}) {
  const atual = linha === null ? null : prefixoDe(linha).tipo;

  return (
    <div
      {...{ [MARCA_BARRA]: "" }}
      role="toolbar"
      aria-label="Formatação"
      title={desligada ? "No texto cru o Markdown é digitado. Esc volta à prévia." : undefined}
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-b px-3 py-1"
      onMouseDown={(event) => event.preventDefault()}
    >
      {esquerda ? (
        <div className="flex items-center gap-0.5">
          {esquerda}
          <span className="bg-border mx-1 h-4 w-px" aria-hidden />
        </div>
      ) : null}
      {BOTOES.map((grupo, indice) => (
        <div key={indice} className="flex items-center gap-0.5">
          {indice > 0 ? <span className="bg-border mx-1 h-4 w-px" aria-hidden /> : null}
          {grupo.map(({ acao, icone: Icone, rotulo, regra, atalho }) => {
            const ligado = acao.tipo === "bloco" && atual === acao.bloco;
            return (
              <Button
                key={rotulo}
                variant={ligado ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label={rotulo}
                aria-pressed={acao.tipo === "bloco" ? ligado : undefined}
                title={[rotulo, atalho, regra].filter(Boolean).join(" · ")}
                disabled={desligada}
                onClick={() => aoAplicar(acao)}
              >
                <Icone />
              </Button>
            );
          })}
        </div>
      ))}
      {direita ? <div className="ml-auto flex items-center">{direita}</div> : null}
    </div>
  );
}

type Entrada = {
  indice: number;
  /** 1 a 3 para título; 4 para item de lista, que fica sob o título mais próximo. */
  nivel: number;
  texto: string;
  titulo: boolean;
};

/** As linhas que contam para o sumário: títulos e itens de lista. */
function entradasDe(texto: string): Entrada[] {
  const saida: Entrada[] = [];
  texto.split("\n").forEach((linha, indice) => {
    const b = bloco(linha);
    if (b.tipo === "titulo")
      saida.push({ indice, nivel: b.nivel, texto: b.conteudo, titulo: true });
    else if (b.tipo === "item" || b.tipo === "tarefa" || b.tipo === "numero")
      saida.push({ indice, nivel: 4, texto: b.conteudo, titulo: false });
  });
  return saida;
}

/**
 * O sumário da nota: títulos por nível e os itens de lista sob cada um. Clique
 * leva à linha; a seta recolhe a seção -- tudo que vem depois do título até
 * outro do mesmo nível ou acima. É a forma de achar num texto de três telas.
 */
/** Onde a máquina lembra se o Sumário fica recolhido. */
const CHAVE_SUMARIO = "ato20:nota-sumario-recolhido";

function lerSumarioRecolhido(): boolean {
  try {
    return localStorage.getItem(CHAVE_SUMARIO) === "1";
  } catch {
    return false;
  }
}

function Sumario({
  texto,
  onIr,
  aoRecolher,
}: {
  texto: string;
  onIr: (indice: number) => void;
  aoRecolher: () => void;
}) {
  const entradas = entradasDe(texto);
  const [recolhidos, setRecolhidos] = useState<Set<number>>(() => new Set());

  if (entradas.length === 0) return null;

  // Visíveis: fora de qualquer seção recolhida. Uma seção vai do título até o
  // próximo título de nível igual ou menor.
  const visiveis: Array<Entrada & { temFilhos: boolean }> = [];
  let escondendoAte: number | null = null; // nível do título recolhido
  for (const [i, entrada] of entradas.entries()) {
    if (escondendoAte !== null) {
      if (entrada.titulo && entrada.nivel <= escondendoAte) escondendoAte = null;
      else continue;
    }
    const proxima = entradas[i + 1];
    const temFilhos =
      entrada.titulo && !!proxima && (!proxima.titulo || proxima.nivel > entrada.nivel);
    visiveis.push({ ...entrada, temFilhos });
    if (entrada.titulo && recolhidos.has(entrada.indice)) escondendoAte = entrada.nivel;
  }

  function alternar(indice: number) {
    setRecolhidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(indice)) proximo.delete(indice);
      else proximo.add(indice);
      return proximo;
    });
  }

  return (
    <nav
      aria-label="Sumário da nota"
      className="bg-background/60 w-56 shrink-0 overflow-y-auto border-r px-2 pt-1.5 pb-3 text-xs"
    >
      <div className="mb-1 flex items-center gap-1 pl-1">
        <span className="text-muted-foreground flex-1 text-[11px] font-medium tracking-wide uppercase">
          Sumário
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Recolher o sumário"
          title="Recolher o sumário: a nota ganha a largura toda"
          onClick={aoRecolher}
        >
          <PanelLeftClose />
        </Button>
      </div>
      <ul className="space-y-0.5">
        {visiveis.map((entrada) => (
          <li
            key={entrada.indice}
            className="flex items-center gap-0.5"
            style={{ paddingLeft: (entrada.nivel - 1) * 10 }}
          >
            {entrada.temFilhos ? (
              <button
                type="button"
                aria-label={recolhidos.has(entrada.indice) ? "Abrir a seção" : "Recolher a seção"}
                aria-expanded={!recolhidos.has(entrada.indice)}
                className="text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => alternar(entrada.indice)}
              >
                {recolhidos.has(entrada.indice) ? (
                  <ChevronRight className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
              </button>
            ) : (
              <span className="size-3 shrink-0" aria-hidden />
            )}
            <button
              type="button"
              className={cn(
                "hover:bg-accent min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left",
                entrada.titulo ? "font-medium" : "text-muted-foreground",
                entrada.nivel === 1 && "text-sm",
              )}
              title={entrada.texto}
              onClick={() => onIr(entrada.indice)}
            >
              {entrada.titulo ? entrada.texto : `• ${entrada.texto}`}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * O editor de prévia ao vivo: uma linha crua, as outras desenhadas.
 *
 * O texto é UMA string, e a linha ativa é um índice nela. Cada tecla reescreve
 * a string inteira -- é o que mantém o texto uma coisa só para o arquivo e
 * para a mesa --, e um documento de mestre cabe nisso com folga.
 *
 * As teclas que atravessam linhas são as de qualquer editor: Enter divide a
 * linha no cursor, Backspace no começo junta com a de cima, Delete no fim junta
 * com a de baixo, seta para cima na primeira linha do campo sobe, seta para
 * baixo na última desce. Esc larga o cursor e desenha tudo.
 */
/**
 * A linha em edição: onde, e o cursor nela -- `fim` é o outro lado da seleção.
 * `para trás` é a seleção feita de baixo para cima: o lado que ANDA com o
 * Shift é o `cursor`, e não o `fim`.
 */
type Ativa = { indice: number; cursor: number; fim?: number; paraTras?: boolean };

/** O que um botão da barra de formatação pede ao editor. */
export type AcaoDaBarra =
  | { tipo: "bloco"; bloco: BlocoDaBarra }
  | { tipo: "marca"; marca: MarcaDaBarra }
  | { tipo: "link" }
  | { tipo: "regua" };

/** O editor visto pela barra: ela manda, ele sabe onde está o cursor. */
export type BarraDoEditor = { aplicar: (acao: AcaoDaBarra) => void };

/** O que marca a barra no DOM, para o clique nela não contar como clique fora. */
export const MARCA_BARRA = "data-barra-do-editor";

export function EditorAoVivo({
  texto,
  candidatos,
  salto,
  cru = false,
  onCru,
  onChange,
  barra,
  onLinhaAtiva,
}: {
  texto: string;
  /** O que `@`, `/` e `>` podem completar. Ausente = sem lista. */
  candidatos?: Record<SinalDoPostit, Sugestao[]>;
  /** Pedido de ativar uma linha, vindo de fora (o sumário). */
  salto?: { indice: number; vez: number } | null;
  /**
   * Texto CRU: o arquivo inteiro num `<textarea>` só, sem prévia. É o modo
   * do Ctrl+A -- selecionar tudo não tem sentido linha a linha -- e de quem
   * quer colar um bloco grande ou ver o Markdown como está no disco.
   */
  cru?: boolean;
  onCru?: (cru: boolean) => void;
  onChange: (texto: string) => void;
  /** Por onde a barra de formatação manda. Ver `aplicarDaBarra`. */
  barra?: Ref<BarraDoEditor>;
  /** A linha sob o cursor, crua, ou `null`: é o que acende o botão do bloco dela. */
  onLinhaAtiva?: (linha: string | null) => void;
}) {
  const linhas = texto.split("\n");

  /**
   * A linha em edição e o cursor nela. `fim` é o outro lado de uma SELEÇÃO: a
   * que o mestre arrastou no texto desenhado, a que a barra deixa marcada.
   */
  const [ativa, setAtiva] = useState<Ativa | null>(null);
  /**
   * O TRECHO aberto: quando o mestre arrasta por várias linhas desenhadas, elas
   * viram um campo só, da ativa até `ate`, com o texto cru e a seleção onde ele
   * arrastou. É o que deixa apagar, recortar ou recuar várias linhas no modo
   * formatado, como se faz em qualquer editor.
   *
   * Guardado à parte e AMARRADO ao objeto da ativa (`de`): crescer o trecho a
   * cada Enter não pode trocar a ativa, porque trocar a ativa repõe o cursor --
   * e repor o cursor no meio de uma tecla mata o acento morto (ver o efeito de
   * foco). Qualquer outra troca de linha cria uma ativa nova, e o trecho some
   * sozinho, sem ninguém ter de lembrar de fechá-lo.
   */
  const [regiao, setRegiao] = useState<{ de: Ativa; ate: number } | null>(null);
  const ate =
    ativa && regiao && regiao.de === ativa
      ? Math.min(Math.max(regiao.ate, ativa.indice), linhas.length - 1)
      : (ativa?.indice ?? -1);
  const noTrecho = ativa !== null && ate > ativa.indice;
  const campo = useRef<HTMLTextAreaElement | null>(null);
  // O cursor no DOCUMENTO, e não na linha: é o que o desfazer guarda, porque
  // a linha em que ele estava pode nem existir depois de voltar um passo.
  const historico = useHistoricoDeTexto(
    texto,
    ativa ? deslocamentoDe(texto, ativa.indice, ativa.cursor) : texto.length,
  );
  const caixa = useRef<HTMLDivElement | null>(null);

  // O sumário pediu uma linha: ativa e leva o cursor ao começo dela. Estado
  // derivado da prop, ajustado no render como o React recomenda -- e não num
  // efeito, que faria um render a mais com a linha errada. `vez` faz dois
  // cliques na mesma linha valerem os dois.
  const [saltoAtendido, setSaltoAtendido] = useState<number | null>(null);
  if (salto && salto.vez !== saltoAtendido) {
    setSaltoAtendido(salto.vez);
    setAtiva({ indice: Math.min(salto.indice, linhas.length - 1), cursor: 0 });
  }

  // A linha ativa entra na vista quando o salto veio de fora -- UMA vez por
  // salto. O pedido fica guardado depois de atendido, e sem conferir a `vez`
  // toda troca de linha seguinte centralizava a tela: um clique no Sumário, e
  // dali em diante cada Enter pulava a página para o meio.
  const centrou = useRef<number | null>(null);
  useEffect(() => {
    if (!salto || centrou.current === salto.vez) return;
    centrou.current = salto.vez;
    campo.current?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- acompanha o salto
  }, [ativa, salto?.vez]);

  /**
   * Onde o cursor está dentro da linha ativa, em estado: é ele que decide se a
   * lista de sugestão aparece. Mesmo desenho do postit -- ver `PostitPapel`.
   */
  const [cursor, setCursor] = useState(0);
  const [indice, setIndice] = useState(0);
  /** O `inicio` do fragmento que o mestre dispensou com Esc. */
  const [dispensadoEm, setDispensadoEm] = useState<number | null>(null);
  /** A marca de largura zero no cursor, no espelho, para a lista se pendurar. */
  const marca = useRef<HTMLSpanElement | null>(null);

  const linhaAtiva = ativa ? linhas.slice(ativa.indice, ate + 1).join("\n") : "";
  const fragmento =
    ativa && candidatos ? fragmentoDoPostit(linhaAtiva, cursor) : null;
  const sugestoes =
    fragmento && candidatos && fragmento.inicio !== dispensadoEm
      ? filtraSugestoes(candidatos[fragmento.sinal], fragmento.prefixo, normaliza)
      : [];
  const escolhido = Math.min(indice, Math.max(sugestoes.length - 1, 0));
  const fantasma =
    fragmento && sugestoes.length > 0
      ? fantasmaDe(
          sugestoes[escolhido]!.nome,
          fragmento.prefixo,
          linhaAtiva[cursor],
          normaliza,
        )
      : "";

  function aplicar(nome: string) {
    if (!ativa || !fragmento) return;
    const resultado = aplicaSugestao(linhaAtiva, fragmento, cursor, nome);
    setIndice(0);
    setCursor(resultado.cursor);
    // Ativa nova: é o que faz o efeito de foco repor o cursor depois do nome.
    reescrever(resultado.texto, resultado.cursor);
  }

  /**
   * Clique fora do editor larga a linha. Na captura e no documento, como o
   * postit: o `blur` sozinho não vem quando o clique cai no palco, que não
   * toma foco -- e o mestre ficava com a linha crua aberta depois de clicar
   * no vazio.
   */
  useEffect(() => {
    if (!ativa) return;
    function foraDaqui(event: PointerEvent) {
      const alvo = event.target;
      if (alvo instanceof Node && caixa.current?.contains(alvo)) return;
      // A lista de sugestões mora num portal no `body`: escolher nela é parte
      // de escrever, e não clique fora. A barra de formatação também: ela age
      // na linha ativa, e largá-la no clique deixaria o botão sem linha.
      if (alvo instanceof Element && alvo.closest(`[${MARCA_LISTA}]`)) return;
      if (alvo instanceof Element && alvo.closest(`[${MARCA_BARRA}]`)) return;
      setAtiva(null);
    }
    document.addEventListener("pointerdown", foraDaqui, true);
    return () => document.removeEventListener("pointerdown", foraDaqui, true);
  }, [ativa]);

  // Foco e cursor SÓ quando o campo troca de linha, e nunca a cada tecla: o
  // `<textarea>` é um só e muda de valor, então o cursor tem de ser reposto na
  // troca -- mas repô-lo a cada mudança de texto matava o acento morto. O
  // `´` seguido de `a` compõe `á` dentro do campo, e um `setSelectionRange`
  // no meio da composição a cancela: saía `´a`.
  useLayoutEffect(() => {
    if (!ativa) return;
    const alvo = campo.current;
    if (!alvo) return;
    alvo.focus();
    const pos = Math.min(ativa.cursor, alvo.value.length);
    alvo.setSelectionRange(
      pos,
      Math.min(Math.max(ativa.fim ?? pos, pos), alvo.value.length),
      ativa.paraTras ? "backward" : "forward",
    );
    setCursor(pos);
    setIndice(0);
    setDispensadoEm(null);
  }, [ativa]);

  // A altura acompanha o texto: a linha dobra na largura do cartão.
  useLayoutEffect(() => {
    const alvo = campo.current;
    if (!alvo) return;
    alvo.style.height = "0px";
    alvo.style.height = `${alvo.scrollHeight}px`;
  }, [ativa, texto]);

  // O cursor à vista enquanto se escreve: Enter na última linha da tela, ou a
  // linha que dobra para baixo, e a área rola junto. A marca do espelho É o
  // cursor -- a mesma de onde a lista de sugestões se pendura.
  useLayoutEffect(() => {
    const alvo = marca.current;
    if (!ativa || !alvo) return;
    const { top } = alvo.getBoundingClientRect();
    trazerParaAVista(alvo, top, top);
  }, [ativa, texto, cursor]);

  /**
   * Troca o texto da linha -- ou do TRECHO, se é a ativa que muda. O valor pode
   * ter quebras: Enter dentro do trecho, várias linhas coladas numa linha só.
   * Elas viram linhas, e a ativa passa a cobrir todas, sem trocar de objeto.
   */
  function trocar(indice: number, valor: string) {
    const proximas = [...linhas];
    const daAtiva = ativa !== null && indice === ativa.indice;
    const novas = valor.split("\n");
    proximas.splice(indice, daAtiva ? ate - indice + 1 : 1, ...novas);
    onChange(proximas.join("\n"));
    if (daAtiva) setRegiao(novas.length > 1 ? { de: ativa, ate: indice + novas.length - 1 } : null);
  }

  /**
   * Troca o texto da ativa E leva o cursor para outro lugar: a sugestão
   * escolhida, o Tab, a barra. Ativa nova, para o efeito de foco repor a
   * seleção, e o trecho acompanhando quantas linhas o texto novo tem.
   */
  function reescrever(valor: string, novoCursor: number, novoFim?: number) {
    if (!ativa) return;
    const proximas = [...linhas];
    const novas = valor.split("\n");
    proximas.splice(ativa.indice, ate - ativa.indice + 1, ...novas);
    onChange(proximas.join("\n"));
    const nova: Ativa = {
      indice: ativa.indice,
      cursor: novoCursor,
      ...(novoFim === undefined ? {} : { fim: novoFim }),
    };
    setAtiva(nova);
    setRegiao(novas.length > 1 ? { de: nova, ate: ativa.indice + novas.length - 1 } : null);
  }

  /**
   * O botão da barra, na linha ativa e na seleção dela.
   *
   * Sem linha ativa, age numa linha NOVA no fim -- ou na última, se ela estiver
   * vazia --, e a ativa: clicar "Título" numa nota vazia começa um título, em
   * vez de não fazer nada ou reformatar o parágrafo que alguém escreveu por
   * último.
   */
  function aplicarDaBarra(acao: AcaoDaBarra) {
    const alvo = campo.current;
    const proximas = [...linhas];
    let indice: number;
    let linha: string;
    let inicio: number;
    let fim: number;

    if (ativa && alvo) {
      indice = ativa.indice;
      linha = alvo.value;
      inicio = alvo.selectionStart;
      fim = alvo.selectionEnd;
    } else {
      const ultima = proximas.length - 1;
      indice = proximas[ultima] === "" ? ultima : proximas.length;
      if (indice === proximas.length) proximas.push("");
      linha = "";
      inicio = 0;
      fim = 0;
    }

    // No trecho de várias linhas, cada botão age linha a linha -- ver
    // `aplicarNoTrecho`.
    if (noTrecho) {
      aplicarNoTrecho(acao, linha, inicio, fim);
      return;
    }

    if (acao.tipo === "regua") {
      // Linha vazia antes da régua quando a de cima tem texto: em Markdown,
      // `texto` seguido de `---` é um TÍTULO, e o arquivo também é lido fora
      // daqui. O cursor vai para a linha nova depois dela.
      const vazia = linha.trim() === "";
      const entra = vazia ? ["---", ""] : [linha, "", "---", ""];
      proximas.splice(indice, 1, ...entra);
      onChange(proximas.join("\n"));
      setAtiva({ indice: indice + entra.length - 1, cursor: 0 });
      return;
    }

    if (acao.tipo === "bloco") {
      const feito = comBloco(linha, acao.bloco, proximas[indice - 1]);
      proximas[indice] = feito.linha;
      onChange(proximas.join("\n"));
      setAtiva({
        indice,
        cursor: cursorDepoisDoBloco(inicio, feito.antes, feito.depois),
        fim: cursorDepoisDoBloco(fim, feito.antes, feito.depois),
      });
      return;
    }

    const feito =
      acao.tipo === "marca" ? comMarca(linha, inicio, fim, acao.marca) : comLink(linha, inicio, fim);
    proximas[indice] = feito.linha;
    onChange(proximas.join("\n"));
    setAtiva({ indice, cursor: feito.inicio, fim: feito.fim });
  }

  /**
   * Abre o trecho `[de, ate]` com a seleção da âncora ao foco, que podem vir em
   * qualquer ordem: de baixo para cima, a seleção é PARA TRÁS, e o Shift
   * seguinte continua andando pelo lado certo.
   */
  function estenderSelecao(de: number, ate: number, ancora: number, foco: number) {
    const nova: Ativa =
      ancora <= foco
        ? { indice: de, cursor: ancora, fim: foco }
        : { indice: de, cursor: foco, fim: ancora, paraTras: true };
    setAtiva(nova);
    setRegiao(ate > de ? { de: nova, ate } : null);
  }

  /**
   * A barra no trecho aberto. Bloco é de LINHA, então vai em cada uma: título
   * em três linhas são três títulos, e se todas já eram, o botão tira de
   * todas. Negrito e itálico não atravessam a quebra, então cada linha marca
   * o pedaço dela que está na seleção. O link é de um lugar só, e só age com a
   * seleção numa linha. A régua entra depois do trecho.
   */
  function aplicarNoTrecho(acao: AcaoDaBarra, texto: string, inicio: number, fim: number) {
    if (!ativa) return;
    const partes = texto.split("\n");

    if (acao.tipo === "regua") {
      const proximas = [...linhas];
      proximas.splice(ate + 1, 0, "", "---", "");
      onChange(proximas.join("\n"));
      setAtiva({ indice: ate + 3, cursor: 0 });
      return;
    }

    if (acao.tipo === "bloco") {
      const todas = partes.every(
        (parte) => parte.trim() === "" || prefixoDe(parte).tipo === acao.bloco,
      );
      const novas: string[] = [];
      partes.forEach((parte, indice) => {
        const anterior = indice === 0 ? linhas[ativa.indice - 1] : novas[indice - 1];
        // Linha vazia fica vazia: um trecho com um parágrafo em branco no meio
        // não ganha um marcador de lista solto.
        const muda = parte.trim() !== "" && (todas || prefixoDe(parte).tipo !== acao.bloco);
        novas.push(muda ? comBloco(parte, acao.bloco, anterior).linha : parte);
      });
      const valor = novas.join("\n");
      reescrever(valor, 0, valor.length);
      return;
    }

    const atravessa = texto.slice(inicio, fim).includes("\n");

    if (acao.tipo === "link") {
      if (atravessa) return;
      const feito = comLink(texto, inicio, fim);
      reescrever(feito.linha, feito.inicio, feito.fim);
      return;
    }

    if (!atravessa) {
      const feito = comMarca(texto, inicio, fim, acao.marca);
      reescrever(feito.linha, feito.inicio, feito.fim);
      return;
    }

    let comeco = 0;
    const novas = partes.map((parte) => {
      const de = Math.max(inicio - comeco, 0);
      const final = Math.min(fim - comeco, parte.length);
      comeco += parte.length + 1;
      if (final <= de || parte.slice(de, final).trim() === "") return parte;
      return comMarca(parte, de, final, acao.marca).linha;
    });
    const valor = novas.join("\n");
    reescrever(valor, inicio, fim + valor.length - texto.length);
  }

  useImperativeHandle(barra, () => ({ aplicar: aplicarDaBarra }));

  // A barra acende o botão do bloco em que o cursor está.
  const linhaSobOCursor = ativa ? (linhas[ativa.indice] ?? "") : null;
  useEffect(() => {
    onLinhaAtiva?.(linhaSobOCursor);
  }, [linhaSobOCursor, onLinhaAtiva]);

  function teclas(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!ativa) return;

    // Ctrl+Z / Ctrl+Y: o texto inteiro volta um passo, e o cursor vai para a
    // linha em que estava. Ver `useHistoricoDeTexto`.
    const volta = historico.tratarTecla(event);
    if (volta !== false) {
      if (volta) {
        onChange(volta.texto);
        setAtiva(posicaoDe(volta.texto, volta.cursor));
      }
      return;
    }

    const alvo = event.currentTarget;
    const { selectionStart, selectionEnd, value } = alvo;
    const indice = ativa.indice;

    const lista = sugestoes.length > 0;

    // Ctrl+B e Ctrl+I, os da barra: o tooltip dela ensina, e quem aprendeu
    // pelo botão continua pelo teclado.
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      const marca = ({ b: "negrito", i: "italico" } as const)[event.key.toLowerCase() as "b" | "i"];
      if (marca) {
        event.preventDefault();
        event.stopPropagation();
        aplicarDaBarra({ tipo: "marca", marca });
        return;
      }
    }

    // Ctrl+A: selecionar tudo é o documento, não a linha. Vai para o texto
    // cru, que é um campo só, já com tudo selecionado.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      event.stopPropagation();
      setAtiva(null);
      onCru?.(true);
      return;
    }

    // Tab e seta-direita confirmam o fantasma, como no VS Code.
    if (fantasma && event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      aplicar(sugestoes[escolhido]!.nome);
      return;
    }

    // Com a lista aberta, as setas andam nela, e Enter e Tab escolhem.
    if (lista && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      event.stopPropagation();
      const passo = event.key === "ArrowDown" ? 1 : -1;
      setIndice((atual) => {
        const proximo = (Math.min(atual, sugestoes.length - 1) + passo) % sugestoes.length;
        return proximo < 0 ? sugestoes.length - 1 : proximo;
      });
      return;
    }
    if (lista && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      event.stopPropagation();
      aplicar(sugestoes[escolhido]!.nome);
      return;
    }

    // Tab recua a linha, Shift+Tab desfaz: numa lista, o recuo é o
    // aninhamento do item. Depois da lista de sugestões, que tem o Tab quando
    // está aberta. E sempre barrado: o Tab do navegador tiraria o foco da
    // nota no meio da frase. Esc é a saída do teclado.
    if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      const feito = comRecuo(value, selectionStart, selectionEnd, event.shiftKey ? -1 : 1);
      if (feito.texto === value) return;
      setCursor(feito.inicio);
      reescrever(feito.texto, feito.inicio, feito.fim);
      return;
    }

    // Shift com as setas estende a seleção. Dentro do campo, é o do próprio
    // campo; na borda dele, a seleção atravessa para a linha vizinha, que
    // entra no trecho -- sem isto a seta pulava de linha e a seleção sumia.
    if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const paraTras = alvo.selectionDirection === "backward";
      const ancora = paraTras ? selectionEnd : selectionStart;
      const foco = paraTras ? selectionStart : selectionEnd;
      const noTopo = !value.slice(0, foco).includes("\n");
      const noFundo = !value.slice(foco).includes("\n");
      const umaSo = linhasVisuais(alvo) <= 1;

      const subir =
        indice > 0 &&
        ((event.key === "ArrowUp" && noTopo && (umaSo || foco === 0)) ||
          (event.key === "ArrowLeft" && foco === 0));
      const descer =
        ate < linhas.length - 1 &&
        ((event.key === "ArrowDown" && noFundo && (umaSo || foco === value.length)) ||
          (event.key === "ArrowRight" && foco === value.length));

      if (subir) {
        event.preventDefault();
        event.stopPropagation();
        const acima = linhas[indice - 1] ?? "";
        const novoFoco = event.key === "ArrowLeft" ? acima.length : Math.min(foco, acima.length);
        estenderSelecao(indice - 1, ate, ancora + acima.length + 1, novoFoco);
        return;
      }
      if (descer) {
        event.preventDefault();
        event.stopPropagation();
        const abaixo = linhas[ate + 1] ?? "";
        const coluna = foco - (value.lastIndexOf("\n", foco - 1) + 1);
        const novoFoco =
          value.length + 1 + (event.key === "ArrowRight" ? 0 : Math.min(coluna, abaixo.length));
        estenderSelecao(indice, ate + 1, ancora, novoFoco);
        return;
      }
    }

    // No trecho aberto, o Enter é o do campo: quebra a linha ali mesmo, e o
    // trecho cresce com ela (ver `trocar`). A continuação de lista é de uma
    // linha só, e dividir o trecho em dois deixaria metade dele fechada.
    if (noTrecho && event.key === "Enter") {
      event.stopPropagation();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      // Primeiro Esc fecha a lista, segundo larga a linha.
      if (lista && fragmento) setDispensadoEm(fragmento.inicio);
      else setAtiva(null);
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const antes = value.slice(0, selectionStart);
      const depois = value.slice(selectionEnd);
      // Continua a lista: Enter no fim de um item começa outro; num item vazio,
      // sai da lista. É o gesto que todo editor de Markdown faz. Texto recuado
      // continua recuado pela mesma regra -- o recuo é a marca --, e Enter numa
      // linha que só tem o recuo o tira.
      const marca =
        /^(\s*(?:[-*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+))/.exec(antes)?.[1] ??
        /^[\t ]*/.exec(antes)?.[0] ??
        "";
      const vazio = marca !== "" && antes.trim() === marca.trim();
      const proximas = [...linhas];
      if (vazio) {
        proximas.splice(indice, 1, "", depois);
        onChange(proximas.join("\n"));
        setAtiva({ indice: indice + 1, cursor: 0 });
        return;
      }
      const continuacao = marca.replace(/\[[xX]\]/, "[ ]").replace(/^(\s*)(\d+)/, (_, s: string, n: string) => `${s}${Number(n) + 1}`);
      proximas.splice(indice, 1, antes, continuacao + depois);
      onChange(proximas.join("\n"));
      setAtiva({ indice: indice + 1, cursor: continuacao.length });
    } else if (event.key === "Backspace" && selectionStart === 0 && selectionEnd === 0 && indice > 0) {
      event.preventDefault();
      // A linha de cima junta com a ativa -- ou com o trecho inteiro, que
      // continua aberto, agora começando nela.
      const anterior = linhas[indice - 1] ?? "";
      const proximas = [...linhas];
      proximas.splice(indice - 1, 1 + ate - indice + 1, anterior + value);
      onChange(proximas.join("\n"));
      const nova: Ativa = { indice: indice - 1, cursor: anterior.length };
      setAtiva(nova);
      if (noTrecho) setRegiao({ de: nova, ate: ate - 1 });
    } else if (
      event.key === "Delete" &&
      selectionStart === value.length &&
      selectionEnd === value.length &&
      ate < linhas.length - 1
    ) {
      event.preventDefault();
      const proxima = linhas[ate + 1] ?? "";
      const proximas = [...linhas];
      proximas.splice(indice, ate - indice + 2, value + proxima);
      onChange(proximas.join("\n"));
      const nova: Ativa = { indice, cursor: value.length };
      setAtiva(nova);
      if (noTrecho) setRegiao({ de: nova, ate });
    } else if (event.key === "ArrowUp" && indice > 0 && naPrimeiraLinhaVisual(alvo)) {
      event.preventDefault();
      setAtiva({ indice: indice - 1, cursor: selectionStart });
    } else if (
      event.key === "ArrowDown" &&
      ate < linhas.length - 1 &&
      naUltimaLinhaVisual(alvo)
    ) {
      event.preventDefault();
      setAtiva({ indice: ate + 1, cursor: noTrecho ? 0 : selectionStart });
    }
    // Ctrl+Z e os outros atalhos do palco não chegam aqui: `isTyping` os barra.
    event.stopPropagation();
  }

  /**
   * O que cai de outro painel vira menção: imagem ou arquivo da Biblioteca
   * vira `/nome`, personagem vira `@nome`, mapa vira `>nome`. Entra no fim da
   * linha sob o cursor, ou numa linha nova no fim quando cai no vazio. É a
   * mesma convenção do postit, sem digitar o sinal: arrastar É apontar.
   */
  const sobreNota = useTokenDragStore((state) => state.arrasto?.destino?.tipo === "nota");
  const textoRef = useRef(texto);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    textoRef.current = texto;
    onChangeRef.current = onChange;
  });
  useEffect(
    () =>
      useTokenDragStore.getState().registrarAlvo("nota", (solto, destino) => {
        if (destino.tipo !== "nota") return;
        const mencao = mencaoDe(solto.fonte);
        if (!mencao) return;

        const atuais = textoRef.current.split("\n");
        const sob = document
          .elementFromPoint(solto.x, solto.y)
          ?.closest<HTMLElement>("[data-linha]");
        const indice = sob ? Number(sob.dataset.linha) : -1;

        if (indice >= 0 && indice < atuais.length) {
          const linha = atuais[indice] ?? "";
          const separador = linha === "" || /\s$/.test(linha) ? "" : " ";
          atuais[indice] = `${linha}${separador}${mencao}`;
          onChangeRef.current(atuais.join("\n"));
          setAtiva({ indice, cursor: atuais[indice]!.length });
          return;
        }

        // No vazio: linha nova no fim, e o cursor logo depois da menção.
        const base = textoRef.current === "" ? [] : atuais;
        onChangeRef.current([...base, mencao].join("\n"));
        setAtiva({ indice: base.length, cursor: mencao.length });
      }),
    [],
  );

  /**
   * O clique e o arrasto no texto DESENHADO.
   *
   * Arrastar por cima das linhas formatadas seleciona como numa página, e ao
   * soltar a seleção é traduzida para o cru (`pontoNoCru`): numa linha só, a
   * linha abre com a seleção onde estava; em várias, elas abrem como um TRECHO
   * -- um campo só, com o texto cru delas e a seleção exata. O clique simples é
   * a seleção de tamanho zero, e é por aqui que o cursor cai onde se clicou.
   *
   * No `mouseup` do documento, e não da caixa: o arrasto termina onde a mão
   * parar, e ela pode parar fora da nota.
   */
  const armado = useRef(false);
  const ancoraDoShift = useRef<PontoNoCru | null>(null);
  useEffect(() => {
    function soltarNoDesenhado(event: MouseEvent) {
      if (!armado.current) return;
      armado.current = false;
      const raiz = caixa.current;
      if (!raiz) return;

      const atuais = textoRef.current.split("\n");
      const selecao = window.getSelection();
      const a =
        selecao?.anchorNode ? pontoNoCru(selecao.anchorNode, selecao.anchorOffset, raiz, atuais) : null;
      const f =
        selecao?.focusNode ? pontoNoCru(selecao.focusNode, selecao.focusOffset, raiz, atuais) : null;

      const ancora = ancoraDoShift.current ?? a;
      ancoraDoShift.current = null;
      if (ancora && f) {
        selecao?.removeAllRanges();
        abrirTrecho(ancora, f, atuais);
        return;
      }

      // Sem ponto no desenhado: o clique caiu abaixo da última linha, e o
      // cursor vai para o fim do documento.
      if (event.target === raiz) {
        const ultima = atuais.length - 1;
        setAtiva({ indice: ultima, cursor: (atuais[ultima] ?? "").length });
      }
    }

    function abrirTrecho(a: PontoNoCru, f: PontoNoCru, atuais: string[]) {
      // Arrastar para cima dá o foco antes da âncora: o trecho vai do menor ao
      // maior, e a seleção cobre o mesmo pedaço.
      const [de, para] =
        a.indice < f.indice || (a.indice === f.indice && a.cru <= f.cru) ? [a, f] : [f, a];
      let fim = para.cru;
      for (let indice = de.indice; indice < para.indice; indice += 1)
        fim += (atuais[indice] ?? "").length + 1;

      // Âncora depois do foco: a seleção é para trás, e o Shift+seta que vier
      // depois anda pelo lado do foco, como a mão espera.
      const nova: Ativa = { indice: de.indice, cursor: de.cru, fim, ...(de === f && f !== a ? { paraTras: true } : {}) };
      setAtiva(nova);
      setRegiao(para.indice > de.indice ? { de: nova, ate: para.indice } : null);
    }

    document.addEventListener("mouseup", soltarNoDesenhado);
    return () => document.removeEventListener("mouseup", soltarNoDesenhado);
  }, []);

  if (cru)
    return (
      <TextoCru
        texto={texto}
        onChange={onChange}
        onSair={() => onCru?.(false)}
      />
    );

  const vazio = texto.trim() === "";

  return (
    <div
      ref={caixa}
      data-nota-editor=""
      className={cn(
        "min-h-full cursor-text rounded-md",
        // Acende enquanto algo arrastado está por cima: é o que diz "solte aqui".
        sobreNota && "ring-primary/60 bg-primary/5 ring-2",
      )}
      // O gesto começa no desenhado; quem decide o que ele foi é o soltar. Ver
      // `soltarNoDesenhado`. Botão, link, alça e o próprio campo cuidam do seu.
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        const alvo = event.target instanceof Element ? event.target : null;
        if (alvo?.closest("textarea, input, button, a, [role=separator]")) return;
        armado.current = true;
        // Shift+clique estende a seleção da linha aberta até o clique: a
        // âncora é a dela, lida antes de o clique tirar o foco do campo.
        const aberto = campo.current;
        ancoraDoShift.current =
          event.shiftKey && ativa && aberto
            ? pontoDaAncora(ativa.indice, aberto)
            : null;
      }}
    >
      <PosicoesDoCruContext value={true}>
      {/* Nota vazia sem linha ativa: a dica de onde clicar. Uma folha preta
          sem nada não diz que é um editor. */}
      {vazio && !ativa ? (
        <p className="text-muted-foreground pointer-events-none absolute italic">
          Clique aqui e comece a escrever. # título, - lista, @personagem…
        </p>
      ) : null}
      {linhas.map((linha, indice) =>
        ativa?.indice === indice ? (
          <div key="ativa">
            <div className="relative">
              {/* O espelho: o mesmo texto com a mesma tipografia, com uma marca
                  de largura zero no cursor -- é dela que a lista se pendura -- e o
                  nome fantasma em cinza depois dele. O campo, transparente,
                  fica por cima. Ver o mesmo desenho no postit. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 font-mono text-[0.95em] [tab-size:4] break-words whitespace-pre-wrap"
              >
                <span className="invisible">{linhaAtiva.slice(0, cursor)}</span>
                <span ref={marca} className="inline-block w-0" />
                {fantasma ? <span className="text-muted-foreground/60">{fantasma}</span> : null}
              </div>
              <textarea
                ref={campo}
                rows={1}
                value={linhaAtiva}
                aria-label={noTrecho ? "Trecho em edição" : "Linha em edição"}
                className="text-foreground relative block w-full resize-none overflow-hidden bg-transparent font-mono text-[0.95em] [tab-size:4] outline-none"
                onChange={(event) => {
                  trocar(indice, event.target.value);
                  setCursor(event.target.selectionStart);
                }}
                onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
                onKeyDown={teclas}
                onBlur={() => setAtiva(null)}
                onPointerDown={(event) => event.stopPropagation()}
              />
              {sugestoes.length > 0 && fragmento ? (
                <ListaDeSugestoes
                  titulo={TITULO_DO_POSTIT[fragmento.sinal]}
                  itens={sugestoes}
                  indice={escolhido}
                  ancora={marca}
                  onEscolher={aplicar}
                />
              ) : null}
            </div>
            {/* A linha que é só uma menção continua mostrando a coisa embaixo do
                texto cru: o nome é trocado e a imagem troca junto, e a alça da
                largura segue na mão. */}
            {noTrecho ? null : (
              <PreviaDaLinha
                linha={linha}
                aoAjustar={(ajuste, item) => trocar(indice, comAjuste(linha, ajuste, item))}
              />
            )}
          </div>
        ) : ativa && indice > ativa.indice && indice <= ate ? null : (
          <div
            key={indice}
            data-linha={indice}
            // Selecionável, contra o `select-none` da raiz: arrastar por cima do
            // texto desenhado é SELECIONAR, e soltar abre o trecho selecionado
            // -- ver `soltarNoDesenhado`. O clique simples também passa por lá,
            // e é o que põe o cursor onde se clicou, e não no fim da linha.
            className="hover:bg-foreground/5 -mx-1 rounded px-1 select-text"
          >
            <LinhaMarkdown
              linha={linha}
              aoAjustar={(ajuste, item) => trocar(indice, comAjuste(linha, ajuste, item))}
            />
          </div>
        ),
      )}
      </PosicoesDoCruContext>
    </div>
  );
}

/** O sinal e o nome, entre aspas quando o nome tem espaço, como `aplicaSugestao`. */
function mencaoDe(fonte: FonteDoArrasto): string | null {
  const escreve = (sinal: string, nome: string) =>
    /\s/.test(nome) ? `${sinal}"${nome}"` : `${sinal}${nome}`;

  switch (fonte.tipo) {
    case "acervo":
    case "handout":
    case "ponto": {
      const acervo = useAssetsStore.getState();
      const asset = [
        ...(acervo.image.assets ?? []),
        ...(acervo.file.assets ?? []),
        ...(acervo.audio.assets ?? []),
      ].find((atual) => atual.id === fonte.assetId);
      return asset ? escreve("/", asset.name) : null;
    }
    case "personagem": {
      const personagem = useCharactersStore
        .getState()
        .personagens?.find((atual) => atual.id === fonte.personagemId);
      return personagem ? escreve("@", personagem.nome) : null;
    }
    case "cena":
      return escreve(">", fonte.nome);
    default:
      return null;
  }
}

/**
 * O arquivo inteiro num campo só, tudo selecionado ao entrar. É onde o Ctrl+A
 * chega, e onde se cola um bloco grande. Esc volta à prévia; o texto continua
 * o mesmo, e a gravação é a mesma do editor ao vivo.
 */
function TextoCru({
  texto,
  onChange,
  onSair,
}: {
  texto: string;
  onChange: (texto: string) => void;
  onSair: () => void;
}) {
  const campo = useRef<HTMLTextAreaElement | null>(null);
  const [cursor, setCursor] = useState(texto.length);
  const historico = useHistoricoDeTexto(texto, cursor);
  /** A seleção a repor depois que o valor for trocado por código: desfazer, Tab. */
  const repor = useRef<{ inicio: number; fim: number } | null>(null);
  useLayoutEffect(() => {
    const alvo = campo.current;
    if (!alvo) return;
    alvo.focus();
    alvo.select();
  }, []);
  useLayoutEffect(() => {
    const alvo = campo.current;
    if (!alvo || repor.current === null) return;
    alvo.setSelectionRange(repor.current.inicio, repor.current.fim);
    repor.current = null;
  }, [texto]);
  useLayoutEffect(() => {
    const alvo = campo.current;
    if (!alvo) return;
    alvo.style.height = "0px";
    alvo.style.height = `${alvo.scrollHeight}px`;
  }, [texto]);

  // O cursor à vista, como no editor ao vivo. Só com o cursor sem seleção: ao
  // entrar aqui o texto inteiro vem selecionado, e seguir a ponta dele
  // jogaria a página para o fim do arquivo.
  useLayoutEffect(() => {
    const alvo = campo.current;
    if (!alvo || document.activeElement !== alvo || alvo.selectionStart !== alvo.selectionEnd)
      return;
    const { topo, base } = cursorDoCampo(alvo);
    trazerParaAVista(alvo, topo, base);
  }, [texto, cursor]);

  return (
    <textarea
      ref={campo}
      value={texto}
      aria-label="Texto cru da nota"
      className="text-foreground block min-h-[60vh] w-full resize-none bg-transparent font-mono text-[0.95em] [tab-size:4] outline-none"
      onChange={(event) => {
        onChange(event.target.value);
        setCursor(event.target.selectionStart);
      }}
      onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
      onKeyDown={(event) => {
        const volta = historico.tratarTecla(event);
        if (volta !== false) {
          if (volta) {
            repor.current = { inicio: volta.cursor, fim: volta.cursor };
            setCursor(volta.cursor);
            onChange(volta.texto);
          }
          return;
        }
        // O mesmo Tab do editor ao vivo, e aqui ele recua a SELEÇÃO inteira:
        // é o modo de mexer em várias linhas de uma vez.
        if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          const alvo = event.currentTarget;
          const feito = comRecuo(
            texto,
            alvo.selectionStart,
            alvo.selectionEnd,
            event.shiftKey ? -1 : 1,
          );
          if (feito.texto === texto) {
            alvo.setSelectionRange(feito.inicio, feito.fim);
            return;
          }
          repor.current = { inicio: feito.inicio, fim: feito.fim };
          setCursor(feito.inicio);
          onChange(feito.texto);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onSair();
        }
        event.stopPropagation();
      }}
    />
  );
}

/**
 * O cursor está na primeira (ou última) linha VISUAL do campo. O campo é uma
 * linha do documento, sem `\n`, mas ela pode dobrar na largura do cartão -- e
 * seta para cima numa linha dobrada tem de subir DENTRO dela antes de trocar
 * de linha do documento. Com o campo em uma linha só, qualquer posição vale.
 */
function naPrimeiraLinhaVisual(alvo: HTMLTextAreaElement): boolean {
  return linhasVisuais(alvo) <= 1 || alvo.selectionStart === 0;
}

function naUltimaLinhaVisual(alvo: HTMLTextAreaElement): boolean {
  return linhasVisuais(alvo) <= 1 || alvo.selectionStart === alvo.value.length;
}

/** Quantas linhas o campo ocupa na tela, pela altura. */
/**
 * A âncora da seleção do campo aberto como ponto do cru: a linha do documento
 * em que ela está -- o campo pode ser um trecho de várias -- e a coluna nela.
 */
function pontoDaAncora(inicioDoCampo: number, campo: HTMLTextAreaElement): PontoNoCru {
  const posicao = campo.selectionDirection === "backward" ? campo.selectionEnd : campo.selectionStart;
  const antes = campo.value.slice(0, posicao);
  const quebras = antes.split("\n").length - 1;
  return { indice: inicioDoCampo + quebras, cru: posicao - (antes.lastIndexOf("\n") + 1) };
}

function linhasVisuais(alvo: HTMLTextAreaElement): number {
  const altura = parseFloat(getComputedStyle(alvo).lineHeight) || 1;
  return Math.round(alvo.scrollHeight / altura);
}
