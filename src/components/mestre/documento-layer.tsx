"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FileText, Trash2 } from "lucide-react";

import { LinhaMarkdown } from "@/components/playground/markdown-view";
import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { postitNaArea } from "@/lib/geometry/postit";
import { useDocumentoStore } from "@/lib/store/use-documento-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { apagarDocumento } from "@/lib/vault/documentos";
import { cn } from "@/lib/utils";
import {
  DOCUMENTO_MINIMO,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Documento,
  type Scene,
} from "@/types/scene";

/** Acima do postit (8 500), abaixo da seta (8 600): a seta chega a ele. */
const DOCUMENTO_Z = 8_550;
/** Fonte do corpo, em unidades de cena. Maior que a do postit: é para ler longo. */
const FONTE = 16;
const MARGEM = 12;
/** Altura da barra de título, em unidades de cena. */
const BARRA = 26;
/** Lado da alça de redimensionar, em unidades de cena. */
const ALCA = 16;

/**
 * Os cartões de documento do quadro: Markdown de verdade, editado no lugar,
 * com prévia ao vivo.
 *
 * Irmão do `PostitLayer`, fora do `SceneLayer` pela mesma razão. O que muda é
 * o corpo: em vez de um `<textarea>` sobre o papel inteiro, uma lista de
 * LINHAS em que só a que está sob o cursor mostra o Markdown cru -- as outras
 * aparecem desenhadas. É o modo de edição do Obsidian, e o que faz um
 * documento de duas telas continuar legível enquanto se escreve nele.
 *
 * O texto vem do arquivo `.md`, pelo `useDocumentoStore`; a cena só tem o
 * cartão. Ver `Documento`.
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

  return documentos.map((documento) => (
    <CartaoDeDocumento
      key={documento.id}
      sceneId={scene.id}
      documento={documento}
      panMode={panMode}
    />
  ));
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

  const texto = useDocumentoStore((state) => state.textos[documento.arquivo]);
  const carregar = useDocumentoStore((state) => state.carregar);
  const escrever = useDocumentoStore((state) => state.escrever);

  useEffect(() => {
    carregar(documento.arquivo);
  }, [documento.arquivo, carregar]);

  const [renomeando, setRenomeando] = useState(false);

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
  const tipografia = {
    fontSize: FONTE * fator,
    lineHeight: 1.5,
    padding: MARGEM * fator,
  };

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

  function remover() {
    removeDocumento(sceneId, documento.id);
    // O arquivo vai junto: um `.md` órfão na pasta da campanha é um arquivo
    // pesado para apagar depois, como o fundo que sai da campanha com a cena.
    void apagarDocumento(documento.arquivo).catch((cause: unknown) => {
      console.error("falha ao apagar o documento", cause);
    });
  }

  function confirmarTitulo(valor: string) {
    const titulo = valor.trim();
    if (titulo && titulo !== documento.titulo)
      updateDocumento(sceneId, documento.id, { titulo });
    setRenomeando(false);
  }

  return (
    <div
      className={cn(
        "bg-card text-card-foreground pointer-events-auto absolute flex flex-col overflow-hidden rounded-md shadow-lg ring-1 ring-black/15",
        tool === "ligacao" && "cursor-crosshair",
      )}
      style={{
        left: documento.x,
        top: documento.y,
        width: documento.largura,
        height: documento.altura,
        zIndex: DOCUMENTO_Z,
        touchAction: "none",
      }}
      // O cartão inteiro para o clique no vazio do palco: com uma ferramenta
      // de mira na mão, clicar no documento não pode colar um postit nele.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="group bg-foreground/5 flex shrink-0 cursor-move items-center gap-1 px-1.5"
        style={{ height: BARRA }}
        onPointerDown={arrastar}
        onDoubleClick={() => setRenomeando(true)}
      >
        <FileText
          className="text-muted-foreground shrink-0"
          style={{ width: BARRA * 0.55, height: BARRA * 0.55 }}
          strokeWidth={Math.min(2.5, 2.5 / scale)}
          aria-hidden
        />
        {renomeando ? (
          <input
            autoFocus
            defaultValue={documento.titulo}
            className="bg-background min-w-0 flex-1 rounded px-1 outline-none"
            style={{ fontSize: BARRA * 0.5, height: BARRA * 0.8 }}
            aria-label="Título do documento"
            onPointerDown={(event) => event.stopPropagation()}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={(event) => confirmarTitulo(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") confirmarTitulo(event.currentTarget.value);
              if (event.key === "Escape") setRenomeando(false);
              event.stopPropagation();
            }}
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate font-medium"
            style={{ fontSize: BARRA * 0.5 }}
            title="Duplo clique renomeia"
          >
            {documento.titulo}
          </span>
        )}
        <button
          type="button"
          aria-label="Apagar este documento"
          title="Apaga o cartão e o arquivo .md"
          className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ width: BARRA * 0.7, height: BARRA * 0.7 }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={remover}
        >
          <Trash2
            className="size-full"
            strokeWidth={Math.min(2.5, 2.5 / scale)}
          />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={corpo}
          className="absolute inset-0 overflow-y-auto"
          style={{ ...medidaDoCorpo, ...tipografia }}
        >
          {texto === undefined ? (
            <span className="text-muted-foreground italic">Abrindo…</span>
          ) : (
            <EditorAoVivo
              texto={texto}
              onChange={(novo) =>
                escrever(documento.arquivo, novo, {
                  sceneId,
                  documentoId: documento.id,
                })
              }
            />
          )}
        </div>
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
function EditorAoVivo({
  texto,
  onChange,
}: {
  texto: string;
  onChange: (texto: string) => void;
}) {
  const linhas = texto.split("\n");

  const [ativa, setAtiva] = useState<{ indice: number; cursor: number } | null>(null);
  const campo = useRef<HTMLTextAreaElement | null>(null);

  // Foco e cursor DEPOIS do campo trocar de linha: o `<textarea>` é um só e
  // muda de valor, então o cursor tem de ser reposto a cada troca.
  useLayoutEffect(() => {
    if (!ativa) return;
    const alvo = campo.current;
    if (!alvo) return;
    alvo.focus();
    const pos = Math.min(ativa.cursor, alvo.value.length);
    alvo.setSelectionRange(pos, pos);
    alvo.style.height = "0px";
    alvo.style.height = `${alvo.scrollHeight}px`;
  }, [ativa, texto]);

  function trocar(indice: number, valor: string) {
    const proximas = [...linhas];
    proximas[indice] = valor;
    onChange(proximas.join("\n"));
  }

  function teclas(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!ativa) return;
    const alvo = event.currentTarget;
    const { selectionStart, selectionEnd, value } = alvo;
    const indice = ativa.indice;

    if (event.key === "Escape") {
      event.preventDefault();
      setAtiva(null);
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const antes = value.slice(0, selectionStart);
      const depois = value.slice(selectionEnd);
      // Continua a lista: Enter no fim de um item começa outro; num item vazio,
      // sai da lista. É o gesto que todo editor de Markdown faz.
      const marca = /^(\s*(?:[-*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+))/.exec(antes)?.[1] ?? "";
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
      const anterior = linhas[indice - 1] ?? "";
      const proximas = [...linhas];
      proximas.splice(indice - 1, 2, anterior + value);
      onChange(proximas.join("\n"));
      setAtiva({ indice: indice - 1, cursor: anterior.length });
    } else if (
      event.key === "Delete" &&
      selectionStart === value.length &&
      selectionEnd === value.length &&
      indice < linhas.length - 1
    ) {
      event.preventDefault();
      const proxima = linhas[indice + 1] ?? "";
      const proximas = [...linhas];
      proximas.splice(indice, 2, value + proxima);
      onChange(proximas.join("\n"));
      setAtiva({ indice, cursor: value.length });
    } else if (event.key === "ArrowUp" && indice > 0 && naPrimeiraLinhaVisual(alvo)) {
      event.preventDefault();
      setAtiva({ indice: indice - 1, cursor: selectionStart });
    } else if (
      event.key === "ArrowDown" &&
      indice < linhas.length - 1 &&
      naUltimaLinhaVisual(alvo)
    ) {
      event.preventDefault();
      setAtiva({ indice: indice + 1, cursor: selectionStart });
    }
    // Ctrl+Z e os outros atalhos do palco não chegam aqui: `isTyping` os barra.
    event.stopPropagation();
  }

  return (
    <div
      className="min-h-full cursor-text"
      // Clique abaixo da última linha: cursor no fim do documento.
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const ultima = linhas.length - 1;
        setAtiva({ indice: ultima, cursor: (linhas[ultima] ?? "").length });
      }}
    >
      {linhas.map((linha, indice) =>
        ativa?.indice === indice ? (
          <textarea
            key="ativa"
            ref={campo}
            rows={1}
            value={linha}
            aria-label="Linha em edição"
            className="text-foreground block w-full resize-none overflow-hidden bg-transparent font-mono text-[0.95em] outline-none"
            onChange={(event) => trocar(indice, event.target.value)}
            onKeyDown={teclas}
            onBlur={() => setAtiva(null)}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : (
          <div
            key={indice}
            className="hover:bg-foreground/5 -mx-1 rounded px-1"
            onClick={(event) => {
              event.stopPropagation();
              setAtiva({ indice, cursor: linha.length });
            }}
          >
            <LinhaMarkdown linha={linha} />
          </div>
        ),
      )}
    </div>
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
function linhasVisuais(alvo: HTMLTextAreaElement): number {
  const altura = parseFloat(getComputedStyle(alvo).lineHeight) || 1;
  return Math.round(alvo.scrollHeight / altura);
}
