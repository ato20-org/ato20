import { paraCena } from "@/lib/geometry/area-escondida";
import {
  daTelaAoPlano,
  projetar,
  type CameraOrbital,
  type Tela,
} from "@/lib/geometry/camera-orbital";
import {
  alturaDaParede,
  faixaDaLinha,
  GROSSURA_DA_LINHA,
  ladoMinimoDaParede,
  METROS_DA_PAREDE_PADRAO,
  paredeDeVerdade,
  segmentosDaParede,
  UNIDADES_POR_METRO,
} from "@/lib/geometry/sombra";
import {
  resizeItem,
  type ItemBox,
  type ResizeHandle,
  type Vec,
} from "@/lib/geometry/transform";
import { profundidadeNaVista } from "@/lib/geometry/volume";
import type { Parede } from "@/types/scene";

/**
 * A parede na mão do 2.5D: onde o clique a acerta, e o que as alças fazem com
 * ela.
 *
 * Conta pura, como a da peça (`peca-de-esguelha.ts`). A parede de esguelha não
 * recebe ponteiro -- as faces e a laje são inertes, ver `ChaoInclinado` --, então
 * quem pergunta "cliquei numa parede?" é a geometria, com a mesma câmera que a
 * desenha.
 */

type Camera = { camera: CameraOrbital; tela: Tela };

/** As oito alças da caixa, na ordem do contorno. */
export const ALCAS_DA_CAIXA: ResizeHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/** Onde cada alça mora na caixa, em fração da largura e da altura. */
const FRACAO_DA_ALCA: Record<ResizeHandle, Vec> = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
};

/**
 * A menor linha que a ponta deixa sobrar, em unidades de cena. Um, e não zero:
 * as pontas coladas são uma linha sem direção, que não se pega de volta. Ver
 * `ladoMinimoDaParede`.
 */
const LINHA_MINIMA = 1;

/** A parede mais baixa que a alça de altura deixa, em unidades de cena. */
const ALTURA_MINIMA = UNIDADES_POR_METRO / 10;

/** O passo da altura no arrasto: cinco centímetros. */
const PASSO_DA_ALTURA = UNIDADES_POR_METRO / 20;

/**
 * O que sobe do chão: a faixa da `linha`, ou o contorno das outras.
 *
 * A mesma pegada que o `ChaoInclinado` ergue -- a linha em caixa da grossura da
 * laje dela (ver `facesDaParede`) --, para o clique acertar o que se vê.
 */
export function pegadasDaParede(parede: Parede): Vec[][] {
  if (!paredeDeVerdade(parede)) return [];
  if (parede.formato === "linha") {
    return faixaDaLinha(parede, GROSSURA_DA_LINHA);
  }

  const segmentos = segmentosDaParede(parede);
  return segmentos.length >= 3
    ? [segmentos.map((segmento) => ({ x: segmento.x1, y: segmento.y1 }))]
    : [];
}

/** Par-ímpar na tela: o mesmo de `pontoNaParede`, para polígono projetado. */
function dentro(ponto: Vec, poligono: Vec[]): boolean {
  let achou = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i, i += 1) {
    const a = poligono[i]!;
    const b = poligono[j]!;
    if (
      a.y > ponto.y !== b.y > ponto.y &&
      ponto.x < ((b.x - a.x) * (ponto.y - a.y)) / (b.y - a.y) + a.x
    )
      achou = !achou;
  }
  return achou;
}

/** Uma parede acertada, e a altura do plano em que a mão a pegou. */
export type ParedeNaMira = { parede: Parede; plano: number };

/**
 * A parede sob um pixel da tela, a mais PERTO quando há várias.
 *
 * O prisma inteiro conta: o topo (se a parede é coberta) e as faces de TODOS os
 * lados, as de costas incluídas -- a união delas é a silhueta, e o que está na
 * silhueta é a parede que o mestre está vendo ali. O pátio não tem topo: o
 * clique no miolo dele é chão.
 *
 * "Mais perto" pela profundidade que ordena a pintura (`profundidadeNaVista`),
 * para quem ganha o clique ser quem foi pintado por cima.
 *
 * `plano` é onde a mão a pegou: no topo, a altura dela; numa face, o meio. É o
 * plano em que o arrasto se mede depois, para a parede andar sob o cursor e não
 * sob o chão atrás dela.
 */
export function paredeSobOPixel(
  paredes: ReadonlyArray<Parede>,
  { camera, tela }: Camera,
  pixel: Vec,
): ParedeNaMira | null {
  let melhor: ParedeNaMira | null = null;
  let maisPerto = -Infinity;

  for (const parede of paredes) {
    const altura = alturaDaParede(parede);
    const coberta = parede.formato === "linha" || !parede.semTeto;
    let plano: number | null = null;

    for (const pegada of pegadasDaParede(parede)) {
      const baixo: Vec[] = [];
      const alto: Vec[] = [];
      for (const ponto of pegada) {
        const noChao = projetar(camera, tela, ponto, 0);
        const noTopo = projetar(camera, tela, ponto, altura);
        if (!noChao || !noTopo) break;
        baixo.push(noChao);
        alto.push(noTopo);
      }
      // Um canto atrás do olho: a parede está passando pela câmera, e o
      // polígono projetado não diz mais nada.
      if (baixo.length !== pegada.length) continue;

      if (coberta && dentro(pixel, alto)) {
        plano = altura;
        break;
      }
      for (let i = 0; i < pegada.length; i += 1) {
        const j = (i + 1) % pegada.length;
        if (dentro(pixel, [baixo[i]!, baixo[j]!, alto[j]!, alto[i]!])) {
          plano = altura / 2;
          break;
        }
      }
      if (plano !== null) break;
    }

    if (plano === null) continue;
    const perto = profundidadeNaVista(
      parede.x + parede.width / 2,
      parede.y + parede.height / 2,
      camera.giro,
    );
    if (perto > maisPerto) {
      maisPerto = perto;
      melhor = { parede, plano };
    }
  }

  return melhor;
}

/** Onde uma alça da caixa está no chão. */
export function alcaNaCena(parede: Parede, alca: ResizeHandle): Vec {
  const fracao = FRACAO_DA_ALCA[alca];
  return paraCena(parede, {
    x: fracao.x * parede.width,
    y: fracao.y * parede.height,
  });
}

/**
 * A caixa depois de a alça andar `delta` no chão, com a oposta parada. É a
 * conta do gizmo do 2D (`resizeItem`), e a caixa é a verdade da parede nos
 * formatos fechados: o laço e a elipse escalam junto com ela.
 */
export function caixaRedimensionada(
  parede: Parede,
  alca: ResizeHandle,
  delta: Vec,
  manterProporcao: boolean,
): ItemBox {
  return resizeItem(
    {
      x: parede.x,
      y: parede.y,
      width: parede.width,
      height: parede.height,
      rotation: parede.rotation ?? 0,
    },
    alca,
    delta,
    { keepAspect: manterProporcao, minimo: ladoMinimoDaParede(parede) },
  );
}

/** As duas pontas da `linha`, ou `null` se ela não tem traço. */
export function pontasDaLinha(parede: Parede): [Vec, Vec] | null {
  const [segmento] = segmentosDaParede(parede);
  if (!segmento) return null;
  return [
    { x: segmento.x1, y: segmento.y1 },
    { x: segmento.x2, y: segmento.y2 },
  ];
}

/**
 * A `linha` de `a` a `b`, como a parede a escreve: a caixa entre as pontas e
 * a diagonal que liga uma à outra, sem giro. A mesma conta de `paredeDaPorta`.
 *
 * `null` se as pontas ficaram perto demais: uma linha de zero não se pega de
 * volta.
 */
export function linhaEntre(
  a: Vec,
  b: Vec,
): Pick<Parede, "x" | "y" | "width" | "height" | "rotation" | "diagonal"> | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < LINHA_MINIMA) return null;

  return {
    x: Math.round(Math.min(a.x, b.x)),
    y: Math.round(Math.min(a.y, b.y)),
    width: Math.round(Math.abs(dx)),
    height: Math.round(Math.abs(dy)),
    rotation: undefined,
    diagonal: dx * dy < 0 ? "secundaria" : undefined,
  };
}

/** Entre o canto da caixa e o anel de giro, em unidades de cena. */
const FOLGA_DO_GIRO = 14;

/** O passo do giro com Shift, em graus: o mesmo da peça e do 2D. */
export const PASSO_DO_GIRO = 15;

/** O raio do anel de giro: por fora dos cantos, para não cair nas alças. */
export function raioDoGiro(parede: Parede): number {
  return Math.hypot(parede.width, parede.height) / 2 + FOLGA_DO_GIRO;
}

function normalizar(graus: number): number {
  return ((graus % 360) + 360) % 360;
}

/**
 * Para onde a alça de giro aponta no anel, em graus: o "alto" da caixa, como
 * a alça de giro do 2D, que fica acima da borda de cima. Na `linha`, de través
 * do traço -- as pontas já são alças.
 */
export function anguloDaAlcaDeGiro(parede: Parede): number {
  if (parede.formato === "linha") {
    const pontas = pontasDaLinha(parede);
    if (pontas) {
      const [a, b] = pontas;
      return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI - 90;
    }
  }
  return (parede.rotation ?? 0) - 90;
}

/**
 * A parede girada `delta` graus em volta do meio, desde como ela estava.
 *
 * A caixa gira pelo `rotation`, que é o giro do gizmo do 2D: o laço e a elipse
 * giram junto, e a parede não sai do lugar. A `linha` gira as PONTAS em volta
 * do meio e se reescreve sem giro (`linhaEntre`), como as alças das pontas.
 *
 * Com `comPasso`, o ângulo FINAL cai no múltiplo de 15 mais perto -- e não o
 * quanto girou: é o que põe a parede no eixo.
 */
export function paredeGirada(
  parede: Parede,
  delta: number,
  comPasso: boolean,
): Partial<Parede> | null {
  const passo = (graus: number) =>
    comPasso ? Math.round(graus / PASSO_DO_GIRO) * PASSO_DO_GIRO : graus;

  if (parede.formato !== "linha") {
    const giro = normalizar(passo((parede.rotation ?? 0) + delta));
    return { rotation: Math.round(giro * 100) / 100 };
  }

  const pontas = pontasDaLinha(parede);
  if (!pontas) return null;
  const [a, b] = pontas;
  const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const meioComprimento = Math.hypot(b.x - a.x, b.y - a.y) / 2;
  const angulo =
    (passo((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + delta) * Math.PI) /
    180;
  const lado = {
    x: Math.cos(angulo) * meioComprimento,
    y: Math.sin(angulo) * meioComprimento,
  };

  return linhaEntre(
    { x: meio.x - lado.x, y: meio.y - lado.y },
    { x: meio.x + lado.x, y: meio.y + lado.y },
  );
}

/** O meio da caixa no chão: onde a alça de altura sobe. */
export function meioDaParede(parede: Parede): Vec {
  return { x: parede.x + parede.width / 2, y: parede.y + parede.height / 2 };
}

/**
 * A altura nova, dado quanto a mão andou na tela desde `inicio`.
 *
 * Mede a vertical da parede NA TELA -- o quanto um passo de altura sobe em
 * pixels ali, com a perspectiva daquele ponto -- e projeta o arrasto nela. É o
 * que faz a alça subir com o cursor em qualquer giro, inclusive de cima, onde a
 * vertical encolhe.
 *
 * Em `undefined` quando cai na altura padrão, como o controle do 2D escreve:
 * a parede de dois metros não precisa de campo na cena.
 */
export function alturaPeloArrasto(
  { camera, tela }: Camera,
  parede: Parede,
  alturaInicial: number,
  inicio: Vec,
  agora: Vec,
): number | undefined | null {
  const base = meioDaParede(parede);
  const regua = Math.max(alturaInicial, UNIDADES_POR_METRO);
  const embaixo = projetar(camera, tela, base, 0);
  const emcima = projetar(camera, tela, base, regua);
  if (!embaixo || !emcima) return null;

  const porUnidade = {
    x: (emcima.x - embaixo.x) / regua,
    y: (emcima.y - embaixo.y) / regua,
  };
  const quadrado = porUnidade.x ** 2 + porUnidade.y ** 2;
  // De prumo, a parede não tem vertical na tela: não há o que medir.
  if (quadrado < 1e-6) return null;

  const andou =
    ((agora.x - inicio.x) * porUnidade.x + (agora.y - inicio.y) * porUnidade.y) /
    quadrado;
  const altura = Math.max(ALTURA_MINIMA, alturaInicial + andou);
  const metros =
    Math.round(altura / PASSO_DA_ALTURA) * (PASSO_DA_ALTURA / UNIDADES_POR_METRO);
  const redondo = Math.round(metros * 100) / 100;

  return redondo === METROS_DA_PAREDE_PADRAO
    ? undefined
    : redondo * UNIDADES_POR_METRO;
}

/** O ponto do plano a `altura` sob um pixel. Ver `daTelaAoPlano`. */
export function noPlano(
  { camera, tela }: Camera,
  pixel: Vec,
  altura: number,
): Vec | null {
  return daTelaAoPlano(camera, tela, pixel, altura);
}
