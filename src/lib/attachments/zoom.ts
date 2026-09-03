/**
 * Zoom e deslocamento de uma imagem exibida em caixa fixa.
 *
 * Separado do `viewport` da cena de propósito: lá o recorte é em coordenadas
 * de cena e tem proporção obrigatória; aqui o assunto é uma imagem qualquer
 * dentro de um contêiner, e o estado é em pixels de tela.
 */
export type ZoomState = {
  /** 1 = imagem encaixada na caixa. */
  zoom: number;
  /** Deslocamento em pixels de tela, a partir do centro. */
  x: number;
  y: number;
};

export type Size = { width: number; height: number };

/** Ponto medido a partir do centro do contêiner. */
export type Point = { x: number; y: number };

export const FIT: ZoomState = { zoom: 1, x: 0, y: 0 };

export const MAX_IMAGE_ZOOM = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Prende o deslocamento ao que a ampliação realmente liberou.
 *
 * A folga em cada eixo é metade do que a imagem cresceu além da caixa. No
 * encaixe não há folga nenhuma, então o deslocamento volta a zero — sem isso,
 * afastar o zoom deixaria a imagem presa fora de vista.
 */
export function clampZoomState(state: ZoomState, container: Size): ZoomState {
  const zoom = clamp(state.zoom, 1, MAX_IMAGE_ZOOM);
  const slackX = (container.width * (zoom - 1)) / 2;
  const slackY = (container.height * (zoom - 1)) / 2;

  return {
    zoom,
    x: clamp(state.x, -slackX, slackX),
    y: clamp(state.y, -slackY, slackY),
  };
}

/**
 * Amplia mantendo o ponto sob o cursor parado.
 *
 * Com `transform-origin` no centro, o deslocamento que preserva o ponto é
 * `p - (p - offset) * razão`. Ampliar sempre pelo centro puxaria a imagem para
 * o meio, e ler o canto de um mapa exigiria arrastar depois de cada passo.
 */
export function zoomAtPoint(
  state: ZoomState,
  factor: number,
  point: Point,
  container: Size,
): ZoomState {
  const zoom = clamp(state.zoom * factor, 1, MAX_IMAGE_ZOOM);
  // Razão efetiva, já com o limite aplicado: sem isso o deslocamento seria
  // calculado para uma ampliação que não aconteceu.
  const ratio = zoom / state.zoom;

  return clampZoomState(
    {
      zoom,
      x: point.x - (point.x - state.x) * ratio,
      y: point.y - (point.y - state.y) * ratio,
    },
    container,
  );
}

export function panBy(state: ZoomState, dx: number, dy: number, container: Size): ZoomState {
  return clampZoomState({ ...state, x: state.x + dx, y: state.y + dy }, container);
}

export function isFit(state: ZoomState): boolean {
  return state.zoom <= 1;
}
