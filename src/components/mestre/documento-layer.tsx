"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { AArrowDown, AArrowUp, FileText, Trash2 } from "lucide-react";

import { MarkdownView, VinculosContext } from "@/components/playground/markdown-view";
import { useMencoesDoMestre } from "@/hooks/use-mencoes-do-mestre";
import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { postitNaArea } from "@/lib/geometry/postit";
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
/** Altura da barra de título e do rodapé, em unidades de cena. */
const BARRA = 26;
const RODAPE = 22;
/** Lado da alça de redimensionar, em unidades de cena. */
const ALCA = 16;

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
}: {
  scene: Scene;
  panMode: boolean;
}) {
  const documentos = scene.documentos;
  if (!documentos || documentos.length === 0) return null;

  return <Cartoes sceneId={scene.id} documentos={documentos} panMode={panMode} />;
}

/**
 * Separado do de cima pelo hook: quadro sem cartão não deve ler personagens,
 * sondar jogadores nem listar o acervo. Mesmo desenho do `PostitLayer`.
 */
function Cartoes({
  sceneId,
  documentos,
  panMode,
}: {
  sceneId: string;
  documentos: Documento[];
  panMode: boolean;
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
}: {
  sceneId: string;
  documento: Documento;
  panMode: boolean;
}) {
  const { scale, ampliacaoNoLayout } = useSceneScale();
  const startDrag = useSceneDrag();
  const tool = useToolStore((state) => state.tool);

  const updateDocumento = useSceneStore((state) => state.updateDocumento);
  const removeDocumento = useSceneStore((state) => state.removeDocumento);
  const abrirNota = useArquivoAbertoStore((state) => state.abrirNota);

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
    const { x, y } = documento;
    startDrag(event, {
      onMove: (delta) =>
        updateDocumento(
          sceneId,
          documento.id,
          postitNaArea(x + delta.x, y + delta.y, documento.largura, documento.altura),
        ),
    });
  }

  function redimensionar(event: ReactPointerEvent) {
    if (panMode) return;
    const { largura, altura } = documento;
    startDrag(event, {
      onMove: (delta) =>
        updateDocumento(sceneId, documento.id, {
          largura: Math.min(SCENE_WIDTH, Math.max(DOCUMENTO_MINIMO, largura + delta.x)),
          altura: Math.min(SCENE_HEIGHT, Math.max(DOCUMENTO_MINIMO, altura + delta.y)),
        }),
    });
  }

  function abrir() {
    if (panMode || tool === "ligacao" || !documento.notaId) return;
    abrirNota(documento.notaId);
  }

  return (
    <div
      className={cn(
        "text-card-foreground ring-foreground/20 pointer-events-auto absolute flex flex-col overflow-hidden rounded-md shadow-xl ring-1",
        tool === "ligacao" && "cursor-crosshair",
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
      // O cartão inteiro para o clique no vazio do palco: com uma ferramenta
      // de mira na mão, clicar no documento não pode colar um postit nele.
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={abrir}
      title={documento.notaId ? "Duplo clique abre a nota" : undefined}
    >
      <div
        className="group bg-foreground/10 flex shrink-0 cursor-move items-center gap-1 px-1.5"
        style={{ height: BARRA }}
        onPointerDown={arrastar}
      >
        <FileText
          className="text-muted-foreground shrink-0"
          style={{ width: BARRA * 0.55, height: BARRA * 0.55 }}
          strokeWidth={Math.min(2.5, 2.5 / scale)}
          aria-hidden
        />
        <span
          className="min-w-0 flex-1 truncate font-medium"
          style={{ fontSize: BARRA * 0.5 }}
        >
          {documento.titulo}
        </span>
        <button
          type="button"
          aria-label="Tirar este cartão do quadro"
          title="Tira o cartão. A nota continua em Arquivos."
          className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ width: BARRA * 0.7, height: BARRA * 0.7 }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => removeDocumento(sceneId, documento.id)}
        >
          <Trash2 className="size-full" strokeWidth={Math.min(2.5, 2.5 / scale)} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
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

      <div
        className="bg-foreground/10 text-muted-foreground flex shrink-0 items-center gap-1 px-1.5"
        style={{ height: RODAPE, fontSize: RODAPE * 0.45 }}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Diminuir a fonte"
          className="hover:text-foreground disabled:opacity-40"
          style={{ width: RODAPE * 0.7, height: RODAPE * 0.7 }}
          disabled={fonte <= DOCUMENTO_FONTES[0]}
          onClick={() => mudarFonte(-1)}
        >
          <AArrowDown className="size-full" strokeWidth={Math.min(2.5, 2.5 / scale)} />
        </button>
        <span className="tabular-nums" style={{ minWidth: RODAPE * 0.9 }}>
          {fonte}
        </span>
        <button
          type="button"
          aria-label="Aumentar a fonte"
          className="hover:text-foreground disabled:opacity-40"
          style={{ width: RODAPE * 0.7, height: RODAPE * 0.7 }}
          disabled={fonte >= DOCUMENTO_FONTES[DOCUMENTO_FONTES.length - 1]!}
          onClick={() => mudarFonte(1)}
        >
          <AArrowUp className="size-full" strokeWidth={Math.min(2.5, 2.5 / scale)} />
        </button>
        <span className="min-w-0 flex-1 truncate text-right">
          {documento.arquivo}
        </span>
        <span style={{ width: ALCA }} aria-hidden />
      </div>

      <button
        type="button"
        aria-label="Redimensionar este documento"
        className="absolute right-0 bottom-0 cursor-nwse-resize bg-black/10"
        style={{
          width: ALCA,
          height: ALCA,
          clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
        }}
        onPointerDown={redimensionar}
      />
    </div>
  );
}
