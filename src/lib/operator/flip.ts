import type { CanvasItem } from "@/types/scene";

export type FlipAxis = "x" | "y";

/**
 * Patches para espelhar uma seleção.
 *
 * Alterna item por item em vez de aplicar um valor comum: com vários
 * selecionados, definir todos como espelhados desfaria o espelho de quem já
 * estava virado, e o mestre veria metade da seleção "desespelhar" ao clicar.
 *
 * Item travado fica de fora, pela mesma razão que não é arrastável.
 */
export function flipPatches(
  items: CanvasItem[],
  axis: FlipAxis,
): Array<{ id: string; patch: Partial<CanvasItem> }> {
  const field = axis === "x" ? "flipX" : "flipY";

  return items
    .filter((item) => !item.locked)
    .map((item) => ({ id: item.id, patch: { [field]: !item[field] } }));
}
