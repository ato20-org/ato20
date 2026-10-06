import { anguloDoFacho } from "@/lib/geometry/luz";
import type { Vec } from "@/lib/geometry/transform";
import { CONE_DA_LANTERNA, type CanvasItem } from "@/types/scene";

/**
 * Onde uma peça está no chão de esguelha, para quem a pega com a mão: o gizmo
 * do Mestre (`SelecaoDeEsguelha`) e o dedo do jogador (`AlcasDeEsguelha`).
 */

/** O pé da figura em pé, onde o `ChaoInclinado` a põe. Ver `PecaDoChao`. */
export function peDe(item: CanvasItem): Vec {
  return { x: item.x + item.width / 2, y: item.y + item.width };
}

export function centroDe(item: CanvasItem): Vec {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 };
}

/**
 * Em volta de onde a peça gira, no chão: o pé da que está em pé, o meio da
 * deitada.
 */
export function pivoDe(item: CanvasItem): Vec {
  return item.deitado ? centroDe(item) : peDe(item);
}

/** O raio do anel do olhar, no chão, em unidades de cena. */
export function raioDoAnel(item: CanvasItem): number {
  return item.deitado
    ? Math.max(item.width, item.height) * 0.65
    : Math.max(item.width, 24) * 0.9;
}

/**
 * Para onde a figura olha, em graus no sentido do sol. É o facho da lanterna
 * dela, ou o padrão do facho quando não há lanterna: girar o olhar aqui é o
 * mesmo `rotation` do 2D, que é o que leva o facho junto. Ver `anguloDoFacho`.
 */
export function olharDe(item: CanvasItem): number {
  return anguloDoFacho(
    item,
    item.luz?.cone?.angulo ?? CONE_DA_LANTERNA.angulo,
  );
}

/** Os quatro cantos da peça deitada no chão, no giro dela. */
export function cantosDeitado(item: CanvasItem): Vec[] {
  const centro = centroDe(item);
  const giro = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(giro);
  const sen = Math.sin(giro);
  const meia = { x: item.width / 2, y: item.height / 2 };
  return [
    { x: -meia.x, y: -meia.y },
    { x: meia.x, y: -meia.y },
    { x: meia.x, y: meia.y },
    { x: -meia.x, y: meia.y },
  ].map(({ x, y }) => ({
    x: centro.x + x * cos - y * sen,
    y: centro.y + x * sen + y * cos,
  }));
}
