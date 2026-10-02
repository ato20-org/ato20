/**
 * O duplo clique contado à mão, a partir do `pointerdown`.
 *
 * O palco não pode ouvir o `dblclick` do navegador: o arrasto do item faz
 * `preventDefault` no `pointerdown` -- é o que impede o gesto de arrastar
 * seleção de texto --, e no WebKitGTK isso suprime os eventos de mouse que vêm
 * depois, o `click` entre eles. Ver `mantemClique` em `useSceneDrag`. Então o
 * próprio `pointerdown` conta: dois no mesmo alvo, perto no tempo e no espaço.
 */

/** Um toque: em quem, quando e onde, em pixels de tela. */
export type Toque = { alvo: string; t: number; x: number; y: number };

/**
 * O intervalo entre os dois toques. Abaixo do padrão dos sistemas (500 ms) de
 * propósito: dois cliques rápidos para escolher e logo arrastar o mesmo token
 * não podem virar uma ficha aberta por cima do mapa.
 */
export const INTERVALO_DO_DUPLO_MS = 400;

/** Quanto o ponteiro pode andar entre os dois. Mais que isso é outro gesto. */
export const FOLGA_DO_DUPLO_PX = 6;

/** O segundo toque fecha um duplo clique com o primeiro? */
export function ehDuploClique(anterior: Toque | null, agora: Toque): boolean {
  if (!anterior || anterior.alvo !== agora.alvo) return false;

  const passou = agora.t - anterior.t;

  return (
    passou >= 0 &&
    passou <= INTERVALO_DO_DUPLO_MS &&
    Math.hypot(agora.x - anterior.x, agora.y - anterior.y) <= FOLGA_DO_DUPLO_PX
  );
}
