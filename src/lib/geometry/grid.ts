import type { SceneGrid } from "@/types/scene";

/**
 * Quantos metros vale um quadrado da grade.
 *
 * A convencao da mesa: um quadrado e um metro de lado, ou seja um metro
 * quadrado de chao. Constante e nao campo da cena porque a regra e do
 * APLICATIVO, nao de cada mapa -- e porque com ela fixa o mestre casa a grade
 * com o desenho do mapa e a medida sai certa de graca, em vez de ter de declarar
 * duas vezes a mesma coisa.
 *
 * Se um dia precisar virar campo -- pes por quadrado, ou dois metros --, e este
 * numero que sai daqui para dentro de `SceneGrid`, e as duas contas abaixo
 * passam a le-lo de la.
 */
export const METROS_POR_QUADRADO = 1;

/**
 * A distancia entre dois pontos da cena, em metros.
 *
 * Em linha reta, e nao contada em quadrados como algumas regras de mesa pedem:
 * a regua responde "quanto tem daqui ate ali", e quem joga com movimento por
 * quadrado le o numero e arredonda. Contar quadrados obrigaria a escolher entre
 * as tres formas de contar diagonal, o que e regra de sistema e nao de mapa.
 */
export function metrosEntre(
  de: { x: number; y: number },
  para: { x: number; y: number },
  grid: SceneGrid,
): number {
  return (Math.hypot(para.x - de.x, para.y - de.y) / grid.size) * METROS_POR_QUADRADO;
}

/** Formata para a etiqueta da regua: um decimal ate 10 m, inteiro acima. */
export function formatarMetros(metros: number): string {
  return metros < 10 ? `${metros.toFixed(1)} m` : `${Math.round(metros)} m`;
}
