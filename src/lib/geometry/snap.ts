import type { Bounds } from "@/lib/geometry/bounds";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

/** Linha de referência mostrada durante o arrasto. */
export type Guide = { axis: "x" | "y"; position: number };

export type SnapResult = {
  /** Correção a somar ao delta do arrasto. */
  dx: number;
  dy: number;
  guides: Guide[];
};

/** Distância de atração, em pixels de tela (dividida pelo scale do palco). */
export const SNAP_THRESHOLD_PX = 6;

const NO_SNAP: SnapResult = { dx: 0, dy: 0, guides: [] };

/** Bordas e centro: as três posições que valem alinhar num eixo. */
function edgesX({ minX, maxX }: Bounds): number[] {
  return [minX, (minX + maxX) / 2, maxX];
}

function edgesY({ minY, maxY }: Bounds): number[] {
  return [minY, (minY + maxY) / 2, maxY];
}

/** Melhor par (borda que se move, borda de destino) dentro do limite. */
function bestOffset(moving: number[], targets: number[], threshold: number) {
  let offset = 0;
  let position = 0;
  let distance = threshold;

  for (const from of moving) {
    for (const to of targets) {
      const candidate = Math.abs(to - from);
      if (candidate < distance) {
        distance = candidate;
        offset = to - from;
        position = to;
      }
    }
  }

  return distance < threshold ? { offset, position } : null;
}

/**
 * Atração do item em movimento às bordas e centros dos outros itens e do
 * próprio plano de cena. Cada eixo resolve sozinho: um item pode grudar em X
 * e continuar livre em Y.
 */
export function computeSnap(
  moving: Bounds,
  targets: Bounds[],
  threshold: number,
): SnapResult {
  if (threshold <= 0) return NO_SNAP;

  // O plano é sempre candidato: alinhar ao centro da tela é o caso mais comum
  // de todos numa mesa de RPG.
  const targetsX = [0, SCENE_WIDTH / 2, SCENE_WIDTH, ...targets.flatMap(edgesX)];
  const targetsY = [0, SCENE_HEIGHT / 2, SCENE_HEIGHT, ...targets.flatMap(edgesY)];

  const x = bestOffset(edgesX(moving), targetsX, threshold);
  const y = bestOffset(edgesY(moving), targetsY, threshold);

  const guides: Guide[] = [];
  if (x) guides.push({ axis: "x", position: x.position });
  if (y) guides.push({ axis: "y", position: y.position });

  return { dx: x?.offset ?? 0, dy: y?.offset ?? 0, guides };
}
