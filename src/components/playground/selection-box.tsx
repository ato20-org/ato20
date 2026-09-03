"use client";

import { useSceneScale } from "@/components/playground/scene-stage";
import { boundsToBox, type Bounds } from "@/lib/geometry/bounds";

/** Acima dos itens, abaixo do gizmo de item único. */
const SELECTION_Z = 9_000;

/**
 * Contorno da seleção múltipla. Sem alças de propósito: redimensionar e girar
 * em grupo é operação de item único aqui — mover, apagar, ordenar e alinhar
 * funcionam em grupo, o resto se faz um por um.
 */
export function SelectionBox({ bounds }: { bounds: Bounds }) {
  const { scale } = useSceneScale();
  const box = boundsToBox(bounds);

  return (
    <div
      className="border-primary pointer-events-none absolute border-dashed"
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderWidth: 1.5 / scale,
        zIndex: SELECTION_Z,
      }}
    />
  );
}
