import type { Bounds } from "@/lib/geometry/bounds";
import { itemCenter, normalizeAngle, rotateVec, type Vec } from "@/lib/geometry/transform";
import type { CanvasItem } from "@/types/scene";

export type ItemPatch = { id: string; patch: Partial<CanvasItem> };

/**
 * Escala uma seleção inteira de `from` para `to`.
 *
 * A escala é **uniforme** por necessidade, não por preferência: um item girado
 * escalado de forma diferente em cada eixo precisaria de cisalhamento, e o
 * modelo (`x`, `y`, `width`, `height`, `rotation`) não sabe representar isso.
 * Com escala uniforme, girado ou não, o resultado continua descritível.
 *
 * Como tudo escala uniformemente em torno do canto de `from`, a caixa
 * envolvente do grupo escala junto — é o que faz o gizmo bater com o conteúdo.
 */
export function scaleGroup(items: CanvasItem[], from: Bounds, to: Bounds): ItemPatch[] {
  const width = from.maxX - from.minX;
  const height = from.maxY - from.minY;
  // Grupo sem área não tem como definir fator; devolver vazio é melhor que
  // dividir por zero e espalhar NaN pelo board.
  if (width <= 0 || height <= 0) return [];

  const factor = (to.maxX - to.minX) / width;

  return items.map((item) => ({
    id: item.id,
    patch: {
      x: Math.round(to.minX + (item.x - from.minX) * factor),
      y: Math.round(to.minY + (item.y - from.minY) * factor),
      width: Math.round(item.width * factor),
      height: Math.round(item.height * factor),
    },
  }));
}

/**
 * Gira uma seleção inteira em torno de um ponto.
 *
 * Cada item ganha duas coisas: o centro dele orbita o ponto, e o próprio giro
 * dele aumenta no mesmo ângulo. Só orbitar deixaria as peças apontando para o
 * lado errado; só girar cada uma no lugar não moveria o grupo.
 */
export function rotateGroup(items: CanvasItem[], center: Vec, degrees: number): ItemPatch[] {
  return items.map((item) => {
    const own = itemCenter(item);
    const orbit = rotateVec({ x: own.x - center.x, y: own.y - center.y }, degrees);

    return {
      id: item.id,
      patch: {
        x: Math.round(center.x + orbit.x - item.width / 2),
        y: Math.round(center.y + orbit.y - item.height / 2),
        rotation: Math.round(normalizeAngle(item.rotation + degrees)),
      },
    };
  });
}

export function boundsCenter(bounds: Bounds): Vec {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

export function boundsFromBox(box: { x: number; y: number; width: number; height: number }): Bounds {
  return {
    minX: box.x,
    minY: box.y,
    maxX: box.x + box.width,
    maxY: box.y + box.height,
  };
}
