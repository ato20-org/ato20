"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { cn } from "@/lib/utils";
import type { FogRegion } from "@/types/scene";

/** Acima de todo item: a área escondida existe para cobrir o que está embaixo. */
const FOG_Z = 5_000;

type FogLayerProps = {
  fog: FogRegion[];
  /**
   * `operator` deixa o mestre ver através da área; `viewer` é preto sólido.
   * A máscara é visual: a Plateia recebe a imagem inteira e o bloco cobre por
   * cima. Serve para a mesa, não contra um jogador que abra o devtools.
   */
  variant: "operator" | "viewer";
  onFogPointerDown?: (event: ReactPointerEvent, region: FogRegion) => void;
};

export function FogLayer({ fog, variant, onFogPointerDown }: FogLayerProps) {
  const { scale } = useSceneScale();
  const isOperator = variant === "operator";

  return (
    <>
      {fog.map((region, index) => {
        // Revelada, a mesa não vê nada. O mestre continua vendo o contorno,
        // senão não teria como esconder a área de novo.
        if (region.revealed && !isOperator) return null;

        return (
          <div
            key={region.id}
            data-fog-id={region.id}
            className={cn(
              "absolute",
              isOperator && "touch-none",
              region.revealed
                ? "border-dashed border-white/25"
                : isOperator
                  ? "border-dashed border-white/40 bg-black/70"
                  : "bg-black",
            )}
            style={{
              left: region.x,
              top: region.y,
              width: region.width,
              height: region.height,
              zIndex: FOG_Z,
              borderWidth: isOperator ? 1.5 / scale : 0,
              cursor: onFogPointerDown ? "move" : undefined,
            }}
            onPointerDown={onFogPointerDown ? (event) => onFogPointerDown(event, region) : undefined}
          >
            {isOperator ? (
              <span
                className="absolute font-medium text-white/60"
                style={{ left: 4 / scale, top: 2 / scale, fontSize: 11 / scale }}
              >
                {index + 1}
              </span>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
