"use client";

import { useSceneScale } from "@/components/playground/scene-stage";
import type { Guide } from "@/lib/geometry/snap";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

/** Acima de tudo: a linha guia não serve se ficar atrás do item arrastado. */
const GUIDE_Z = 11_000;

/** Linhas de alinhamento durante o arrasto. Atravessam o plano inteiro. */
export function AlignmentGuides({ guides }: { guides: Guide[] }) {
  const { scale } = useSceneScale();
  const thickness = 1 / scale;

  return (
    <>
      {guides.map((guide) => (
        <div
          key={`${guide.axis}:${guide.position}`}
          className="bg-primary pointer-events-none absolute"
          style={
            guide.axis === "x"
              ? {
                  left: guide.position - thickness / 2,
                  top: 0,
                  width: thickness,
                  height: SCENE_HEIGHT,
                  zIndex: GUIDE_Z,
                }
              : {
                  left: 0,
                  top: guide.position - thickness / 2,
                  width: SCENE_WIDTH,
                  height: thickness,
                  zIndex: GUIDE_Z,
                }
          }
        />
      ))}
    </>
  );
}
