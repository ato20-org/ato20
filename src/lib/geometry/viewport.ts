import type { Bounds } from "@/lib/geometry/bounds";
import type { Vec } from "@/lib/geometry/transform";
import { SCENE_HEIGHT, SCENE_WIDTH, type Viewport } from "@/types/scene";

/** Plano inteiro: o enquadramento padrão de toda visão. */
export const FULL_VIEWPORT: Viewport = {
  x: 0,
  y: 0,
  width: SCENE_WIDTH,
  height: SCENE_HEIGHT,
};

/**
 * O plano, como caixa.
 *
 * É o PISO de tudo o que se mede aqui: o conteúdo de uma cena pode passar das
 * bordas do plano, nunca ficar aquém delas. Sem esse piso, uma cena vazia
 * encolheria a área de trabalho para nada, e os 100% do botão de porcentagem
 * deixariam de significar a mesma coisa em duas cenas diferentes.
 */
export const PLANO: Bounds = {
  minX: 0,
  minY: 0,
  maxX: SCENE_WIDTH,
  maxY: SCENE_HEIGHT,
};

/** Recorte mínimo, ou seja, ampliação máxima. */
export const MAX_ZOOM = 8;

const ASPECT = SCENE_HEIGHT / SCENE_WIDTH;

/**
 * Ampliação máxima ancorada no PLANO, e não no conteúdo: quanto dá para
 * aproximar é uma propriedade da régua em que as coisas estão desenhadas, e
 * não de quão espalhadas elas estão. Ancorar no conteúdo faria o mesmo token
 * aproximar mais numa cena cheia do que numa vazia.
 */
const MIN_WIDTH = SCENE_WIDTH / MAX_ZOOM;

/**
 * Quanto o recorte pode passar das bordas do conteúdo, em unidades de cena.
 *
 * Antes não podia nada: o deslocamento parava na beirada do mapa, e o preto em
 * volta era só letterbox — espaço que existia na tela e não podia ser
 * alcançado. Isso apertava justamente quem trabalha nas bordas, e ficou visível
 * quando as notas dos pontos de anotação passaram a poder ser estacionadas fora
 * do mapa: dava para pôr o cartão ali e não dava para chegar nele.
 *
 * Um plano inteiro de folga para cada lado. Com o conteúdo todo dentro do
 * plano isso dá a mesma área de trabalho de três planos por três que existia
 * quando este número era o limite inteiro, e não a margem dele — a mudança
 * para limites que acompanham o conteúdo não aperta nem afrouxa a cena comum.
 *
 * Não é infinito, e não deveria ser: a folga é o vazio em que ainda não há
 * nada, e ela ANDA com o que o mestre coloca. Largar uma imagem lá fora leva a
 * área junto, então o vazio nunca é uma parede — só nunca é um abismo.
 */
export const FOLGA_X = SCENE_WIDTH;
export const FOLGA_Y = SCENE_HEIGHT;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Preso entre dois valores, centrado quando não cabe.
 *
 * O `max` aqui é `borda - largura do recorte`, e ele fica MENOR que o `min`
 * quando o recorte é mais largo que a área — o que acontece com conteúdo alto
 * e estreito, porque o recorte é sempre 16:9 e precisa transbordar na
 * horizontal para conter a altura. Um `clamp` cru devolveria a ponta errada e
 * grudaria a vista na borda; o meio-termo é o enquadramento que a pessoa
 * espera de algo que não cabe.
 */
function presoNoEixo(value: number, min: number, max: number): number {
  return max < min ? (min + max) / 2 : clamp(value, min, max);
}

/** A área navegável: o conteúdo mais a folga de vazio em volta dele. */
export function comFolga(conteudo: Bounds): Bounds {
  return {
    minX: conteudo.minX - FOLGA_X,
    minY: conteudo.minY - FOLGA_Y,
    maxX: conteudo.maxX + FOLGA_X,
    maxY: conteudo.maxY + FOLGA_Y,
  };
}

/**
 * A largura de recorte que faz a caixa inteira caber, respeitada a proporção.
 *
 * Deriva da altura quando a caixa é mais alta que larga: o recorte é 16:9 e não
 * negocia, então conter uma caixa em pé custa largura sobrando nos lados.
 */
function larguraQueCabe(conteudo: Bounds): number {
  const largura = conteudo.maxX - conteudo.minX;
  const altura = conteudo.maxY - conteudo.minY;

  return Math.max(largura, altura / ASPECT, MIN_WIDTH);
}

/**
 * O recorte que mostra a caixa inteira, centrado nela. É o que o botão de
 * porcentagem faz.
 *
 * Com o conteúdo todo dentro do plano isto devolve exatamente `FULL_VIEWPORT`
 * — mesmo número, mesmo canto —, e é por isso que os 100% continuam sendo os
 * 100% de sempre na cena que nunca vazou.
 */
export function viewportQueCabe(conteudo: Bounds = PLANO): Viewport {
  const width = larguraQueCabe(conteudo);
  const height = width * ASPECT;

  return {
    x: (conteudo.minX + conteudo.maxX) / 2 - width / 2,
    y: (conteudo.minY + conteudo.maxY) / 2 - height / 2,
    width,
    height,
  };
}

/**
 * Ajusta o recorte para algo exibível: proporção do plano, dentro dos limites
 * de ampliação e dentro do conteúdo mais a folga.
 *
 * A proporção é derivada da largura, nunca aceita da entrada: um recorte fora
 * de 16:9 faria cada visão letterboxar de um jeito diferente, e o
 * enquadramento que o mestre escolheu deixaria de ser o que a mesa vê.
 *
 * `conteudo` ausente = o plano, que é o caso de toda visão que não é o palco do
 * Mestre: quem não edita não navega, só desenha a câmera que chegou.
 */
export function clampViewport(
  { x, y, width }: Viewport,
  conteudo: Bounds = PLANO,
): Viewport {
  const clampedWidth = clamp(width, MIN_WIDTH, larguraQueCabe(conteudo));
  const clampedHeight = clampedWidth * ASPECT;

  // A folga entra nas duas pontas, antes do começo do conteúdo e depois do fim
  // dele. Ver `FOLGA_X`.
  const navegavel = comFolga(conteudo);

  return {
    x: presoNoEixo(x, navegavel.minX, navegavel.maxX - clampedWidth),
    y: presoNoEixo(y, navegavel.minY, navegavel.maxY - clampedHeight),
    width: clampedWidth,
    height: clampedHeight,
  };
}

/** `factor > 1` aproxima. O ponto `anchor` fica parado na tela. */
export function zoomViewport(
  viewport: Viewport,
  factor: number,
  anchor: Vec,
  conteudo: Bounds = PLANO,
): Viewport {
  const width = clamp(
    viewport.width / factor,
    MIN_WIDTH,
    larguraQueCabe(conteudo),
  );
  const height = width * ASPECT;

  // Fração do recorte em que a âncora está. Preservá-la é o que faz o zoom
  // acontecer sob o cursor, em vez de puxar a cena para o centro.
  const ratioX = (anchor.x - viewport.x) / viewport.width;
  const ratioY = (anchor.y - viewport.y) / viewport.height;

  return clampViewport(
    {
      x: anchor.x - ratioX * width,
      y: anchor.y - ratioY * height,
      width,
      height,
    },
    conteudo,
  );
}

export function panViewport(
  viewport: Viewport,
  dx: number,
  dy: number,
  conteudo: Bounds = PLANO,
): Viewport {
  return clampViewport(
    { ...viewport, x: viewport.x + dx, y: viewport.y + dy },
    conteudo,
  );
}

/**
 * Ampliação atual, onde 1 é o PLANO — não o conteúdo.
 *
 * A referência é a régua, de propósito: 100% tem de querer dizer a mesma coisa
 * em toda cena, senão o número não compara nada. A consequência é que um
 * conteúdo espalhado além do plano mostra menos de 100% quando cabe inteiro, e
 * isso é a leitura certa: a vista está mais longe do que o plano inteiro.
 */
export function viewportZoom(viewport: Viewport): number {
  return SCENE_WIDTH / viewport.width;
}

/**
 * O recorte já mostra tudo o que existe — não há para onde afastar.
 *
 * A margem de meio pixel de cena existe porque a largura passa por divisões e
 * volta com sobra binária: comparar cru deixaria o botão de afastar aceso num
 * recorte que já está no limite, e clicá-lo não faria nada.
 */
export function cabeTudo(viewport: Viewport, conteudo: Bounds = PLANO): boolean {
  return viewport.width >= larguraQueCabe(conteudo) - 0.5;
}

/**
 * Recentra o recorte num ponto do plano, sem mudar a ampliação.
 *
 * Serve a busca de pontos de anotação: escolher um da lista tem de levar a
 * vista até ele, e mudar o zoom no caminho tiraria o mestre do enquadramento
 * em que ele estava trabalhando.
 *
 * O `clampViewport` cuida das bordas, então um ponto no canto da área fica
 * visível sem ficar centrado — que é o certo: centrar de verdade exigiria
 * mostrar área fora dela.
 */
export function centerViewportOn(
  viewport: Viewport,
  point: Vec,
  conteudo: Bounds = PLANO,
): Viewport {
  return clampViewport(
    {
      ...viewport,
      x: point.x - viewport.width / 2,
      y: point.y - viewport.height / 2,
    },
    conteudo,
  );
}

/** Zoom mantendo o centro parado — é o que os botões de + e - fazem. */
export function zoomViewportCentered(
  viewport: Viewport,
  factor: number,
  conteudo: Bounds = PLANO,
): Viewport {
  return zoomViewport(
    viewport,
    factor,
    {
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2,
    },
    conteudo,
  );
}
