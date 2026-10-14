"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  BookOpen,
  FileText,
  PanelLeft,
  PanelRight,
  PanelTop,
  Presentation,
  X,
} from "lucide-react";

import { Splitter } from "@/components/mestre/dock/splitter";
import { NotaEditor } from "@/components/mestre/editor-markdown";
import { LeitorLivro } from "@/components/mestre/leitor/leitor-livro";
import { VistaDoQuadro } from "@/components/mestre/paineis/vista-do-quadro";
import { t } from "@/lib/i18n/mestre";
import { abrirNotaEm } from "@/lib/mestre/abrir-nota";
import { useScreenDrag } from "@/hooks/use-screen-drag";
import {
  abrirEm,
  chaveDoConteudo,
  idDoPainel,
  soltar as soltarNaFileira,
  type Alvo,
  type ConteudoDoPainel,
  type Origem,
  type Painel,
  type PainelLateral,
  type Zona,
} from "@/lib/paineis";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { usePaineisStore } from "@/lib/store/use-paineis-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * O menor que cada coisa fica quando o divisor a aperta, em pixel.
 *
 * O livro já tinha este piso como janela atracada (`larguraMinima`): abaixo
 * dele o manual de duas colunas não se lê. O mapa precisa de onde caber a
 * régua e a barra de ferramentas; a nota, de uma linha de texto que não quebre
 * a cada palavra.
 */
const MINIMO_PX: Record<"mapa" | ConteudoDoPainel["tipo"], number> = {
  mapa: 360,
  nota: 320,
  livro: 420,
  quadro: 360,
};

/** Quanto o ponteiro anda antes de um toque na aba virar arrasto. */
const FOLGA_DO_CLIQUE = 6;


function minimoDe(painel: Painel, minimoDoMapa: number): number {
  if (painel.tipo === "mapa") return minimoDoMapa;

  return Math.max(...painel.abas.map((aba) => MINIMO_PX[aba.tipo]));
}


type Arrasto = {
  origem: Origem;
  rotulo: string;
  x: number;
  y: number;
  /** Onde ele cairia agora. `null` = em lugar nenhum que o aceite. */
  alvo: Alvo | null;
};

type Contexto = {
  arrasto: Arrasto | null;
  /** Começa a pegar uma aba. Sem arrasto, o toque é `aoClicar`. */
  pegar: (
    event: ReactPointerEvent,
    origem: Origem,
    rotulo: string,
    aoClicar: () => void,
  ) => void;
};

const ArrastoContext = createContext<Contexto | null>(null);

/**
 * A fileira do Mestre: o mapa e até dois painéis de nota, livro ou quadro ao
 * lado dele, entre as duas colunas do dock -- que ficam nas bordas da janela,
 * e não presas ao mapa. As regras moram em `lib/paineis`.
 *
 * ## A ordem é do CSS, e não do DOM
 *
 * Os painéis são desenhados sempre na mesma sequência, e é a propriedade
 * `order` que os põe onde o mestre arrumou. Reordenar mexendo no DOM faria o
 * React MOVER o nó do palco e o do leitor -- e mover um nó com canvas e
 * observador de tamanho é pedir para ele se refazer inteiro. Assim, levar o
 * livro para o outro lado do mapa não toca em nenhum dos dois.
 *
 * ## A largura anda no DOM durante o gesto
 *
 * Como o split do livro sempre fez: arrastar o divisor escreve o `flex-grow`
 * dos dois vizinhos direto no elemento, e o store só ouve no fim. Pelo store,
 * cada quadro re-renderizaria o leitor -- e re-render do leitor é redesenhar a
 * página no canvas.
 */
export function FileiraDePaineis({ children }: { children: ReactNode }) {
  const ordem = usePaineisStore((state) => state.ordem);
  const fracoes = usePaineisStore((state) => state.fracoes);
  const soltar = usePaineisStore((state) => state.soltar);

  useFileiraDaCampanha();
  usePodaDasNotas();
  useSplitPorArrasto();
  // As colunas do dock moram fora da fileira, nas bordas da janela: o piso do
  // mapa é só o do palco.
  const minimoDoMapa = MINIMO_PX.mapa;
  const { conteudo: naMao, aceso } = useNaMaoParaSplit();

  const startDrag = useScreenDrag();
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);

  /** O painel e a zona sob o ponteiro, se largar ali mudar alguma coisa. */
  function alvoEm(x: number, y: number, origem: Origem): Alvo | null {
    let no: HTMLElement | null = null;
    for (const elemento of document.elementsFromPoint(x, y)) {
      no = (elemento as HTMLElement).closest<HTMLElement>("[data-painel-id]");
      if (no) break;
    }
    if (!no) return null;

    const painel = no.dataset.painelId!;
    const caixa = no.getBoundingClientRect();
    const relativo = (x - caixa.left) / (caixa.width || 1);
    const zona: Zona =
      relativo < 0.25
        ? "esquerda"
        : relativo > 0.75
          ? "direita"
          : painel === "mapa"
            ? relativo < 0.5
              ? "esquerda"
              : "direita"
            : "centro";

    // Largar onde nada muda não acende zona nenhuma: a regra devolve o mesmo
    // estado, e é por ela que se pergunta -- uma segunda lista de "pode" e
    // "não pode" aqui envelheceria separada da que de fato decide.
    const { ordem: agora, fracoes: larguras } = usePaineisStore.getState();
    const estado = { ordem: agora, fracoes: larguras };
    const alvo: Alvo = { painel, zona };

    return soltarNaFileira(estado, origem, alvo) === estado ? null : alvo;
  }

  const contexto: Contexto = {
    arrasto,
    pegar(event, origem, rotulo, aoClicar) {
      let andou = false;

      startDrag(event, {
        onMove: (delta, nativo) => {
          if (!andou && Math.hypot(delta.x, delta.y) < FOLGA_DO_CLIQUE) return;

          andou = true;
          setArrasto({
            origem,
            rotulo,
            x: nativo.clientX,
            y: nativo.clientY,
            alvo: alvoEm(nativo.clientX, nativo.clientY, origem),
          });
        },
        onEnd: (nativo) => {
          setArrasto(null);
          if (!andou) {
            aoClicar();
            return;
          }

          const alvo = alvoEm(nativo.clientX, nativo.clientY, origem);
          if (alvo) soltar(origem, alvo);
        },
      });
    },
  };

  // Sempre na mesma sequência -- o mapa, e os laterais pelo id. Ver o
  // cabeçalho: quem põe cada um no lugar é o `order`.
  const estaveis = [...ordem].sort((a, b) =>
    idDoPainel(a) === "mapa"
      ? -1
      : idDoPainel(b) === "mapa"
        ? 1
        : idDoPainel(a).localeCompare(idDoPainel(b)),
  );

  return (
    <ArrastoContext value={contexto}>
      <div data-fileira-de-paineis className="flex min-h-0 min-w-0 flex-1">
        {estaveis.map((painel) => {
          const indice = ordem.indexOf(painel);
          const id = idDoPainel(painel);

          return (
            <div
              key={id}
              data-painel-id={id}
              className="relative flex min-h-0 min-w-0"
              style={{
                flex: `${fracoes[indice] ?? 1} 1 0px`,
                order: indice * 2,
                minWidth: painel.tipo === "mapa" ? minimoDoMapa : undefined,
              }}
            >
              {painel.tipo === "mapa" ? (
                children
              ) : (
                <PainelDeAbas painel={painel} />
              )}

              {arrasto ? <ZonasDoPainel painel={id} alvo={arrasto.alvo} /> : null}
              {naMao ? (
                <ZonasDeSplit painel={id} conteudo={naMao} aceso={aceso} />
              ) : null}
            </div>
          );
        })}

        {ordem.slice(1).map((_, posicao) => (
          <DivisorDePaineis
            key={posicao}
            indice={posicao + 1}
            minimoDoMapa={minimoDoMapa}
          />
        ))}
      </div>

      {arrasto ? (
        <div
          aria-hidden
          className="bg-popover text-popover-foreground pointer-events-none fixed z-50 max-w-48 truncate rounded-md border px-2 py-1 text-xs shadow-lg"
          style={{ left: arrasto.x + 12, top: arrasto.y + 12 }}
        >
          {arrasto.rotulo}
        </div>
      ) : null}
    </ArrastoContext>
  );
}

/**
 * Troca a fileira pela da campanha aberta: cada campanha lembra as notas e os
 * livros que deixou abertos, e onde. Ver `usePaineisStore`.
 */
function useFileiraDaCampanha() {
  const caminho = useCampaignStore((state) => state.campaign?.path ?? null);
  const carregar = usePaineisStore((state) => state.carregar);

  useEffect(() => {
    carregar(caminho);
  }, [caminho, carregar]);
}

/**
 * Tira da fileira as notas e os quadros que não existem mais.
 *
 * A fileira lembrada de uma campanha pode apontar para uma nota apagada noutra
 * sessão, e a apagada nesta também sai por aqui -- quem apaga não precisa
 * saber onde ela estava aberta. Só depois de o board chegar: antes dele, toda
 * nota "não existe".
 */
function usePodaDasNotas() {
  const notas = useSceneStore((state) => state.board?.notas);
  const cenas = useSceneStore((state) => state.board?.scenes);
  const pronto = useSceneStore((state) => state.status === "ready");
  const podar = usePaineisStore((state) => state.podar);

  useEffect(() => {
    if (!pronto) return;

    const ids = new Set((notas ?? []).map((nota) => nota.id));
    podar("nota", (conteudo) => conteudo.tipo === "nota" && ids.has(conteudo.notaId));
  }, [notas, pronto, podar]);

  useEffect(() => {
    if (!pronto) return;

    const ids = new Set((cenas ?? []).map((cena) => cena.id));
    podar("quadro", (conteudo) => conteudo.tipo === "quadro" && ids.has(conteudo.sceneId));
  }, [cenas, pronto, podar]);
}

/**
 * A nota solta na área de split abre ali.
 *
 * A nota vem pelo arrasto de peças (`useTokenDragStore`), que é o gesto dela
 * na lista de Arquivos -- o mesmo que a leva ao quadro como cartão. A área de
 * split é mais um destino desse gesto. Ver `zonaDeSplitSob`.
 */
function useSplitPorArrasto() {
  useEffect(
    () =>
      useTokenDragStore.getState().registrarAlvo("split", (solto, destino) => {
        if (solto.fonte.tipo !== "nota" || destino.tipo !== "split") return;
        abrirNotaEm(solto.fonte.notaId, { painel: destino.painel, zona: destino.zona });
      }),
    [],
  );
}

/**
 * O que está a caminho da área de split, e a zona acesa.
 *
 * Duas fontes, porque são dois gestos: a nota vem pelo arrasto de peças, e o
 * quadro pelo gesto de reordenar a lista de Arquivos -- ver `naMao` em
 * `usePaineisStore`.
 */
function useNaMaoParaSplit(): { conteudo: ConteudoDoPainel | null; aceso: Alvo | null } {
  const notaId = useTokenDragStore((state) =>
    state.arrasto?.fonte.tipo === "nota" ? state.arrasto.fonte.notaId : null,
  );
  const destino = useTokenDragStore((state) =>
    state.arrasto?.destino?.tipo === "split" ? state.arrasto.destino : null,
  );
  const quadro = usePaineisStore((state) => state.naMao);
  const alvoDoQuadro = usePaineisStore((state) => state.alvoNaMao);

  // O mesmo objeto enquanto a mesma nota está na mão: as zonas o recebem, e um
  // novo a cada quadro do arrasto as redesenharia todas.
  const daNota = useMemo<ConteudoDoPainel | null>(
    () => (notaId ? { tipo: "nota", notaId } : null),
    [notaId],
  );

  if (daNota)
    return {
      conteudo: daNota,
      aceso: destino ? { painel: destino.painel, zona: destino.zona } : null,
    };

  return { conteudo: quadro, aceso: alvoDoQuadro };
}

/**
 * A área de split sobre um painel, no meio do arrasto de uma nota ou de um
 * quadro: arrastar um arquivo MOSTRA onde ele pode abrir, e soltar numa zona
 * abre ali.
 *
 * Num painel lateral, três zonas: a borda de cada lado abre um painel novo, e
 * o meio junta como aba. No mapa, só as bordas do palco: o meio dele continua
 * sendo o palco, e a nota solta num quadro vira cartão.
 *
 * Só as zonas onde soltar faz algo: a regra (`abrirEm`) responde, e a zona que
 * ela recusa nem aparece.
 */
function ZonasDeSplit({
  painel,
  conteudo,
  aceso,
}: {
  painel: string;
  conteudo: ConteudoDoPainel;
  aceso: Alvo | null;
}) {
  const ordem = usePaineisStore((state) => state.ordem);
  const fracoes = usePaineisStore((state) => state.fracoes);
  const { caixa, palco } = usePalcoDoPainel(painel);

  const estado = { ordem, fracoes };
  const cabe = (zona: Zona) =>
    abrirEm(estado, conteudo, { painel, zona }) !== estado;

  const zonas: Array<{ zona: Zona; left: number | string; width: number | string }> =
    painel === "mapa"
      ? palco
        ? (() => {
            const borda = Math.min(palco.width * 0.22, 200);
            return [
              { zona: "esquerda" as const, left: palco.left, width: borda },
              { zona: "direita" as const, left: palco.left + palco.width - borda, width: borda },
            ];
          })()
        : []
      : [
          { zona: "esquerda", left: 0, width: "25%" },
          { zona: "centro", left: "25%", width: "50%" },
          { zona: "direita", left: "75%", width: "25%" },
        ];

  const acesa = aceso?.painel === painel && cabe(aceso.zona) ? aceso.zona : null;

  return (
    <div ref={caixa} className="pointer-events-none absolute inset-0 z-40">
      {zonas
        .filter(({ zona }) => cabe(zona))
        .map(({ zona, left, width }) => {
          const Icone = ICONE_DA_ZONA[zona];

          return (
            // O ALVO, e só ele ouve o ponteiro: é o que `zonaDeSplitSob` e o
            // arrasto de peças leem. O desenho vai numa caixa por dentro, com
            // respiro, para duas zonas vizinhas não colarem borda com borda.
            //
            // Com uma zona deste painel acesa, nenhuma se desenha: a prévia
            // cobre o pedaço delas, e as bordas tracejadas atravessando o
            // resultado o embaralhavam. Continuam alvo, e a mão que segue para
            // a vizinha a acende do mesmo jeito.
            <div
              key={zona}
              data-zona-de-split=""
              data-painel={painel}
              data-zona={zona}
              className="pointer-events-auto absolute inset-y-0"
              style={{ left, width }}
            >
              {acesa ? null : (
                <div className="border-primary/25 bg-primary/5 absolute inset-1 grid place-items-center rounded-md border-2 border-dashed">
                  <Icone aria-hidden className="text-primary/40 size-5" />
                </div>
              )}
            </div>
          );
        })}

      {acesa ? (
        <PreviaDoSplit key={acesa} zona={acesa} palco={painel === "mapa" ? palco : null} />
      ) : null}
    </div>
  );
}

/** O desenho de cada zona: um painel novo de um lado, ou uma aba em cima. */
const ICONE_DA_ZONA: Record<Zona, typeof PanelLeft> = {
  esquerda: PanelLeft,
  direita: PanelRight,
  centro: PanelTop,
};

/** Onde o palco está dentro do painel do mapa, em pixel. */
type Palco = { left: number; width: number };

/**
 * O retângulo do palco dentro do painel do mapa, medido do `main` que ele
 * contém. As zonas e a prévia se medem por ele, e não pelo painel: o `main`
 * tem respiro em volta, e a metade do PAINEL cairia torta sobre o mapa.
 *
 * `null` nos painéis laterais, que se dividem pela própria caixa. A `caixa`
 * vai na camada que se desenha sobre o painel: é pelo pai dela que se acha o
 * `main`.
 */
function usePalcoDoPainel(painel: string) {
  const caixa = useRef<HTMLDivElement | null>(null);
  const [palco, setPalco] = useState<Palco | null>(null);

  useLayoutEffect(() => {
    if (painel !== "mapa") return;

    const dono = caixa.current?.parentElement;
    const principal = dono?.querySelector("main");
    if (!dono || !principal) return;

    const fora = dono.getBoundingClientRect();
    const dentro = principal.getBoundingClientRect();
    setPalco({ left: dentro.left - fora.left, width: dentro.width });
  }, [painel]);

  return { caixa, palco };
}

/**
 * O que soltar ali FAZ, desenhado antes de soltar: o pedaço da tela que o
 * arquivo vai ocupar.
 *
 * Era a própria zona acesa -- uma faixa tracejada na borda, um quarto do
 * painel --, e ela dizia "aqui" sem dizer "o quê": uma borda que acende é o
 * desenho de qualquer destino de arrasto. Agora a prévia toma a METADE do
 * painel do lado em que o novo vai nascer, com a barra do divisor onde a tela
 * vai se partir. É o desenho do resultado, e não do alvo, e é isso que o faz
 * ler como split. No centro de um painel lateral ela cobre o painel inteiro:
 * ali o arquivo entra como mais uma aba, e nada se divide.
 *
 * Sem ouvir o ponteiro: ela cobre mais do que a zona, e roubaria o
 * `elementFromPoint` das zonas vizinhas.
 */
function PreviaDoSplit({ zona, palco }: { zona: Zona; palco: Palco | null }) {
  const Icone = ICONE_DA_ZONA[zona];
  const rotulo =
    zona === "esquerda"
      ? t.paineis.dividirAEsquerda
      : zona === "direita"
        ? t.paineis.dividirADireita
        : t.paineis.abrirComoAba;

  // A metade do lado da zona: do palco, no mapa, e do painel, nos laterais.
  const base = palco?.left ?? 0;
  const total = palco?.width;
  const area =
    zona === "centro"
      ? { left: 0, width: "100%" }
      : total === undefined
        ? { left: zona === "esquerda" ? 0 : "50%", width: "50%" }
        : {
            left: zona === "esquerda" ? base : base + total / 2,
            width: total / 2,
          };

  return (
    <div
      aria-hidden
      className="animate-in fade-in-0 pointer-events-none absolute inset-y-0 duration-150 motion-reduce:animate-none"
      style={area}
    >
      <div className="border-primary bg-primary/15 absolute inset-1.5 grid place-items-center rounded-lg border-2 shadow-[inset_0_0_32px_-8px] shadow-primary/40">
        <div className="bg-primary text-primary-foreground flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs leading-tight font-medium shadow-lg">
          <Icone className="size-4 shrink-0" />
          <span>{rotulo}</span>
        </div>
      </div>

      {/* A linha onde a tela vai se partir: o divisor que vai nascer entre o
          novo e o que já estava. */}
      {zona === "centro" ? null : (
        <div
          className={cn(
            "bg-primary absolute inset-y-3 w-1 rounded-full",
            zona === "esquerda" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
          )}
        />
      )}
    </div>
  );
}

/** O divisor entre o painel da posição `indice - 1` e o da `indice`. */
function DivisorDePaineis({
  indice,
  minimoDoMapa,
}: {
  indice: number;
  minimoDoMapa: number;
}) {
  const ordem = usePaineisStore((state) => state.ordem);
  const fracoes = usePaineisStore((state) => state.fracoes);
  const redimensionar = usePaineisStore((state) => state.redimensionar);

  /** As frações no começo do gesto, e onde ele chegou. */
  const inicio = useRef<number[] | null>(null);
  const fim = useRef<number[] | null>(null);

  const esquerdo = ordem[indice - 1];
  const direito = ordem[indice];
  if (!esquerdo || !direito) return null;

  return (
    <div className="flex" style={{ order: indice * 2 - 1 }}>
      <Splitter
        direcao="vertical"
        rotulo={t.paineis.largura}
        aoArrastar={(delta) => {
          const linha = document.querySelector<HTMLElement>("[data-fileira-de-paineis]");
          const noEsquerdo = linha?.querySelector<HTMLElement>(
            `[data-painel-id="${idDoPainel(esquerdo)}"]`,
          );
          const noDireito = linha?.querySelector<HTMLElement>(
            `[data-painel-id="${idDoPainel(direito)}"]`,
          );
          if (!linha || !noEsquerdo || !noDireito) return;

          inicio.current ??= fracoes;
          const antes = inicio.current;

          // A linha inteira é o denominador, e não os dois vizinhos: fração é
          // de toda a fileira, e é ela que muda com a janela do aplicativo.
          const largura = linha.clientWidth || 1;
          const juntos = antes[indice - 1]! + antes[indice]!;
          const minimoEsquerdo = minimoDe(esquerdo, minimoDoMapa) / largura;
          const minimoDireito = minimoDe(direito, minimoDoMapa) / largura;

          const pedida = antes[indice - 1]! + delta.x / largura;
          const daEsquerda = Math.min(
            Math.max(pedida, minimoEsquerdo),
            Math.max(minimoEsquerdo, juntos - minimoDireito),
          );

          const proximas = [...antes];
          proximas[indice - 1] = daEsquerda;
          proximas[indice] = juntos - daEsquerda;
          fim.current = proximas;

          noEsquerdo.style.flexGrow = String(proximas[indice - 1]);
          noDireito.style.flexGrow = String(proximas[indice]);
        }}
        aoSoltar={() => {
          if (fim.current) redimensionar(fim.current);
          inicio.current = null;
          fim.current = null;
        }}
      />
    </div>
  );
}

/**
 * Onde o painel arrastado cairia, acendido sobre o painel sob o ponteiro. A
 * mesma prévia do arquivo que chega da lista -- ver `PreviaDoSplit` --: levar
 * um painel para o lado do mapa é o mesmo split, com outra origem.
 */
function ZonasDoPainel({ painel, alvo }: { painel: string; alvo: Alvo | null }) {
  const { caixa, palco } = usePalcoDoPainel(painel);
  const aqui = alvo?.painel === painel ? alvo.zona : null;

  return (
    <div ref={caixa} aria-hidden className="pointer-events-none absolute inset-0 z-40">
      {aqui ? (
        <PreviaDoSplit key={aqui} zona={aqui} palco={painel === "mapa" ? palco : null} />
      ) : null}
    </div>
  );
}

/**
 * Um painel de notas e livros: as abas em cima, a aba à vista embaixo.
 *
 * As outras abas ficam MONTADAS e escondidas: trocar de aba num livro e voltar
 * reabriria o PDF e perderia a página, e numa nota perderia a rolagem. O custo
 * é o que já estava aberto continuar na memória, e é o mesmo de uma janela.
 *
 * O painel recebe o foco quando é clicado (`tabIndex`), e é o que põe a tecla
 * apertada aqui dentro em vez de no `body`: os atalhos do palco calam com o
 * foco num painel lateral, e os do editor de nota só valem no painel dele. Ver
 * `useMestreShortcuts`.
 */
function PainelDeAbas({ painel }: { painel: PainelLateral }) {
  const ativar = usePaineisStore((state) => state.ativar);
  const fecharAba = usePaineisStore((state) => state.fecharAba);
  const notas = useSceneStore((state) => state.board?.notas);
  const cenas = useSceneStore((state) => state.board?.scenes);
  const contexto = useContext(ArrastoContext);

  const tituloDe = (aba: ConteudoDoPainel) => {
    switch (aba.tipo) {
      case "livro":
        return aba.titulo;
      case "nota":
        return (
          notas?.find((nota) => nota.id === aba.notaId)?.titulo ?? t.paineis.nota
        );
      case "quadro":
        return (
          cenas?.find((cena) => cena.id === aba.sceneId)?.name ?? t.paineis.quadro
        );
    }
  };

  return (
    <section
      data-painel-lateral
      tabIndex={-1}
      aria-label={t.paineis.painel}
      className="bg-background flex min-h-0 min-w-0 flex-1 flex-col border-x outline-none"
    >
      {/* A tira com o desenho das abas do dock -- ver `DockGroup` --, para o
          painel ao lado do mapa ler como mais uma região da bancada, e não
          como outra coisa.

          O vão à direita da última aba pega o painel INTEIRO: é por ali que se
          leva um painel de várias abas para o outro lado do mapa. A aba pegada
          sozinha sai do painel. */}
      <div className="flex items-end gap-1 px-1.5 pt-1.5">
        <div
          role="tablist"
          aria-label={t.paineis.abas}
          className="rolagem-limpa scroll-fade-x flex min-w-0 flex-1 cursor-grab items-end gap-px self-stretch overflow-x-auto"
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;

            contexto?.pegar(
              event,
              { tipo: "painel", painelId: painel.id },
              painel.abas.length > 1
                ? t.paineis.contarAbas(painel.abas.length)
                : tituloDe(painel.abas[0]!),
              () => {},
            );
          }}
        >
          {painel.abas.map((aba) => {
            const chave = chaveDoConteudo(aba);
            const ativa = chave === painel.ativa;
            const titulo = tituloDe(aba);
            const Icone =
              aba.tipo === "livro"
                ? BookOpen
                : aba.tipo === "quadro"
                  ? Presentation
                  : FileText;
            const levada =
              contexto?.arrasto?.origem.tipo === "aba"
                ? contexto.arrasto.origem.chave === chave
                : contexto?.arrasto?.origem.tipo === "painel" &&
                  contexto.arrasto.origem.painelId === painel.id;

            return (
              // A casca leva o desenho, como no dock: dentro dela o rótulo e o X
              // são dois alvos irmãos.
              <span
                key={chave}
                role="presentation"
                data-arrastando={levada ? "" : undefined}
                className={cn(
                  "group/aba flex shrink-0 cursor-grab items-center gap-1 rounded-t-md pr-1 pl-2.5 text-xs whitespace-nowrap transition-all active:cursor-grabbing",
                  "data-arrastando:scale-95 data-arrastando:opacity-40 motion-reduce:transition-none",
                  ativa
                    ? "bg-muted text-foreground relative z-10 -mb-px border border-b-0"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground border border-transparent border-b-0",
                )}
                onPointerDown={(event) =>
                  contexto?.pegar(
                    event,
                    painel.abas.length > 1
                      ? { tipo: "aba", painelId: painel.id, chave }
                      : { tipo: "painel", painelId: painel.id },
                    titulo,
                    () => ativar(painel.id, chave),
                  )
                }
                // O botão do meio fecha, como em qualquer navegador.
                onAuxClick={(event) => {
                  if (event.button === 1) fecharAba(painel.id, chave);
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  title={titulo}
                  className="flex min-w-0 items-center gap-1.5 py-1.5 outline-none"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") ativar(painel.id, chave);
                  }}
                >
                  <Icone className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{titulo}</span>
                </button>
                <button
                  type="button"
                  aria-label={t.paineis.fechar(titulo)}
                  className="hover:bg-foreground/10 hover:text-foreground focus-visible:ring-ring shrink-0 rounded-sm p-0.5 opacity-0 transition-opacity group-hover/aba:opacity-100 group-focus-within/aba:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
                  // Para aqui: o toque no X não pode começar o arrasto da aba.
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => fecharAba(painel.id, chave)}
                >
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      </div>

      <Separator />

      {painel.abas.map((aba) => {
        const chave = chaveDoConteudo(aba);

        return (
          <div
            key={chave}
            className={cn(
              "min-h-0 min-w-0 flex-1 flex-col",
              chave === painel.ativa ? "flex" : "hidden",
            )}
          >
            <ConteudoDaAba conteudo={aba} />
          </div>
        );
      })}
    </section>
  );
}

function ConteudoDaAba({ conteudo }: { conteudo: ConteudoDoPainel }) {
  const notaId = conteudo.tipo === "nota" ? conteudo.notaId : null;
  const nota = useSceneStore((state) =>
    notaId ? (state.board?.notas?.find((atual) => atual.id === notaId) ?? null) : null,
  );

  if (conteudo.tipo === "livro") return <LeitorLivro livroId={conteudo.livroId} />;
  if (conteudo.tipo === "quadro") return <VistaDoQuadro sceneId={conteudo.sceneId} />;

  // Sem a nota ainda -- o board não chegou -- nada: a poda tira a aba se ela
  // de fato não existir mais. Ver `usePodaDasNotas`.
  return nota ? <NotaEditor key={nota.id} nota={nota} onde="painel" /> : null;
}
