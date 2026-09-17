"use client";

import { useCallback, useEffect, useRef } from "react";
import { AArrowDown, AArrowUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  TextoView,
  tipografiaDoTexto,
} from "@/components/playground/quadro-mesa-layer";
import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { useQuadroStore, TEXTO_Z } from "@/lib/store/use-quadro-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import type { Scene, Texto } from "@/types/scene";

/**
 * Os textos soltos do quadro. Irmã do `PostitLayer`, e fora do `SceneLayer`
 * pela mesma razão: é anotação do mestre até a cena ir ao ar como quadro.
 *
 * Bem mais simples que o postit de propósito: sem menção, sem cor, sem alça
 * de tamanho. Um texto é letra na folha -- duplo clique escreve, arrasto
 * move, Delete apaga. O que quer mais que isso é postit.
 */
export function TextoLayer({
  scene,
  panMode,
}: {
  scene: Scene;
  /** Espaço segurado: o arrasto pertence ao deslocamento da cena. */
  panMode: boolean;
}) {
  const textos = scene.textos;
  if (!textos || textos.length === 0) return null;

  return textos.map((texto) => (
    <TextoSolto
      key={texto.id}
      sceneId={scene.id}
      texto={texto}
      panMode={panMode}
    />
  ));
}

/**
 * Os tamanhos que o A− e o A+ percorrem, em unidades de cena. Degraus e não um
 * campo numérico: o que se quer é "maior" e "menor", não 43.
 */
const TAMANHOS = [16, 20, 24, 32, 40, 56, 72, 96, 128, 160] as const;

function vizinho(tamanho: number, sentido: 1 | -1): number {
  const indice = TAMANHOS.findIndex((t) => t >= tamanho);
  const atual = indice === -1 ? TAMANHOS.length - 1 : indice;
  const proximo = Math.min(Math.max(atual + sentido, 0), TAMANHOS.length - 1);
  return TAMANHOS[proximo]!;
}

function TextoSolto({
  sceneId,
  texto,
  panMode,
}: {
  sceneId: string;
  texto: Texto;
  panMode: boolean;
}) {
  const { scale, ampliacaoNoLayout } = useSceneScale();
  const startDrag = useSceneDrag();
  const tool = useToolStore((state) => state.tool);

  const updateTexto = useSceneStore((state) => state.updateTexto);
  const removeTexto = useSceneStore((state) => state.removeTexto);

  const editando = useQuadroStore((state) => state.textoEditandoId === texto.id);
  const selecionado = useQuadroStore(
    (state) => state.textoSelecionadoId === texto.id,
  );
  const editar = useQuadroStore((state) => state.editarTexto);
  const selecionar = useQuadroStore((state) => state.selecionarTexto);

  const campo = useRef<HTMLTextAreaElement | null>(null);

  // Ver `tipografiaDoTexto`: pixel de tela sob `zoom`, pelo piso de 9px do WebKit.
  const { medida, estilo: tipografia } = tipografiaDoTexto(
    texto,
    scale,
    ampliacaoNoLayout,
  );

  // Lê o texto atual do store, e não da prop: o ouvinte do documento abaixo
  // é instalado uma vez por edição, e a prop que ele fechou seria a do
  // primeiro render.
  const fechar = useCallback(() => {
    const quadro = useQuadroStore.getState();
    if (quadro.textoEditandoId !== texto.id) return;

    const atual = useSceneStore
      .getState()
      .board?.scenes.find((cena) => cena.id === sceneId)
      ?.textos?.find((candidato) => candidato.id === texto.id);

    // Texto que ficou vazio some: uma caixa invisível no quadro seria um alvo
    // de seta que ninguém vê.
    if (!atual?.texto.trim()) {
      removeTexto(sceneId, texto.id);
      quadro.editarTexto(null);
      return;
    }
    // Sai da edição mas FICA selecionado: apertar A+ na pílula tira o foco do
    // campo, e a pílula sumir junto deixaria o segundo A+ sem alvo.
    quadro.editarTexto(null);
    quadro.selecionarTexto(texto.id);
  }, [sceneId, texto.id, removeTexto]);

  const raiz = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editando) return;
    // No quadro seguinte, e não já: o texto nasce no MESMO pointerdown que o
    // criou, e o foco pedido dentro desse gesto era desfeito pelo padrão do
    // clique, que leva o foco para onde o mouse desceu.
    const quadro = requestAnimationFrame(() => {
      const alvo = campo.current;
      if (!alvo) return;
      alvo.focus();
      // Cursor no fim: quem reabre um texto quer continuar, não reescrever.
      alvo.setSelectionRange(alvo.value.length, alvo.value.length);
    });
    return () => cancelAnimationFrame(quadro);
  }, [editando]);

  /**
   * Clique fora fecha, como no postit: na captura e no documento, porque o
   * `blur` sozinho não vem quando o clique cai em algo que não toma foco, e o
   * palco é exatamente isso.
   */
  useEffect(() => {
    if (!editando) return;

    function foraDaqui(event: PointerEvent) {
      const alvo = event.target;
      if (alvo instanceof Node && raiz.current?.contains(alvo)) return;
      fechar();
    }

    document.addEventListener("pointerdown", foraDaqui, true);
    return () => document.removeEventListener("pointerdown", foraDaqui, true);
  }, [editando, fechar]);

  function arrastar(event: React.PointerEvent) {
    // Com a seta na mão, o clique é do palco: é ele que descobre o alvo.
    if (panMode || editando || tool === "ligacao") return;
    if (event.button !== 0) return;

    const origem = { x: texto.x, y: texto.y };
    selecionar(texto.id);

    startDrag(event, {
      mantemClique: true,
      onMove: (delta) =>
        updateTexto(sceneId, texto.id, {
          x: Math.round(origem.x + delta.x),
          y: Math.round(origem.y + delta.y),
        }),
    });
  }

  const linhas = texto.texto.split("\n");
  const maior = Math.max(1, ...linhas.map((linha) => linha.length));

  return (
    <div
      ref={raiz}
      className={cn(
        // `pointer-events-auto` porque o plano dos controles desliga o ponteiro.
        // Ver `PostitPapel`.
        "pointer-events-auto absolute",
        tool === "ligacao" ? "cursor-crosshair" : "cursor-move",
        // Contorno enquanto edita ou selecionado: um texto vazio em edição
        // não tem letra nenhuma para mostrar onde está.
        (editando || selecionado) && "ring-primary/60 rounded-sm ring-1",
      )}
      style={{ left: texto.x, top: texto.y, zIndex: TEXTO_Z, touchAction: "none" }}
      onPointerDown={arrastar}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (!panMode && tool !== "ligacao") editar(texto.id);
      }}
    >
      <div style={editando ? medida : undefined}>
        {editando ? (
          <textarea
            ref={campo}
            className="text-foreground block resize-none overflow-hidden bg-transparent whitespace-pre outline-none"
            style={tipografia}
            aria-label="Texto solto"
            placeholder="Escreva…"
            rows={linhas.length}
            // Nunca menor que o placeholder: vazio, a caixa de uma coluna
            // cortaria a dica e o texto pareceria não ter nascido.
            cols={Math.max(8, maior)}
            value={texto.texto}
            onChange={(event) =>
              updateTexto(sceneId, texto.id, { texto: event.target.value })
            }
            onPointerDown={(event) => event.stopPropagation()}
            onBlur={fechar}
            onKeyDown={(event) => {
              // Esc sai. Enter é quebra de linha: título de duas linhas é comum,
              // e sair da edição já tem o clique fora.
              if (event.key === "Escape") {
                event.preventDefault();
                fechar();
              }
              event.stopPropagation();
            }}
          />
        ) : null}
      </div>
      {editando ? null : <TextoView texto={texto} />}

      {/* A pílula de tamanho, acima do texto enquanto ele está na mão. Em
          pixel de tela: um botão que encolhesse com o zoom sumiria justo
          quando o mestre afasta o quadro para ver o título inteiro. */}
      {(editando || selecionado) && tool !== "ligacao" ? (
        <div
          className="absolute bottom-full left-0 mb-1"
          style={ampliacaoNoLayout ? emPixelDeTela(scale) : undefined}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div
            className="bg-background/90 flex items-center gap-0.5 rounded-md border p-0.5 shadow backdrop-blur"
            style={ampliacaoNoLayout ? undefined : { zoom: 1 / scale }}
          >
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Diminuir o texto"
              disabled={texto.tamanho <= TAMANHOS[0]}
              onClick={() =>
                updateTexto(sceneId, texto.id, {
                  tamanho: vizinho(texto.tamanho, -1),
                })
              }
            >
              <AArrowDown />
            </Button>
            <span className="text-muted-foreground min-w-6 text-center text-[10px] tabular-nums">
              {texto.tamanho}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Aumentar o texto"
              disabled={texto.tamanho >= TAMANHOS[TAMANHOS.length - 1]!}
              onClick={() =>
                updateTexto(sceneId, texto.id, {
                  tamanho: vizinho(texto.tamanho, 1),
                })
              }
            >
              <AArrowUp />
            </Button>
            <span className="bg-border mx-0.5 h-4 w-px" />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Apagar o texto"
              onClick={() => removeTexto(sceneId, texto.id)}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
