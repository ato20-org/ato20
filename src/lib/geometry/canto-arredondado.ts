/**
 * O canto arredondado das formas do quadro: retângulo e polígono.
 *
 * Sempre arredondado, sem canto vivo para escolher, e o RAIO sai do tamanho da
 * forma, e não de um número que o mestre escolhe. É a regra do Excalidraw: um raio fixo
 * transformaria um quadradinho de 40 unidades numa pílula e mal se veria num
 * retângulo de 800; um raio que o mestre calibra forma a forma é um controle a
 * mais para um gesto que é de marcar, não de desenhar.
 */

/** O teto do raio, em unidades de cena. Acima dele a caixa vira pílula. */
const RAIO_MAXIMO = 32;

/** A fração do lado menor que o canto come, abaixo do teto. */
const FRACAO_DO_LADO = 0.25;

/** O raio do canto de uma caixa deste tamanho, em unidades de cena. */
export function raioDoCanto(largura: number, altura: number): number {
  return Math.max(
    0,
    Math.min(RAIO_MAXIMO, Math.min(largura, altura) * FRACAO_DO_LADO),
  );
}

type Ponto = { x: number; y: number };

/**
 * O contorno de um polígono FECHADO com cada vértice arredondado, como `d` de
 * um `<path>`.
 *
 * Em cada vértice o traço para antes dele, a `raio` de distância em cada lado,
 * e faz a curva com o próprio vértice de controle (Bézier quadrática). O corte
 * encolhe em lado curto: nunca passa da METADE de um lado, senão as curvas de
 * dois vértices vizinhos se cruzariam no meio dele. Vértice repetido -- dois
 * cliques no mesmo lugar -- não tem direção, e fica sem curva.
 */
export function caminhoArredondado(pontos: Ponto[], raio: number): string {
  const n = pontos.length;
  if (n < 3) return "";

  const cantos = pontos.map((ponto, indice) => {
    const antes = pontos[(indice - 1 + n) % n]!;
    const depois = pontos[(indice + 1) % n]!;
    const ladoAntes = Math.hypot(antes.x - ponto.x, antes.y - ponto.y);
    const ladoDepois = Math.hypot(depois.x - ponto.x, depois.y - ponto.y);
    const corte = Math.min(raio, ladoAntes / 2, ladoDepois / 2);

    const rumo = (alvo: Ponto, lado: number): Ponto =>
      lado > 0
        ? {
            x: ponto.x + ((alvo.x - ponto.x) / lado) * corte,
            y: ponto.y + ((alvo.y - ponto.y) / lado) * corte,
          }
        : ponto;

    return {
      vertice: ponto,
      entrada: rumo(antes, ladoAntes),
      saida: rumo(depois, ladoDepois),
    };
  });

  const par = (ponto: Ponto) => `${ponto.x},${ponto.y}`;
  const [primeiro, ...resto] = cantos;
  const trechos = [...resto, primeiro!].map(
    ({ vertice, entrada, saida }) =>
      `L${par(entrada)} Q${par(vertice)} ${par(saida)}`,
  );

  return `M${par(primeiro!.saida)} ${trechos.join(" ")} Z`;
}
