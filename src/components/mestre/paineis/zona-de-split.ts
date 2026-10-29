import type { Alvo } from "@/lib/paineis";

/**
 * A zona de split sob o ponteiro, lida pelo atributo que `ZonasDeSplit`
 * desenha. Pelo que está DESENHADO no ponto, como os outros destinos de
 * arrasto: a zona só existe no meio do gesto, e fica por cima do que está
 * embaixo dela.
 */
export function zonaDeSplitSob(x: number, y: number, documento: Document = document): Alvo | null {
  // No documento do gesto: numa janela solta não há zona, e o ponto de lá
  // procurado no Mestre poderia cair numa por coincidência.
  const zona = documento
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-zona-de-split]");
  const painel = zona?.dataset.painel;
  const lado = zona?.dataset.zona;

  if (!painel || (lado !== "esquerda" && lado !== "direita" && lado !== "centro"))
    return null;

  return { painel, zona: lado };
}
