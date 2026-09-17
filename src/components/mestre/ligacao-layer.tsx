"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import {
  PontaDeSeta,
  SETA_TRACO_PX,
  SETA_ROTULO_PX,
  SetaSvg,
} from "@/components/playground/quadro-mesa-layer";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import type { Vec } from "@/lib/geometry/transform";
import {
  ancorada,
  pontaEm,
  pontasDe,
  setasDe,
  type Seta,
} from "@/lib/mestre/ligacoes";
import { LIGACAO_Z, useQuadroStore } from "@/lib/store/use-quadro-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Ligacao,
  type PontaDeLigacao,
  type Scene,
} from "@/types/scene";

/** Largura da faixa invisível que recebe o clique, em pixels de tela. */
const ALVO_PX = 14;
/** Diâmetro da alça de cada ponta, em pixels de tela. */
const ALCA_PX = 10;

/**
 * As setas do quadro, a que está sendo puxada, e as alças da selecionada.
 *
 * Um `<svg>` só, em coordenadas de cena, como o `PinTethers`: dentro do palco
 * uma unidade do `viewBox` é uma unidade de cena, e a seta acompanha zoom e
 * deslocamento sem conta de projeção. As pontas saem de `pontasDe`, lidas da
 * cena a cada render -- mover o postit já move a seta ancorada nele.
 *
 * Como no Excalidraw: a seta selecionada mostra uma alça em cada ponta, e
 * arrastar a alça leva a ponta; soltar sobre uma coisa do quadro ancora nela,
 * soltar no vazio deixa a ponta livre ali. A alça ancorada é cheia, a livre é
 * vazada -- é o que diz de relance quem acompanha o postit e quem não.
 *
 * Ponta e espessura em pixel de tela, divididos pela escala: uma seta que
 * engordasse no zoom viraria faixa; uma que afinasse sumiria.
 */
export function LigacaoLayer({ scene }: { scene: Scene }) {
  const { scale, toScene } = useSceneScale();
  const tool = useToolStore((state) => state.tool);
  const previa = useQuadroStore((state) => state.previa);
  const selecionadaId = useQuadroStore((state) => state.ligacaoSelecionadaId);
  const selecionar = useQuadroStore((state) => state.selecionarLigacao);

  const updateLigacao = useSceneStore((state) => state.updateLigacao);
  const startDrag = useSceneDrag();

  // Antes do retorno cedo: hook não pode ficar atrás de `return null`.
  const pontaComum = useId();
  const pontaViva = useId();
  const [editandoRotuloId, setEditandoRotuloId] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editandoRotuloId) campo.current?.focus();
  }, [editandoRotuloId]);

  /**
   * A ponta em arrasto, enquanto o mestre a leva: qual seta, qual lado e onde
   * está. Local, e não na cena: a cena só recebe a ponta quando ela é solta,
   * e é aí que se decide se ancora ou fica livre.
   */
  const [levando, setLevando] = useState<{
    ligacaoId: string;
    lado: "de" | "para";
    ate: Vec;
  } | null>(null);

  const ligacoes = scene.ligacoes ?? [];
  const puxando =
    previa && tool === "ligacao" ? pontasDe(scene, previa.de, previa.ate) : null;

  if (ligacoes.length === 0 && !puxando) return null;

  const px = (valor: number) => valor / scale;

  const setas = setasDe(scene).map((seta) =>
    levando && seta.ligacao.id === levando.ligacaoId
      ? comPontaLevada(scene, seta, levando.lado, levando.ate)
      : seta,
  );
  const editando = setas.find(({ ligacao }) => ligacao.id === editandoRotuloId);
  const selecionada = setas.find(({ ligacao }) => ligacao.id === selecionadaId);

  function levarPonta(
    event: React.PointerEvent,
    ligacao: Ligacao,
    lado: "de" | "para",
  ) {
    if (event.button !== 0) return;
    startDrag(event, {
      onMove: (_delta, native) =>
        setLevando({
          ligacaoId: ligacao.id,
          lado,
          ate: toScene(native.clientX, native.clientY),
        }),
      onEnd: (native) => {
        setLevando(null);
        const ponto = toScene(native.clientX, native.clientY);
        updateLigacao(scene.id, ligacao.id, { [lado]: pontaEm(scene, ponto) });
      },
    });
  }

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        style={{ zIndex: LIGACAO_Z }}
        width={SCENE_WIDTH}
        height={SCENE_HEIGHT}
        aria-hidden
      >
        <defs>
          {/* Duas pontas: a da seta comum e a da selecionada. Ids únicos por
              `<svg>`: a prévia da mesa pode estar montada ao lado. */}
          <PontaDeSeta id={pontaComum} escala={scale} className="fill-foreground/70" />
          <PontaDeSeta id={pontaViva} escala={scale} className="fill-primary" />
        </defs>

        {setas.map((seta) => {
          const { ligacao, a, b } = seta;
          const viva = ligacao.id === selecionadaId;

          return (
            <g key={ligacao.id}>
              {/* A faixa larga e invisível é o que recebe o clique: uma linha
                  de 2px é impossível de acertar. `pointer-events: stroke`
                  para o meio da faixa contar e o resto do svg não. */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={px(ALVO_PX)}
                className={cn(
                  "pointer-events-auto",
                  tool === "ligacao" ? "cursor-crosshair" : "cursor-pointer",
                )}
                style={{ pointerEvents: "stroke" }}
                onPointerDown={(event) => {
                  // Com a seta na mão o clique é do palco, que começa outra
                  // seta dali; uma seta não é âncora de seta.
                  if (tool === "ligacao") return;
                  event.stopPropagation();
                  selecionar(ligacao.id);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setEditandoRotuloId(ligacao.id);
                }}
              />
              <SetaSvg
                seta={seta}
                escala={scale}
                ponta={viva ? pontaViva : pontaComum}
                className={viva ? "stroke-primary" : "stroke-foreground/70"}
                // O rótulo some enquanto o campo dele está aberto no mesmo lugar.
                rotulo={editandoRotuloId !== ligacao.id}
              />
            </g>
          );
        })}

        {/* As alças da selecionada, por cima de todas as setas. Cheia quando a
            ponta está ancorada, vazada quando está livre. */}
        {selecionada && tool !== "ligacao"
          ? (["de", "para"] as const).map((lado) => {
              const ponto = lado === "de" ? selecionada.a : selecionada.b;
              const presa = ancorada(selecionada.ligacao[lado]);
              return (
                <circle
                  key={lado}
                  cx={ponto.x}
                  cy={ponto.y}
                  r={px(ALCA_PX) / 2}
                  className={cn(
                    "pointer-events-auto cursor-move stroke-primary",
                    presa ? "fill-primary" : "fill-card",
                  )}
                  strokeWidth={px(2)}
                  onPointerDown={(event) =>
                    levarPonta(event, selecionada.ligacao, lado)
                  }
                />
              );
            })
          : null}

        {/* A seta sendo puxada: tracejada porque ainda não é. */}
        {puxando ? (
          <line
            x1={puxando.a.x}
            y1={puxando.a.y}
            x2={puxando.b.x}
            y2={puxando.b.y}
            className="stroke-primary/70"
            strokeWidth={px(SETA_TRACO_PX)}
            strokeDasharray={`${px(6)} ${px(6)}`}
            strokeLinecap="round"
            markerEnd={`url(#${pontaViva})`}
          />
        ) : null}
      </svg>

      {/* O campo do rótulo, em HTML e não em `<foreignObject>`: o WebKitGTK
          desenha foreignObject fora do lugar sob `zoom`. Centrado no meio da
          seta, em unidades de cena. */}
      {editando ? (
        <div
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: (editando.a.x + editando.b.x) / 2,
            top: (editando.a.y + editando.b.y) / 2,
            zIndex: LIGACAO_Z + 1,
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            ref={campo}
            className="bg-card text-foreground rounded border px-1 py-0.5 shadow outline-none"
            style={{ fontSize: px(SETA_ROTULO_PX), width: px(160) }}
            aria-label="Rótulo da seta"
            placeholder="o que esta seta diz"
            defaultValue={editando.ligacao.rotulo ?? ""}
            onBlur={(event) => {
              updateLigacao(scene.id, editando.ligacao.id, {
                rotulo: event.currentTarget.value,
              });
              setEditandoRotuloId(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = editando.ligacao.rotulo ?? "";
                event.currentTarget.blur();
              }
              event.stopPropagation();
            }}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * A seta com uma ponta no cursor, enquanto a alça é arrastada. A outra ponta
 * continua onde a cena diz, mas recalculada virada para o cursor -- uma ponta
 * ancorada encosta na borda do lado de quem a puxa.
 */
function comPontaLevada(
  scene: Scene,
  seta: Seta,
  lado: "de" | "para",
  ate: Vec,
): Seta {
  const livre: PontaDeLigacao = { x: ate.x, y: ate.y };
  const pontas =
    lado === "de"
      ? pontasDe(scene, livre, seta.ligacao.para)
      : pontasDe(scene, seta.ligacao.de, livre);
  return pontas ? { ...seta, ...pontas } : seta;
}
