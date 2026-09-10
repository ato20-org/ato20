import type { Vec } from "@/lib/geometry/transform";
import { SCENE_HEIGHT, SCENE_WIDTH, type Viewport } from "@/types/scene";

/** Plano inteiro: o enquadramento padrão de toda visão. */
export const FULL_VIEWPORT: Viewport = {
  x: 0,
  y: 0,
  width: SCENE_WIDTH,
  height: SCENE_HEIGHT,
};

/** Recorte mínimo, ou seja, ampliação máxima. */
export const MAX_ZOOM = 8;

const ASPECT = SCENE_HEIGHT / SCENE_WIDTH;
const MIN_WIDTH = SCENE_WIDTH / MAX_ZOOM;

/**
 * Quanto o recorte pode passar das bordas do plano, em unidades de cena.
 *
 * Antes não podia nada: o deslocamento parava na beirada do mapa, e o preto em
 * volta era só letterbox — espaço que existia na tela e não podia ser
 * alcançado. Isso apertava justamente quem trabalha nas bordas, e ficou visível
 * quando as notas dos pontos de anotação passaram a poder ser estacionadas fora
 * do mapa: dava para pôr o cartão ali e não dava para chegar nele.
 *
 * Um plano inteiro de folga para cada lado, o que dá uma área de trabalho de
 * três planos por três. Não é infinito de verdade, e não deveria ser: o
 * recorte é o que o botão de enquadrar manda para a mesa, e um limite mantém
 * esse número dentro de algo que a TV consegue mostrar. É folga demais para
 * incomodar e pouca o bastante para não virar um vazio sem fundo.
 *
 * Perder o mapa de vista aqui é recuperável num clique: o botão da porcentagem
 * volta ao plano inteiro.
 */
export const FOLGA_X = SCENE_WIDTH;
export const FOLGA_Y = SCENE_HEIGHT;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Ajusta o recorte para algo exibível: proporção do plano, dentro dos limites
 * de ampliação e dentro do plano mais a folga.
 *
 * A proporção é derivada da largura, nunca aceita da entrada: um recorte fora
 * de 16:9 faria cada visão letterboxar de um jeito diferente, e o
 * enquadramento que o mestre escolheu deixaria de ser o que a mesa vê.
 */
export function clampViewport({ x, y, width }: Viewport): Viewport {
  const clampedWidth = clamp(width, MIN_WIDTH, SCENE_WIDTH);
  const clampedHeight = clampedWidth * ASPECT;

  return {
    // A folga entra nas duas pontas: à esquerda do zero e depois do fim do
    // plano. Ver `FOLGA_X`.
    x: clamp(x, -FOLGA_X, SCENE_WIDTH - clampedWidth + FOLGA_X),
    y: clamp(y, -FOLGA_Y, SCENE_HEIGHT - clampedHeight + FOLGA_Y),
    width: clampedWidth,
    height: clampedHeight,
  };
}

/** `factor > 1` aproxima. O ponto `anchor` fica parado na tela. */
export function zoomViewport(viewport: Viewport, factor: number, anchor: Vec): Viewport {
  const width = clamp(viewport.width / factor, MIN_WIDTH, SCENE_WIDTH);
  const height = width * ASPECT;

  // Fração do recorte em que a âncora está. Preservá-la é o que faz o zoom
  // acontecer sob o cursor, em vez de puxar a cena para o centro.
  const ratioX = (anchor.x - viewport.x) / viewport.width;
  const ratioY = (anchor.y - viewport.y) / viewport.height;

  return clampViewport({
    x: anchor.x - ratioX * width,
    y: anchor.y - ratioY * height,
    width,
    height,
  });
}

export function panViewport(viewport: Viewport, dx: number, dy: number): Viewport {
  return clampViewport({ ...viewport, x: viewport.x + dx, y: viewport.y + dy });
}

/** Ampliação atual, onde 1 é o plano inteiro. */
export function viewportZoom(viewport: Viewport): number {
  return SCENE_WIDTH / viewport.width;
}

export function isFullViewport(viewport: Viewport): boolean {
  return viewport.width >= SCENE_WIDTH;
}

/**
 * Recentra o recorte num ponto do plano, sem mudar a ampliação.
 *
 * Serve a busca de pontos de anotação: escolher um da lista tem de levar a
 * vista até ele, e mudar o zoom no caminho tiraria o mestre do enquadramento
 * em que ele estava trabalhando.
 *
 * O `clampViewport` cuida das bordas, então um ponto no canto do mapa fica
 * visível sem ficar centrado — que é o certo: centrar de verdade exigiria
 * mostrar área fora do plano.
 */
export function centerViewportOn(viewport: Viewport, point: Vec): Viewport {
  return clampViewport({
    ...viewport,
    x: point.x - viewport.width / 2,
    y: point.y - viewport.height / 2,
  });
}

/** Zoom mantendo o centro parado — é o que os botões de + e - fazem. */
export function zoomViewportCentered(viewport: Viewport, factor: number): Viewport {
  return zoomViewport(viewport, factor, {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  });
}
