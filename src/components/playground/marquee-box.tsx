"use client";

import { useSceneScale } from "@/components/playground/scene-stage";
import { boundsToBox, type Bounds } from "@/lib/geometry/bounds";

const MARQUEE_Z = 9_500;

/** Retângulo de arrasto da área de seleção. */
export function MarqueeBox({ bounds }: { bounds: Bounds }) {
  const { scale } = useSceneScale();
  const box = boundsToBox(bounds);

  return (
    <div
      className="border-primary bg-primary/15 pointer-events-none absolute"
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
