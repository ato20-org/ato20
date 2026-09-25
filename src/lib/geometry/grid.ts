import type { CanvasItem, Scene, SceneGrid } from "@/types/scene";

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

/**
 * O lado do quadrado como ele e DESENHADO.
 *
 * O mesmo minimo de `GridLayer`: abaixo de 8 a grade vira um borrao cinza, e
 * um valor acidental de 0 faria a conta de encaixe dividir por zero. Aqui e
 * la porque o encaixe TEM de cair sobre a linha que a mesa ve -- duas regras
 * diferentes deixariam o token grudado onde nao ha quadrado nenhum.
 */
export function passoDaGrade(grid: SceneGrid): number {
  return Math.max(8, grid.size);
}

/**
 * A grade a que os tokens se encaixam, ou nada.
 *
 * Nada quando a cena nao tem grade, e nada quando ela tem mas o ima esta
 * desligado -- desenhar o quadrado e obrigar a peca a ele sao duas decisoes:
 * mapa com grade so de referencia visual e comum, e forcar o encaixe nele
 * tiraria do mestre a posicao exata que ele escolheu.
 */
export function gradeDoEncaixe(scene: Pick<Scene, "grid">): SceneGrid | undefined {
  return scene.grid?.snap ? scene.grid : undefined;
}

/**
 * O canto do item com o CENTRO dele no meio do quadrado mais proximo.
 *
 * Pelo centro, e nao pelo canto: `CanvasItem` guarda o canto, mas quem joga
 * poe a peca no MEIO da casa. Arredondar o canto so acerta quando o token tem
 * exatamente o tamanho do quadrado -- um token de 64 numa grade de 96 ficaria
 * encostado no canto de cima da casa, para sempre e em todas as telas.
 *
 * Nao arredonda o resultado: a mesma conta roda no celular e na janela do
 * mestre, e um arredondamento a mais de um lado faria o mestre recusar o
 * destino que o proprio celular calculou. Ver `destinoAceito`.
 */
export function encaixarNaGrade(
  item: Pick<CanvasItem, "width" | "height">,
  x: number,
  y: number,
  grid: SceneGrid,
): { x: number; y: number } {
  const passo = passoDaGrade(grid);

  return {
    x: encaixarEixo(x, item.width, grid.offsetX, passo),
    y: encaixarEixo(y, item.height, grid.offsetY, passo),
  };
}

/**
 * Um eixo do encaixe.
 *
 * O deslocamento cru, e nao o resto da divisao que `GridLayer` usa para pintar:
 * os dois descrevem a MESMA rede de linhas -- deslocar um quadrado inteiro e o
 * mesmo que nao deslocar --, e o resto so existe la porque o padrao do SVG nao
 * aceita origem negativa.
 */
function encaixarEixo(
  canto: number,
  lado: number,
  deslocamento: number,
  passo: number,
): number {
  const casa = casaNoEixo(canto + lado / 2, deslocamento, passo);

  return deslocamento + (casa + 0.5) * passo - lado / 2;
}

/** Em que quadrado cai este ponto, contado a partir do deslocamento. */
function casaNoEixo(ponto: number, deslocamento: number, passo: number): number {
  return Math.floor((ponto - deslocamento) / passo);
}

/**
 * O quadrado em que o item ESTA -- o que contem o centro dele.
 *
 * Pelo centro, como o encaixe: um token maior que a casa cobre varias, e a que
 * conta e aquela em que a peca esta plantada. Com o ima ligado a resposta e a
 * casa em que o encaixe a pos; com ele desligado, ainda e a casa que qualquer
 * pessoa apontaria olhando o mapa.
 *
 * Devolve o canto e o lado, que e o que um retangulo precisa. Ver `GridLayer`.
 */
export function casaDoItem(
  item: Pick<CanvasItem, "x" | "y" | "width" | "height">,
  grid: SceneGrid,
): { x: number; y: number; lado: number } {
  const lado = passoDaGrade(grid);

  return {
    x:
      grid.offsetX +
      casaNoEixo(item.x + item.width / 2, grid.offsetX, lado) * lado,
    y:
      grid.offsetY +
      casaNoEixo(item.y + item.height / 2, grid.offsetY, lado) * lado,
    lado,
  };
}
