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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Ajusta o recorte para algo exibível: proporção do plano, dentro dos limites
 * de ampliação e sem sair das bordas.
 *
 * A proporção é derivada da largura, nunca aceita da entrada: um recorte fora
 * de 16:9 faria cada visão letterboxar de um jeito diferente, e o
 * enquadramento que o mestre escolheu deixaria de ser o que a mesa vê.
 */
export function clampViewport({ x, y, width }: Viewport): Viewport {
  const clampedWidth = clamp(width, MIN_WIDTH, SCENE_WIDTH);
  const clampedHeight = clampedWidth * ASPECT;

  return {
    x: clamp(x, 0, SCENE_WIDTH - clampedWidth),
    y: clamp(y, 0, SCENE_HEIGHT - clampedHeight),
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

/** Zoom mantendo o centro parado — é o que os botões de + e - fazem. */
export function zoomViewportCentered(viewport: Viewport, factor: number): Viewport {
  return zoomViewport(viewport, factor, {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  });
}
