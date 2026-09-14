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
   * `mestre` deixa o mestre ver através da área; `mesa` é preto sólido.
   * A máscara é visual: o Jogador recebe a imagem inteira e o bloco cobre por
   * cima. Serve para a mesa, não contra um jogador que abra o devtools.
   */
  variant: "mestre" | "mesa";
  /** Interpola o desaparecer da área e o ajuste de caixa. */
  smooth?: boolean;
  onFogPointerDown?: (event: ReactPointerEvent, region: FogRegion) => void;
};

export function FogLayer({
  fog,
  variant,
  smooth = false,
  onFogPointerDown,
}: FogLayerProps) {
  const { scale } = useSceneScale();
  const isOperator = variant === "mestre";

  return (
    <>
      {fog.map((region, index) => {
        // Revelada, a mesa não vê nada. O mestre continua vendo o contorno,
        // senão não teria como esconder a área de novo.
        //
        // Com suavização o bloco fica montado e transparente, em vez de sair
        // da árvore: desmontar mataria a transição, e o preto sumiria de um
        // frame para o outro — que é exatamente o corte que queremos evitar.
        const revealedToTable = region.revealed && !isOperator;
        if (revealedToTable && !smooth) return null;

        return (
          <div
            key={region.id}
            data-fog-id={region.id}
            className={cn(
              "absolute top-0 left-0",
              isOperator && "touch-none",
              region.revealed
                ? "border-dashed border-white/25"
                : isOperator
                  ? "border-dashed border-white/40 bg-black/70"
                  : "bg-black",
              smooth && "scene-smooth-fog",
              revealedToTable && "bg-black opacity-0",
            )}
            // `transform` em vez de `left/top`, pelo mesmo motivo do item: mover
            // a área não deve refazer o layout do plano.
            style={{
              transform: `translate(${region.x}px, ${region.y}px)`,
              width: region.width,
              height: region.height,
              zIndex: FOG_Z,
              borderWidth: isOperator ? 1.5 / scale : 0,
              cursor: onFogPointerDown ? "move" : undefined,
            }}
            onPointerDown={
              onFogPointerDown
                ? (event) => onFogPointerDown(event, region)
                : undefined
            }
          >
            {isOperator ? (
              <span
                className="absolute font-medium text-white/60"
                style={{
                  left: 4 / scale,
                  top: 2 / scale,
                  fontSize: 11 / scale,
                }}
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
