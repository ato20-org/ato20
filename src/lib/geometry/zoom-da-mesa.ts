import type { Viewport } from "@/types/scene";

/**
 * O zoom de quem assiste: o celular do jogador e a tela do espectador.
 *
 * É uma lupa DENTRO do enquadramento do mestre, e nunca além dele. O recorte
 * que a câmera manda é o teto: aproximar mostra um pedaço menor dele, e o
 * pedaço não sai da moldura por nenhum lado. Afastar para além da câmera
 * mostraria o que o mestre deixou de fora de propósito -- o vilão esperando
 * fora do mapa, a sala ainda escondida --, porque a cena inteira viaja para a
 * mesa e quem esconde o resto é o recorte (ver as tarjas em `SceneStage`).
 *
 * Guardado RELATIVO ao recorte do mestre, e não em unidades de cena: a câmera
 * dele anda durante a sessão, e a lupa anda junto, aproximada no mesmo lugar
 * da moldura. Em unidades de cena, a câmera andando deixaria a lupa parada no
 * mapa até bater na borda e ser arrastada.
 */
export type ZoomDaMesa = {
  /** Quantas vezes o recorte do mestre está ampliado. 1 = o enquadramento dele. */
  fator: number;
  /** O centro da lupa, em fração do recorte do mestre: 0,5 é o meio. */
  u: number;
  v: number;
};

export const ZOOM_NEUTRO: ZoomDaMesa = { fator: 1, u: 0.5, v: 0.5 };

/**
 * Até quatro vezes o enquadramento do mestre.
 *
 * O bastante para ler o nome escrito no mapa num celular, e o recorte do
 * mestre já costuma vir aproximado. Mais que isso o mapa estica além do
 * arquivo, e o que se ganha é borrão.
 */
export const ZOOM_MAXIMO_DA_MESA = 4;

/** O passo dos botões e das teclas: dois toques dobram. */
export const PASSO_DO_ZOOM = Math.SQRT2;

/**
 * Abaixo disto é o enquadramento do mestre. O passo dos botões chega a 1 por
 * conta de ponto flutuante como 0,9999999, e a pinça que volta ao começo nunca
 * acerta o 1 exato -- os dois têm de contar como "sem zoom".
 */
const QUASE_UM = 1.001;

function entre(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/**
 * A lupa dentro dos limites: o fator entre 1 e o teto, e o centro onde a lupa
 * inteira cabe no recorte do mestre.
 */
export function prenderZoom(zoom: ZoomDaMesa): ZoomDaMesa {
  const fator = entre(zoom.fator, 1, ZOOM_MAXIMO_DA_MESA);
  if (fator < QUASE_UM) return ZOOM_NEUTRO;

  const meia = 1 / (2 * fator);

  return {
    fator,
    u: entre(zoom.u, meia, 1 - meia),
    v: entre(zoom.v, meia, 1 - meia),
  };
}

/** A lupa está aproximada, ou é o enquadramento do mestre? */
export function temZoom(zoom: ZoomDaMesa): boolean {
  return zoom.fator >= QUASE_UM;
}

/**
 * O recorte a desenhar: o pedaço do recorte do mestre que a lupa mostra.
 *
 * Sem zoom devolve o PRÓPRIO `base`, e não uma cópia: o palco compara o
 * recorte por referência para decidir se a câmera andou, e uma cópia igual por
 * render seria uma amostra de câmera nova a cada quadro.
 */
export function recorteComZoom(base: Viewport, zoom: ZoomDaMesa): Viewport {
  if (!temZoom(zoom)) return base;

  const width = base.width / zoom.fator;
  const height = base.height / zoom.fator;

  return {
    x: base.x + zoom.u * base.width - width / 2,
    y: base.y + zoom.v * base.height - height / 2,
    width,
    height,
  };
}

/**
 * Amplia (`passo` > 1) ou afasta (`passo` < 1) mantendo um ponto da tela
 * parado: o que está sob os dedos da pinça, ou sob o cursor da roda.
 *
 * `ancora` é a posição do ponto DENTRO do recorte que está na tela, de 0 a 1
 * em cada eixo -- a mesma fração antes e depois, que é o que "parado" quer
 * dizer. Fora disso (o dedo na tarja) vale a borda.
 */
export function aproximarEm(
  zoom: ZoomDaMesa,
  passo: number,
  ancora: { x: number; y: number },
): ZoomDaMesa {
  const ax = entre(ancora.x, 0, 1);
  const ay = entre(ancora.y, 0, 1);
  const fator = entre(zoom.fator * passo, 1, ZOOM_MAXIMO_DA_MESA);

  // O ponto sob a âncora, em fração do recorte do mestre.
  const px = zoom.u - 1 / (2 * zoom.fator) + ax / zoom.fator;
  const py = zoom.v - 1 / (2 * zoom.fator) + ay / zoom.fator;

  return prenderZoom({
    fator,
    u: px - ax / fator + 1 / (2 * fator),
    v: py - ay / fator + 1 / (2 * fator),
  });
}

/**
 * Arrasta a lupa: o mapa anda junto do dedo.
 *
 * `dx` e `dy` são o arrasto em fração do recorte na TELA -- o dedo que cruza a
 * tela inteira anda uma lupa inteira, e não um recorte do mestre inteiro.
 */
export function deslocarZoom(zoom: ZoomDaMesa, dx: number, dy: number): ZoomDaMesa {
  return prenderZoom({
    fator: zoom.fator,
    u: zoom.u - dx / zoom.fator,
    v: zoom.v - dy / zoom.fator,
  });
}
