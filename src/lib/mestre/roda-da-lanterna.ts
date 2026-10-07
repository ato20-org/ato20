import { anguloNaFigura } from "@/lib/geometry/luz";
import { centroDe, olharDe } from "@/lib/geometry/peca-de-esguelha";
import type { Vec } from "@/lib/geometry/transform";
import {
  ALCANCE_MAXIMO_DA_LANTERNA,
  ALCANCE_MINIMO_DA_LANTERNA,
} from "@/lib/mestre/item-actions";
import {
  CONE_DA_LANTERNA,
  type CanvasItem,
  type LuzCarregada,
} from "@/types/scene";

/**
 * A roda da lanterna no 2D: a conta, fora do componente.
 *
 * Um bico só, como a ponta do cone da luz cravada: em volta do token ele mira
 * a LANTERNA, e para longe ou para perto ele muda o ALCANCE. O token não gira:
 * o que muda é o `cone.angulo`, o lado da figura para onde o facho sai -- e,
 * com ele, para onde ela olha no 2.5D (ver `olharDe`). O desenho fica como
 * está.
 */

/** O passo da mira com Shift, em graus no mapa: o da roda do 2.5D. */
const PASSO_DA_MIRA = 15;

/**
 * Quanto a mão tem de girar para a lanterna em círculo virar facho, em graus.
 *
 * Mirar é o gesto de quem quer um cone -- `apontarLanterna` já pensa assim --,
 * mas puxar o bico para fora só para alcançar mais treme alguns graus, e isso
 * não pode virar cone o círculo de ninguém.
 */
export const LIMIAR_PARA_APONTAR = 10;

/** Do centro do token até a borda dele, no lado maior. */
export function meioDoToken(item: Pick<CanvasItem, "width" | "height">) {
  return Math.max(item.width, item.height) / 2;
}

/**
 * Onde o bico fica, em cena: na borda do alcance, para onde o token olha.
 *
 * Nunca dentro do token: com alcance curto num token grande o bico cairia em
 * cima do desenho, onde o toque é do arrasto do token. `folga` é o quanto ele
 * fica de fora, já em unidade de cena.
 */
export function bicoDaRoda(item: CanvasItem, folga: number): Vec {
  const centro = centroDe(item);
  const olhar = (olharDe(item) * Math.PI) / 180;
  const distancia = Math.max(item.luz?.raio ?? 0, meioDoToken(item) + folga);

  return {
    x: centro.x + Math.cos(olhar) * distancia,
    y: centro.y + Math.sin(olhar) * distancia,
  };
}

/**
 * Quanto a mão girou em volta de `pivo`, de `inicio` até `aqui`, em graus
 * entre -180 e 180. O caminho curto: passar do 359 ao 1 é girar 2, e não 358.
 */
export function giroEmVolta(pivo: Vec, inicio: Vec, aqui: Vec): number {
  const angulo = (ponto: Vec) =>
    (Math.atan2(ponto.y - pivo.y, ponto.x - pivo.x) * 180) / Math.PI;
  const giro = angulo(aqui) - angulo(inicio);

  return ((((giro + 180) % 360) + 360) % 360) - 180;
}

/** O `giroEmVolta` do centro do token, que é de onde a lanterna sai no 2D. */
export function giroDaMao(item: CanvasItem, inicio: Vec, aqui: Vec): number {
  return giroEmVolta(centroDe(item), inicio, aqui);
}

/**
 * A lanterna do token mirada `giro` graus além de para onde ele olha agora.
 *
 * O token NÃO gira: o que muda é o `cone.angulo`, o lado da figura de onde o
 * facho sai. É a mira das duas rodas, a do 2D e a do 2.5D. Shift encaixa a
 * mira de quinze em quinze graus NO MAPA, que é o que o mestre vê.
 *
 * A lanterna em círculo só vira facho com `apontar`, que quem arrasta liga
 * quando a mão passa do `LIMIAR_PARA_APONTAR`; antes disso ela volta como
 * está. A abertura é a de sempre, ver `CONE_DA_LANTERNA`. `null` sem lanterna.
 */
export function miraDaLanterna(
  item: CanvasItem,
  giro: number,
  { encaixar, apontar }: { encaixar: boolean; apontar: boolean },
): LuzCarregada | null {
  if (!item.luz) return null;
  if (!item.luz.cone && !apontar) return item.luz;

  let mira = olharDe(item) + giro;
  if (encaixar) mira = Math.round(mira / PASSO_DA_MIRA) * PASSO_DA_MIRA;
  const cone = item.luz.cone ?? CONE_DA_LANTERNA;

  return {
    ...item.luz,
    cone: { ...cone, angulo: Math.round(anguloNaFigura(item, mira)) % 360 },
  };
}

/**
 * A lanterna depois de a mão andar de `inicio` até `aqui`, em cena: a mira em
 * volta do token (`miraDaLanterna`), e o alcance para longe ou para perto.
 *
 * Os dois RELATIVOS ao começo do gesto, e não absolutos: pegar o bico um pouco
 * fora do centro dele -- ou fora do alcance, quando ele está na folga -- não
 * pode dar um tranco na mira nem no alcance.
 *
 * O alcance fica entre `ALCANCE_MINIMO_DA_LANTERNA` e o teto de desempenho,
 * `ALCANCE_MAXIMO_DA_LANTERNA`.
 */
export function passoDaRoda(
  item: CanvasItem,
  inicio: Vec,
  aqui: Vec,
  opcoes: { encaixar: boolean; apontar: boolean },
): Pick<CanvasItem, "luz"> | null {
  const mirada = miraDaLanterna(item, giroDaMao(item, inicio, aqui), opcoes);
  if (!item.luz || !mirada) return null;

  const centro = centroDe(item);
  const distancia = (ponto: Vec) =>
    Math.hypot(ponto.x - centro.x, ponto.y - centro.y);

  const raio = Math.min(
    ALCANCE_MAXIMO_DA_LANTERNA,
    Math.max(
      ALCANCE_MINIMO_DA_LANTERNA,
      item.luz.raio + distancia(aqui) - distancia(inicio),
    ),
  );

  return { luz: { ...mirada, raio: Math.round(raio) } };
}
