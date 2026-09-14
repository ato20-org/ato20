"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { TransformHandles } from "@/components/playground/transform-handles";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { CORNER_HANDLES } from "@/lib/geometry/transform";
import { clampViewport } from "@/lib/geometry/viewport";
import type { Viewport } from "@/types/scene";

/** Acima do gizmo de seleção: a câmera é a camada de enquadramento. */
const FRAME_Z = 12_000;
const HANDLES_Z = 12_500;

/** Espessura da faixa de arraste nas bordas, em pixels de tela. */
const GRIP_PX = 14;

type CameraFrameProps = {
  camera: Viewport;
  /** Ausente = moldura só informativa, sem arraste nem alças. */
  onChange?: (camera: Viewport) => void;
};

/**
 * O recorte que a mesa está vendo, manipulável direto no palco.
 *
 * Sem esta moldura, o Mestre ampliado num canto do mapa não tem como saber
 * que a TV continua enquadrando outra região — e ele acabaria apontando para
 * algo que ninguém está olhando.
 *
 * O interior é atravessável pelo clique de propósito: a região enquadrada é
 * justamente onde estão os itens que o mestre mexe, e uma moldura opaca ao
 * ponteiro tornaria todos eles inalcançáveis. O que agarra são as bordas, o
 * rótulo e os quatro cantos.
 */
export function CameraFrame({ camera, onChange }: CameraFrameProps) {
  const { scale } = useSceneScale();
  const startDrag = useSceneDrag();

  /** Pixels de tela convertidos para unidades de cena. */
  const px = (value: number) => value / scale;

  function startMove(event: ReactPointerEvent) {
    if (!onChange) return;

    // Retrato no início do gesto: o delta vem acumulado desde o pointerdown.
    const origin = { x: camera.x, y: camera.y };

    startDrag(event, {
      onMove: (delta) =>
        onChange(
          clampViewport({
            ...camera,
            x: origin.x + delta.x,
            y: origin.y + delta.y,
          }),
        ),
    });
  }

  const grip = px(GRIP_PX);
  const gripClass = onChange
    ? "pointer-events-auto absolute touch-none"
    : "pointer-events-none absolute";

  return (
    <>
      <div
        className="border-primary/70 pointer-events-none absolute border-dashed"
        style={{
          left: camera.x,
          top: camera.y,
          width: camera.width,
          height: camera.height,
          borderWidth: px(2),
          zIndex: FRAME_Z,
        }}
      >
        {/* Faixas nas bordas: a única parte da moldura que responde ao
            ponteiro, além do rótulo e dos cantos. */}
        {onChange
          ? (
              [
                { left: 0, top: 0, width: "100%", height: grip },
                { left: 0, bottom: 0, width: "100%", height: grip },
                { left: 0, top: 0, width: grip, height: "100%" },
                { right: 0, top: 0, width: grip, height: "100%" },
              ] as const
            ).map((position, index) => (
              <span
                key={index}
                className={gripClass}
                style={{ ...position, cursor: "move" }}
                onPointerDown={startMove}
              />
            ))
          : null}

        <span
          className={`bg-primary/80 text-primary-foreground font-medium ${gripClass}`}
          style={{
            left: 0,
            top: 0,
            fontSize: px(12),
            padding: `${px(2)}px ${px(5)}px`,
            cursor: onChange ? "move" : undefined,
          }}
          onPointerDown={startMove}
        >
          câmera
        </span>
      </div>

      {onChange ? (
        <TransformHandles
          box={{ ...camera, rotation: 0 }}
          rotatable={false}
          // Só os cantos, e proporção travada por regra: um recorte fora de
          // 16:9 faria cada visão letterboxar diferente, e o enquadramento
          // deixaria de ser o que a mesa vê.
          handles={CORNER_HANDLES}
          keepAspect
          // A moldura já tem a própria borda tracejada.
          outline={false}
          // Sem arredondar: `clampViewport` re-deriva a altura da largura, e o
          // resíduo do arredondamento faria a moldura derivar meia unidade por
          // gesto, sempre para o mesmo lado.
          round={false}
          zIndex={HANDLES_Z}
          onChange={({ x, y, width, height }) =>
            onChange(
              clampViewport({
                x: x ?? camera.x,
                y: y ?? camera.y,
                width: width ?? camera.width,
                height: height ?? camera.height,
              }),
            )
          }
        />
      ) : null}
    </>
  );
}
