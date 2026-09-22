"use client";

import { useSceneScale } from "@/components/playground/scene-stage";
import { boundsToBox, type Bounds } from "@/lib/geometry/bounds";
import { cn } from "@/lib/utils";

const MARQUEE_Z = 9_500;

/**
 * Retângulo de arrasto da área de seleção.
 *
 * `redondo` existe para a área escondida em elipse: a prévia é a FORMA, como na
 * forma do quadro -- quem arrasta um círculo e vê um retângulo não sabe onde a
 * curva vai passar.
 */
export function MarqueeBox({
  bounds,
  redondo = false,
}: {
  bounds: Bounds;
  redondo?: boolean;
}) {
  const { scale } = useSceneScale();
  const box = boundsToBox(bounds);

  return (
    <div
      className={cn(
        "border-primary bg-primary/15 pointer-events-none absolute",
        redondo && "rounded-[50%]",
      )}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderWidth: 1 / scale,
        zIndex: MARQUEE_Z,
      }}
    />
  );
}
