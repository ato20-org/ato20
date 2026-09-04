"use client";

import { memo, type PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { portraitBox } from "@/lib/geometry/portrait";
import { cn } from "@/lib/utils";
import type { Portrait, Viewport } from "@/types/scene";

/**
 * Acima da névoa.
 *
 * Retrato é HUD, não cenário: coberto pelo bloco preto de uma área escondida
 * ele leria como bug, não como recurso.
 */
const PORTRAIT_Z = 6_000;

type PortraitLayerProps = {
  portraits: Portrait[];
  /** Recorte atual da câmera. É o espaço em que o retrato vive. */
  camera?: Viewport;
  /** `operator` mostra os que estão fora do ar, em fantasma. */
  variant: "operator" | "viewer";
  smooth?: boolean;
  onPortraitPointerDown?: (event: ReactPointerEvent, portrait: Portrait) => void;
};

/**
 * Os retratos sobre a cena.
 *
 * Vive dentro do plano como qualquer outra camada, mas a posição sai da
 * câmera: `portraitBox` converte fração em coordenada de cena. O efeito é o
 * retrato ficar parado enquanto o mapa se move por baixo dele.
 */
export function PortraitLayer({
  portraits,
  camera,
  variant,
  smooth = false,
  onPortraitPointerDown,
}: PortraitLayerProps) {
  const isOperator = variant === "operator";

  return (
    <>
      {portraits.map((portrait, index) => {
        // Fora do ar, a mesa não vê nada. O mestre continua vendo, apagado,
        // senão não teria como posicionar antes de mostrar.
        if (!portrait.visible && !isOperator) return null;

        return (
          <PortraitView
            key={portrait.id}
            portrait={portrait}
            camera={camera}
            // Ordem da lista é a ordem de empilhamento: o mais novo na frente.
            depth={index}
            ghost={isOperator && !portrait.visible}
            interactive={Boolean(onPortraitPointerDown)}
            smooth={smooth}
            onPointerDown={onPortraitPointerDown}
          />
        );
      })}
    </>
  );
}

type PortraitViewProps = {
  portrait: Portrait;
  camera?: Viewport;
  depth: number;
  ghost: boolean;
  interactive: boolean;
  smooth: boolean;
  onPointerDown?: (event: ReactPointerEvent, portrait: Portrait) => void;
};

const PortraitView = memo(function PortraitView({
  portrait,
  camera,
  depth,
  ghost,
  interactive,
  smooth,
  onPointerDown,
}: PortraitViewProps) {
  const url = useAssetUrl(portrait.assetId);
  const { scale } = useSceneScale();
  const box = portraitBox(portrait, camera);

  return (
    <div
      data-portrait-id={portrait.id}
      className={cn(
        "absolute top-0 left-0",
        interactive && "touch-none cursor-move",
        // Apagado e pontilhado: diz "existe, mas a mesa não está vendo" sem
        // precisar de legenda.
        ghost && "opacity-40 outline-dashed outline-white/40",
        smooth && "scene-smooth-item scene-item-in",
      )}
      style={{
        transform: `translate(${box.x}px, ${box.y}px)`,
        width: box.width,
        height: box.height,
        zIndex: PORTRAIT_Z + depth,
        // Espessura em pixel de tela: dividida pelo scale, o contorno tem a
        // mesma grossura aparente em qualquer zoom.
        outlineWidth: ghost ? 1.5 / scale : undefined,
      }}
      onPointerDown={onPointerDown ? (event) => onPointerDown(event, portrait) : undefined}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          // `object-contain`: retrato deformado é pior que retrato pequeno, e
          // aqui a proporção é a do arquivo, não a da caixa.
          className={cn(
            "size-full object-contain select-none",
            portrait.framed &&
              "rounded-md bg-black/40 ring-1 ring-white/25 shadow-lg shadow-black/60",
          )}
          style={portrait.flipX ? { transform: "scaleX(-1)" } : undefined}
        />
      ) : null}
    </div>
  );
});
