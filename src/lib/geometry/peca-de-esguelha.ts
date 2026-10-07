import { anguloDoFacho } from "@/lib/geometry/luz";
import type { Vec } from "@/lib/geometry/transform";
import { apoioDoPe } from "@/lib/geometry/volume";
import { CONE_DA_LANTERNA, type CanvasItem, type Parede } from "@/types/scene";

/**
 * Onde uma peça está no chão de esguelha, para quem a pega com a mão: o gizmo
 * do Mestre (`SelecaoDeEsguelha`) e o dedo do jogador (`AlcasDeEsguelha`).
 */

/** O pé da figura em pé, onde o `ChaoInclinado` a põe. Ver `PecaDoChao`. */
export function peDe(item: CanvasItem): Vec {
  return { x: item.x + item.width / 2, y: item.y + item.width };
}

/**
 * Quanto o pé da peça em pé está acima do chão: a altura da parede coberta em
 * que ela pisa, ou zero. A deitada fica no piso. Ver `apoioDoPe`.
 *
 * Quem desenha a peça e quem a acompanha -- o gizmo, o nome sobre a cabeça, a
 * alça do jogador -- perguntam aqui, para concordarem sobre onde ela está.
 */
export function sobeDe(
  item: CanvasItem,
  paredes: ReadonlyArray<Parede> | undefined,
): number {
  return item.deitado ? 0 : (apoioDoPe(paredes, peDe(item))?.altura ?? 0);
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
export function olharDe(
  item: Pick<CanvasItem, "rotation" | "flipX" | "flipY" | "luz">,
): number {
  return anguloDoFacho(
    item,
    item.luz?.cone?.angulo ?? CONE_DA_LANTERNA.angulo,
  );
}

/**
 * A figura em pé sai espelhada na tela? O `flipX` dela, trocado quando ela
 * espelha pelo olhar e o olhar aponta para a ESQUERDA da tela. Ver
 * `CanvasItem.espelharPeloOlhar`.
 *
 * "Esquerda da tela" é o sinal do `x` do olhar depois do giro da câmera: a
 * mesma conta de `lateralNaVista`, que para uma direção de ângulo `a` dá
 * `cos(a + giro)`. Girar o token ou a câmera passa o olhar para o outro lado,
 * e a figura vira junto.
 *
 * O olhar é o do facho, com o espelho dentro (`olharDe`). Com o cone padrão
 * -- 90°, para baixo na figura -- espelhar não o muda, e é por isso que o
 * `flipX` fica livre para dizer só de que lado a arte olha.
 */
export function espelhadaPeloOlhar(
  item: Pick<
    CanvasItem,
    "flipX" | "flipY" | "rotation" | "luz" | "espelharPeloOlhar" | "deitado"
  >,
  giro: number,
): boolean {
  const manual = Boolean(item.flipX);
  if (!item.espelharPeloOlhar || item.deitado) return manual;

  return manual !== olhaParaEsquerda(olharDe(item), giro);
}

/**
 * Um olhar de `olhar` graus no mapa aponta para a esquerda da tela, com a
 * câmera em `giro`? Ver `espelhadaPeloOlhar`.
 */
export function olhaParaEsquerda(olhar: number, giro: number): boolean {
  return Math.cos(((olhar + giro) * Math.PI) / 180) < 0;
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
