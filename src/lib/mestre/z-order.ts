import type { CanvasItem } from "@/types/scene";

export type ZDirection = "front" | "back" | "forward" | "backward";

/** Reescreve `z` como posição na pilha: sem buracos, sem empate. */
function normalizeZ(items: CanvasItem[]): CanvasItem[] {
  return items.map((item, index) => ({ ...item, z: index + 1 }));
}

/**
 * Nova pilha de itens depois de mover os selecionados.
 *
 * Função pura sobre a lista inteira em vez de aritmética em `z` solto: com
 * vários itens selecionados, somar ou subtrair `z` individualmente produz
 * empates e inversões silenciosas.
 */
/**
 * Move um item para uma posição exata da lista **frente-primeiro**.
 *
 * O painel de camadas mostra a frente no topo, então o índice que ele conhece
 * é o inverso do índice em `z` crescente. A conversão mora aqui para o
 * componente não ter que acertar o sentido — trocá-lo é o erro clássico.
 */
export function moveItemToFrontFirstIndex(
  items: CanvasItem[],
  itemId: string,
  frontFirstIndex: number,
): CanvasItem[] {
  const ascending = [...items].sort((a, b) => a.z - b.z);
  const from = ascending.findIndex((item) => item.id === itemId);
  if (from < 0) return items;

  const target = Math.min(Math.max(frontFirstIndex, 0), ascending.length - 1);
  // Frente-primeiro conta do fim para o começo da ordem de `z`.
  const to = ascending.length - 1 - target;
  if (to === from) return items;

  const moving = ascending[from]!;
  ascending.splice(from, 1);
  ascending.splice(to, 0, moving);

  return normalizeZ(ascending);
}

export function reorderByZ(
  items: CanvasItem[],
  movingIds: string[],
  direction: ZDirection,
): CanvasItem[] {
  if (movingIds.length === 0) return items;

  const moving = new Set(movingIds);
  const ordered = [...items].sort((a, b) => a.z - b.z);

  if (direction === "front" || direction === "back") {
    const selected = ordered.filter((item) => moving.has(item.id));
    const rest = ordered.filter((item) => !moving.has(item.id));

    return normalizeZ(
      direction === "front" ? [...rest, ...selected] : [...selected, ...rest],
    );
  }

  const step = direction === "forward" ? 1 : -1;
  const indices = ordered.flatMap((item, index) =>
    moving.has(item.id) ? [index] : [],
  );
  // Andar de fora para dentro: começar pelo item mais distante da borda de
  // destino faria dois selecionados trocarem de lugar entre si.
  const walk = step === 1 ? [...indices].reverse() : indices;

  for (const index of walk) {
    const target = index + step;
    if (target < 0 || target >= ordered.length) continue;
    // Não pular por cima de outro selecionado: o grupo anda junto, mantendo
    // a ordem relativa interna.
    if (moving.has(ordered[target].id)) continue;

    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  }

  return normalizeZ(ordered);
}
