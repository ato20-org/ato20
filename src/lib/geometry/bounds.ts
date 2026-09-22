import { itemCenter, rotateVec, type ItemBox, type Vec } from "@/lib/geometry/transform";

/** Retângulo alinhado aos eixos, em coordenadas de cena. */
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Qualquer coisa com caixa e giro: o item de cena e a forma do quadro.
 *
 * Estrutural e não `CanvasItem`, porque a forma tem a mesma geometria e nenhum
 * dos campos de imagem -- e é isso que a deixa passar pelas mesmas contas de
 * seleção, gizmo e grupo.
 */
export type CaixaGirada = ItemBox & { rotation: number };

/**
 * Caixa alinhada aos eixos que envolve o item **já rotacionado**. Usar
 * `x/y/width/height` cru daria a caixa antes do giro, e a área de seleção
 * erraria em qualquer item torto.
 */
export function itemBounds(item: CaixaGirada): Bounds {
  const center = itemCenter(item);
  const halfWidth = item.width / 2;
  const halfHeight = item.height / 2;

  const corners: Vec[] = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((corner) => rotateVec(corner, item.rotation));

  const xs = corners.map((corner) => center.x + corner.x);
  const ys = corners.map((corner) => center.y + corner.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Bounds de uma caixa alinhada aos eixos — usado pela área escondida, que não gira. */
export function boxBounds(box: ItemBox): Bounds {
  return {
    minX: box.x,
    minY: box.y,
    maxX: box.x + box.width,
    maxY: box.y + box.height,
  };
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (list.length === 0) return null;

  return list.reduce((acc, current) => ({
    minX: Math.min(acc.minX, current.minX),
    minY: Math.min(acc.minY, current.minY),
    maxX: Math.max(acc.maxX, current.maxX),
    maxY: Math.max(acc.maxY, current.maxY),
  }));
}

export function boundsOfItems(items: CaixaGirada[]): Bounds | null {
  return unionBounds(items.map(itemBounds));
}

export function boundsFromPoints(a: Vec, b: Vec): Bounds {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

export function translateBounds(bounds: Bounds, dx: number, dy: number): Bounds {
  return {
    minX: bounds.minX + dx,
    minY: bounds.minY + dy,
    maxX: bounds.maxX + dx,
    maxY: bounds.maxY + dy,
  };
}

/** Interseção, não contenção: tocar o item já o inclui na seleção. */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function boundsToBox(bounds: Bounds): ItemBox {
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}
