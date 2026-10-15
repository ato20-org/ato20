import type { CanvasItem } from "@/types/scene";

export interface Ponto {
  x: number;
  y: number;
}

export type FormatoMolde = "circulo" | "cone" | "cubo" | "linha";

export interface MoldeDeMagia {
  id: string;
  formato: FormatoMolde;
  /** Ponto de origem (conjurador ou centro da área), em coordenadas de cena. */
  origem: Ponto;
  /** Alcance / Raio / Comprimento em pixels de cena. */
  alcance: number;
  /** Direção angular em graus (0 = leste / direita, 90 = sul / baixo). */
  direcaoGraus?: number;
  /** Abertura do cone em graus. Padrão 5e: 53.13° (onde largura na ponta = comprimento). */
  aberturaGraus?: number;
  /** Largura da linha ou cubo em pixels de cena. */
  largura?: number;
}

const EPSILON = 1e-6;

/** Verifica se um ponto está dentro de uma esfera / círculo. */
export function pontoNoCirculo(ponto: Ponto, origem: Ponto, raio: number): boolean {
  const dx = ponto.x - origem.x;
  const dy = ponto.y - origem.y;
  return dx * dx + dy * dy <= raio * raio + EPSILON;
}

/**
 * Verifica se um ponto está dentro de um cone (5e standard: ~53.13°).
 * Abertura de 53.13° garante a regra do D&D 5e onde a largura na base do cone é igual ao comprimento.
 */
export function pontoNoCone(
  ponto: Ponto,
  origem: Ponto,
  alcance: number,
  direcaoGraus: number,
  aberturaGraus: number = 53.13,
): boolean {
  const dx = ponto.x - origem.x;
  const dy = ponto.y - origem.y;
  const distSq = dx * dx + dy * dy;

  if (alcance <= 0) return false;
  if (distSq > alcance * alcance + EPSILON) return false;
  if (distSq < EPSILON) return true;

  const anguloPonto = (Math.atan2(dy, dx) * 180) / Math.PI;
  let diff = Math.abs(anguloPonto - direcaoGraus) % 360;
  if (diff > 180) diff = 360 - diff;

  return diff <= aberturaGraus / 2 + EPSILON;
}

/** Verifica se um ponto está dentro de um cubo orientado. */
export function pontoNoCubo(
  ponto: Ponto,
  origem: Ponto,
  tamanho: number,
  direcaoGraus: number = 0,
): boolean {
  // Transladar ponto para a origem do cubo
  const dx = ponto.x - origem.x;
  const dy = ponto.y - origem.y;

  if (Math.abs(direcaoGraus) < EPSILON) {
    return (
      dx >= -EPSILON &&
      dx <= tamanho + EPSILON &&
      dy >= -EPSILON &&
      dy <= tamanho + EPSILON
    );
  }

  // Rotacionar o ponto no sentido inverso da direção do cubo
  const rad = (-direcaoGraus * Math.PI) / 180;
  const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

  return (
    rx >= -EPSILON &&
    rx <= tamanho + EPSILON &&
    ry >= -EPSILON &&
    ry <= tamanho + EPSILON
  );
}

/** Verifica se um ponto está dentro de um feixe retilíneo (linha espessa). */
export function pontoNaLinha(
  ponto: Ponto,
  origem: Ponto,
  alcance: number,
  direcaoGraus: number,
  largura: number = 50,
): boolean {
  const dx = ponto.x - origem.x;
  const dy = ponto.y - origem.y;

  const rad = (-direcaoGraus * Math.PI) / 180;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

  const metadeLargura = largura / 2;
  return (
    localX >= -EPSILON &&
    localX <= alcance + EPSILON &&
    localY >= -metadeLargura - EPSILON &&
    localY <= metadeLargura + EPSILON
  );
}

/** Avalia se um ponto genérico está dentro da área de um molde de magia. */
export function pontoNoMolde(ponto: Ponto, molde: MoldeDeMagia): boolean {
  switch (molde.formato) {
    case "circulo":
      return pontoNoCirculo(ponto, molde.origem, molde.alcance);
    case "cone":
      return pontoNoCone(
        ponto,
        molde.origem,
        molde.alcance,
        molde.direcaoGraus ?? 0,
        molde.aberturaGraus ?? 53.13,
      );
    case "cubo":
      return pontoNoCubo(
        ponto,
        molde.origem,
        molde.alcance,
        molde.direcaoGraus ?? 0,
      );
    case "linha":
      return pontoNaLinha(
        ponto,
        molde.origem,
        molde.alcance,
        molde.direcaoGraus ?? 0,
        molde.largura ?? 50,
      );
  }
}

/**
 * Avalia se um token está atingido pelo molde de magia:
 * Testa o centro do token e os 4 cantos para cobrir criaturas grandes e médias.
 */
export function tokenNoMolde(token: CanvasItem, molde: MoldeDeMagia): boolean {
  const cx = token.x + token.width / 2;
  const cy = token.y + token.height / 2;

  // Centro
  if (pontoNoMolde({ x: cx, y: cy }, molde)) return true;

  // Cantos e pontos médios das arestas (para capturar feixes e raios passando pelas bordas)
  const pontosDeTeste: Ponto[] = [
    { x: token.x, y: token.y },
    { x: token.x + token.width, y: token.y },
    { x: token.x, y: token.y + token.height },
    { x: token.x + token.width, y: token.y + token.height },
    { x: cx, y: token.y },
    { x: cx, y: token.y + token.height },
    { x: token.x, y: cy },
    { x: token.x + token.width, y: cy },
  ];

  return pontosDeTeste.some((p) => pontoNoMolde(p, molde));
}

/** Filtra os tokens que estão dentro da área de efeito do feitiço. */
export function tokensAtingidos(
  tokens: readonly CanvasItem[],
  molde: MoldeDeMagia,
): CanvasItem[] {
  return tokens.filter((token) => tokenNoMolde(token, molde));
}
