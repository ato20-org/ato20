"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

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
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import {
  DOCUMENTO_FONTE,
  DOCUMENTO_FONTES,
  DOCUMENTO_MINIMO,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Documento,
  type Scene,
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
  scene,
  panMode,
  onDocumentoPointerDown,
}: {
  scene: Scene;
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
  const documentos = scene.documentos;
  if (!documentos || documentos.length === 0) return null;

  return (
    <Cartoes
      sceneId={scene.id}
      documentos={documentos}
      panMode={panMode}
      onDocumentoPointerDown={onDocumentoPointerDown}
    />
  );
}

/**
 * Separado do de cima pelo hook: quadro sem cartão não deve ler personagens,
 * sondar jogadores nem listar o acervo. Mesmo desenho do `PostitLayer`.
 */
function Cartoes({
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
          onCartaoPointerDown={(event) =>
            onDocumentoPointerDown(event, documento)
          }
        />
      ))}
    </VinculosContext>,
    planoDaMargem,
  );
}

function CartaoDeDocumento({
  sceneId,
  documento,
  panMode,
  onCartaoPointerDown,
}: {
  sceneId: string;
  documento: Documento;
  panMode: boolean;
  onCartaoPointerDown: (event: ReactPointerEvent) => void;
}) {
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
    const indice = DOCUMENTO_FONTES.findIndex((f) => f >= fonte);
    const atual = indice === -1 ? DOCUMENTO_FONTES.length - 1 : indice;
    const proximo = Math.min(Math.max(atual + sentido, 0), DOCUMENTO_FONTES.length - 1);
    updateDocumento(sceneId, documento.id, { fonte: DOCUMENTO_FONTES[proximo] });
  }

  function arrastar(event: ReactPointerEvent) {
    if (panMode || tool === "ligacao") return;
    // Como o papel do postit: quem arrasta é o palco, que leva junto o que
    // mais estiver na mão e passa pelo caminho leve do gesto.
    onCartaoPointerDown(event);
  }

  function abrir() {
    if (panMode || tool === "ligacao" || !documento.notaId) return;
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
          left: documento.x,
          top: documento.y,
          width: documento.largura,
          height: documento.altura,
          zIndex: DOCUMENTO_Z,
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
          className="absolute inset-0 overflow-y-auto"
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
}
