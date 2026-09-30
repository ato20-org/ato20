"use client";

import { createPortal } from "react-dom";
import {
  memo,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { MarkdownView, VinculosContext } from "@/components/playground/markdown-view";
import { useMencoesDoMestre } from "@/hooks/use-mencoes-do-mestre";
import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { TransformHandles } from "@/components/playground/transform-handles";
import { CORNER_HANDLES } from "@/lib/geometry/transform";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useArquivoAbertoStore } from "@/lib/store/use-arquivo-aberto-store";
import { useDocumentoStore } from "@/lib/store/use-documento-store";
import { useGestoStore } from "@/lib/store/use-gesto-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { MARCA_MENCAO, repassarCliqueDaMencao } from "@/lib/mestre/clique-da-mencao";
import { degrauDeFonte } from "@/lib/mestre/degrau-de-fonte";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import {
  DOCUMENTO_FONTE,
  DOCUMENTO_FONTES,
  DOCUMENTO_MINIMO,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Documento,
} from "@/types/scene";

/** Acima do postit (8 500), abaixo da seta (8 600): a seta chega a ele. */
const DOCUMENTO_Z = 8_550;
/** Ver o comentário no `style` do cartão. */
const FUNDO_DO_CARTAO = "color-mix(in oklch, var(--card), var(--foreground) 7%)";
const MARGEM = 12;
/** Prende um lado do cartão entre o mínimo e o plano. */
function presoNoTamanho(valor: number, teto: number): number {
  return Math.round(Math.min(teto, Math.max(DOCUMENTO_MINIMO, valor)));
}

/**
 * Os cartões de nota do quadro: a prévia de um `.md`, só leitura.
 *
 * Leve de propósito: o quadro pode ter vinte cartões, e vinte editores seriam
 * vinte campos de texto vivos numa tela que já desenha imagens e setas. O
 * cartão desenha o Markdown e mais nada; duplo clique abre a nota no editor,
 * no lugar do palco. Ver `NotaEditor`.
 *
 * Irmão do `PostitLayer`, fora do `SceneLayer` pela mesma razão. O texto vem
 * do `useDocumentoStore`, o mesmo do editor: escrever lá aparece aqui.
 */
export function DocumentoLayer({
  sceneId,
  documentos,
  panMode,
  onDocumentoPointerDown,
}: {
  sceneId: string;
  /**
   * Os cartões como estão no BOARD, sem o gesto em curso por cima.
   *
   * É a razão de a camada não receber a `scene` como as irmãs: a cena que o
   * palco desenha é refeita a cada quadro do gesto (`aplicarGesto`), e com
   * ela a lista de cartões -- e uma lista nova faz o React reconciliar os
   * sessenta cartões sessenta vezes por segundo para concluir que
   * cinquenta e nove não mudaram. Medido na bancada (`quadro`, webview): uns
   * 55 µs por cartão por quadro, 3,5 ms com sessenta -- o que sobrava
   * depois de memoizar o cartão. A lista do board não muda de identidade
   * enquanto a mão está fechada, e é cada cartão que lê o próprio patch do
   * gesto -- ver `CartaoDeDocumento`.
   */
  documentos: Documento[] | undefined;
  panMode: boolean;
  /**
   * O clique no CARTÃO, entregue ao palco -- irmão do `onPostitPointerDown`, e
   * aqui pelo mesmo motivo: a área laça o cartão junto com o resto, e quem
   * sabe o que mais está na mão é o palco.
   *
   * No cartão inteiro, e não numa barra de título: o cartão é só conteúdo, e
   * uma faixa de arrasto no topo gastava altura de leitura para oferecer o que
   * a caixa toda já podia oferecer.
   */
  onDocumentoPointerDown: (
    event: ReactPointerEvent,
    documento: Documento,
  ) => void;
}) {
  if (!documentos || documentos.length === 0) return null;

  return (
    <Cartoes
      sceneId={sceneId}
      documentos={documentos}
      panMode={panMode}
      onDocumentoPointerDown={onDocumentoPointerDown}
    />
  );
}

/**
 * Separado do de cima pelo hook: quadro sem cartão não deve ler personagens,
 * sondar jogadores nem listar o acervo. Mesmo desenho do `PostitLayer`.
 *
 * `memo` porque o palco re-renderiza a cada quadro do gesto e esta camada
 * recebe as mesmas quatro props: sem ele, cada quadro montava os sessenta
 * elementos de cartão só para o `memo` de cada um recusá-los.
 */
const Cartoes = memo(function Cartoes({
  sceneId,
  documentos,
  panMode,
  onDocumentoPointerDown,
}: {
  sceneId: string;
  documentos: Documento[];
  panMode: boolean;
  onDocumentoPointerDown: (
    event: ReactPointerEvent,
    documento: Documento,
  ) => void;
}) {
  const { vinculos } = useMencoesDoMestre();
  const { planoDaMargem } = useSceneScale();

  // Na margem, pelo mesmo motivo do `PostitLayer`: o cartão também estaciona
  // fora do mapa.
  if (!planoDaMargem) return null;

  return createPortal(
    <VinculosContext value={vinculos}>
      {documentos.map((documento) => (
        <CartaoDeDocumento
          key={documento.id}
          sceneId={sceneId}
          documento={documento}
          panMode={panMode}
          onDocumentoPointerDown={onDocumentoPointerDown}
        />
      ))}
    </VinculosContext>,
    planoDaMargem,
  );
});

/**
 * `memo` pela razão do `TextoSolto`: a cena é imutável e o board preserva a
 * identidade do cartão que não mudou, então arrastar UM cartão não precisa
 * redesenhar os outros vinte e nove -- e cada um deles é uma nota inteira,
 * sessenta linhas de Markdown reanalisadas e reconciliadas.
 *
 * Medido no cenário `quadro` da bancada, com trinta cartões e um na mão, na
 * webview: 11 fps e 100% de quadro perdido sem isto. Era o custo que o
 * mestre sentia ao arrumar a história na folha.
 *
 * Só vale com handler ESTÁVEL: o palco entrega `onDocumentoPointerDown` pelo
 * envelope de `handlersRef`, e por isso ele chega aqui inteiro em vez de
 * fechado numa closure por cartão -- que seria uma função nova por render, e
 * o `memo` não seguraria nada.
 */
const CartaoDeDocumento = memo(function CartaoDeDocumento({
  sceneId,
  documento: doBoard,
  panMode,
  onDocumentoPointerDown,
}: {
  sceneId: string;
  documento: Documento;
  panMode: boolean;
  onDocumentoPointerDown: (
    event: ReactPointerEvent,
    documento: Documento,
  ) => void;
}) {
  /**
   * O gesto em curso sobre ESTE cartão, lido daqui e não aplicado à lista
   * inteira pelo palco -- ver `DocumentoLayer`. O seletor devolve o patch do
   * cartão, ou `undefined`: para os que não estão na mão a resposta é a
   * mesma referência quadro após quadro, e o zustand não os acorda.
   */
  const patch = useGestoStore((state) =>
    state.sceneId === sceneId
      ? state.documentos?.find((atual) => atual.id === doBoard.id)?.patch
      : undefined,
  );
  const documento = patch ? { ...doBoard, ...patch } : doBoard;

  const { scale, ampliacaoNoLayout } = useSceneScale();
  const tool = useToolStore((state) => state.tool);

  const updateDocumento = useSceneStore((state) => state.updateDocumento);
  const removeDocumento = useSceneStore((state) => state.removeDocumento);
  const abrirNota = useArquivoAbertoStore((state) => state.abrirNota);

  const selecionado = useSelectionStore((state) =>
    state.selectedDocumentoIds.includes(documento.id),
  );
  /**
   * Este cartão é a ÚNICA coisa na mão?
   *
   * Mesma pergunta do texto solto, e pela mesma razão: sozinho ele traz as
   * próprias alças e os próprios botões; acompanhado, quem desenha é o gizmo
   * do grupo, no palco. Ver `sozinho` em `TextoLayer`.
   */
  const sozinho = useSelectionStore(
    (state) =>
      state.selectedDocumentoIds.length === 1 &&
      state.selectedIds.length === 0 &&
      state.selectedTextoIds.length === 0 &&
      state.selectedFormaIds.length === 0 &&
      state.selectedPostitIds.length === 0 &&
      state.selectedTracoIds.length === 0,
  );

  const texto = useDocumentoStore((state) => state.textos[documento.arquivo]);
  const carregar = useDocumentoStore((state) => state.carregar);

  useEffect(() => {
    carregar(documento.arquivo);
  }, [documento.arquivo, carregar]);

  /**
   * A roda sobre o documento rola o texto, e não dá zoom no quadro. Ouvinte
   * NATIVO, e não `onWheel` do React: o zoom do palco é um ouvinte nativo na
   * moldura, e ele dispara antes de o evento chegar à raiz do React -- um
   * `stopPropagation` sintético chegaria tarde.
   */
  const corpo = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const alvo = corpo.current;
    if (!alvo) return;
    const segurar = (event: WheelEvent) => {
      // Só quando há o que rolar: sem rolagem, a roda continua sendo do palco.
      if (alvo.scrollHeight > alvo.clientHeight) event.stopPropagation();
    };
    alvo.addEventListener("wheel", segurar, { passive: true });
    return () => alvo.removeEventListener("wheel", segurar);
  }, []);

  // Mesma conta do corpo do postit: pixel de tela sob `zoom`, pelo piso de
  // 9px do WebKit. Ver `PostitPapel.medidaDoCorpo`.
  const fator = ampliacaoNoLayout ? scale : 1;
  const medidaDoCorpo = ampliacaoNoLayout ? emPixelDeTela(scale) : undefined;
  const fonte = documento.fonte ?? DOCUMENTO_FONTE;

  function mudarFonte(sentido: 1 | -1) {
    updateDocumento(sceneId, documento.id, { fonte: degrauDeFonte(fonte, sentido) });
  }

  function arrastar(event: ReactPointerEvent) {
    if (panMode || tool === "ligacao") return;
    // Como o papel do postit: quem arrasta é o palco, que leva junto o que
    // mais estiver na mão e passa pelo caminho leve do gesto.
    //
    // A menção e a prévia dentro do cartão recebem o clique por aqui: o palco
    // o mata ao capturar o ponteiro. Ver `repassarCliqueDaMencao`.
    repassarCliqueDaMencao(event);
    onDocumentoPointerDown(event, documento);
  }

  function abrir(event: React.MouseEvent) {
    if (panMode || tool === "ligacao" || !documento.notaId) return;
    // Duplo clique numa menção é da menção, como no postit: abrir a ficha e
    // trocar o palco pela nota no mesmo gesto esconderia a ficha que abriu.
    // O que está SOB o ponteiro, porque a captura do arrasto põe o alvo no
    // cartão.
    const sob = document.elementFromPoint(event.clientX, event.clientY);
    if (sob?.closest(`[${MARCA_MENCAO}]`)) return;
    abrirNota(documento.notaId);
  }

  const menorDisponivel = DOCUMENTO_FONTES.findIndex((f) => f >= fonte) > 0;
  const maiorDisponivel = fonte < DOCUMENTO_FONTES[DOCUMENTO_FONTES.length - 1]!;


  return (
    <>
      <div
        className={cn(
          "text-card-foreground ring-foreground/20 absolute overflow-hidden rounded-md shadow-xl ring-1",
          // Com a seta na mão o ponteiro é DESLIGADO aqui, e não apenas
          // ignorado: o clique precisa ATRAVESSAR até o envelope do palco, que
          // vive no plano de baixo e é quem trata o gesto da seta. Um tratador
          // que só retornava deixava o pointerdown morrer neste `<div>` -- e a
          // seta não começava em cima de um postit, de um texto nem de um
          // cartão, que é justamente onde ela quer começar.
          tool === "ligacao"
            ? "pointer-events-none cursor-crosshair"
            : "pointer-events-auto cursor-move",
        )}
        style={{
          // A POSIÇÃO por `transform`, como a moldura da câmera: mexer em
          // `left`/`top` marca o documento inteiro para refazer o layout, e a
          // folha com trinta cartões é uma folha com quatro mil nós de texto.
          // Medido no cenário `quadro` da bancada, na webview, trinta cartões
          // e um na mão: por caixa 35 fps e 64% de quadro perdido; por
          // `transform` ver `scripts/perf/README.md`. A caixa de layout fica
          // na origem da margem, que é 0x0 de propósito.
          left: 0,
          top: 0,
          transform: `translate(${documento.x}px, ${documento.y}px)`,
          width: documento.largura,
          height: documento.altura,
          // Camada própria só para o cartão NA MÃO: o palco seleciona o que
          // pega, então selecionado é o que anda. Com ela o motor re-compõe
          // em vez de repintar a folha; em todos os cartões seriam trinta
          // camadas de texto rasterizadas de novo a cada zoom.
          willChange: selecionado ? "transform" : undefined,
          zIndex: DOCUMENTO_Z,
          // O cartão fora da tela não paga estilo, layout nem pintura: num
          // quadro de verdade a história é maior que o enquadramento, e o
          // motor só desenha o que a câmera alcança. O tamanho intrínseco é
          // a própria caixa, para o cartão escondido ocupar o mesmo lugar.
          contentVisibility: "auto",
          containIntrinsicSize: `${documento.largura}px ${documento.altura}px`,
          touchAction: "none",
          // Deslocado do plano, que também é `--card`: 7% de `--foreground`
          // clareia no escuro e escurece no claro, e o cartão aparece nos dois.
          background: FUNDO_DO_CARTAO,
        }}
        // O cartão INTEIRO arrasta, e quem arrasta é o palco: ele leva junto o
        // que mais estiver na mão e passa pelo caminho leve do gesto. Antes
        // havia uma faixa de título de 26 unidades só para isto, e ela cobrava
        // altura de leitura em todo cartão para servir a um gesto que a caixa
        // toda pode servir.
        //
        // O `stopPropagation` de antes não some: ele está dentro de
        // `startDrag`, e é o que impede o palco de tratar o mesmo gesto como
        // clique no vazio -- com uma ferramenta de mira na mão, clicar no
        // cartão não pode colar um postit nele.
        onPointerDown={arrastar}
        onDoubleClick={abrir}
        title={documento.notaId ? "Duplo clique abre a nota" : undefined}
      >
        <div
          ref={corpo}
          // Rolável SÓ sob o mouse. Um corpo `overflow-y: auto` é uma área
          // rolável para o WebKit, com nó próprio na árvore de rolagem, e
          // a árvore é refeita toda vez que uma camada composta se move:
          // arrastar um cartão custava uma reconstrução por quadro com uma
          // entrada por cartão da folha. Medido na bancada (`quadro`, 60
          // cartões, um na mão, webview): 26,8 fps sempre rolável, 43,8
          // rolável nenhum. Sob o mouse a área existe, e a roda rola como
          // sempre; a barra aparece ao passar o ponteiro, que é onde ela
          // serve.
          className="absolute inset-0 overflow-hidden hover:overflow-y-auto"
          style={{
            ...medidaDoCorpo,
            fontSize: fonte * fator,
            lineHeight: 1.5,
            padding: MARGEM * fator,
          }}
        >
          {texto === undefined ? (
            <span className="text-muted-foreground italic">Abrindo…</span>
          ) : texto.trim() === "" ? (
            <span className="text-muted-foreground italic">
              Vazia. Duplo clique para escrever.
            </span>
          ) : (
            <MarkdownView texto={texto} />
          )}
        </div>
      </div>

      {/* As alças e os botões só com o cartão na mão SOZINHO, como no texto
          solto: acompanhado, quem manda é o gizmo do grupo, e dois conjuntos
          de alças no mesmo lugar disputariam o clique.

          O tamanho da letra vira botão redondo na fileira de cima, junto com o
          excluir -- é onde os outros elementos do quadro já põem o que se faz
          com eles, e o rodapé que os guardava gastava 22 unidades de altura em
          todo cartão para dois cliques raros. */}
      {selecionado && sozinho && !panMode && tool !== "ligacao" ? (
        <TransformHandles
          key={documento.id}
          box={{
            x: documento.x,
            y: documento.y,
            width: documento.largura,
            height: documento.altura,
            rotation: 0,
          }}
          // Sem giro: o cartão não tem `rotation` no modelo -- ele é uma
          // janela de leitura, e texto corrido torto não se lê.
          rotatable={false}
          handles={CORNER_HANDLES}
          onChange={({ x, y, width, height }) =>
            updateDocumento(sceneId, documento.id, {
              ...(x !== undefined ? { x: Math.round(x) } : {}),
              ...(y !== undefined ? { y: Math.round(y) } : {}),
              ...(width !== undefined
                ? { largura: presoNoTamanho(width, SCENE_WIDTH) }
                : {}),
              ...(height !== undefined
                ? { altura: presoNoTamanho(height, SCENE_HEIGHT) }
                : {}),
            })
          }
          fonte={{
            valor: fonte,
            menor: menorDisponivel ? () => mudarFonte(-1) : undefined,
            maior: maiorDisponivel ? () => mudarFonte(1) : undefined,
          }}
          onDelete={() => removeDocumento(sceneId, documento.id)}
        />
      ) : null}
    </>
  );
});
