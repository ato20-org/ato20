"use client";

import { useSceneScale } from "@/components/playground/scene-stage";
import { boundsToBox, type Bounds } from "@/lib/geometry/bounds";

/** Acima dos itens, abaixo do gizmo de item único. */
const SELECTION_Z = 9_000;

/**
 * Contorno da seleção múltipla. Sem alças de propósito: redimensionar e girar
 * em grupo é operação de item único aqui — mover, apagar, ordenar e alinhar
 * funcionam em grupo, o resto se faz um por um.
 *
 * `rotulo` diz O QUE é o conjunto, quando isso não é óbvio. A fila de retratos
 * precisa: clicar num rosto passa a mexer nos cinco, e uma caixa pontilhada
 * sozinha não explica por que o clique alcançou os outros quatro.
 */
export function SelectionBox({ bounds, rotulo }: { bounds: Bounds; rotulo?: string }) {
  const { scale } = useSceneScale();
  const box = boundsToBox(bounds);

  /** Pixels de tela convertidos para unidades de cena. */
  const px = (valor: number) => valor / scale;

  return (
    <div
      className="border-primary pointer-events-none absolute border-dashed"
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderWidth: px(1.5),
        zIndex: SELECTION_Z,
      }}
    >
      {/* Acima da caixa e não dentro: dentro, ele cobriria o rosto de quem
          está na ponta esquerda da fila. Mesmo desenho do rótulo da câmera. */}
      {rotulo ? (
        <span
          className="bg-primary/80 text-primary-foreground pointer-events-none absolute font-medium"
          style={{
            left: 0,
            bottom: "100%",
            fontSize: px(12),
            padding: `${px(2)}px ${px(5)}px`,
          }}
        >
          {rotulo}
        </span>
      ) : null}
    </div>
  );
}
