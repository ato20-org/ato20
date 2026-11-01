import {
  filtroDaImagem,
  type AjusteDeImagem,
} from "@/lib/imagem-do-espectador";

/**
 * O tom da cena PINTADO na imagem do mapa, para o Mestre.
 *
 * A TV e o celular aplicam o tom com `filter` de CSS no palco inteiro, e lá
 * ele é do compositor. No Mestre ele vale só para o mapa, e um `filter` na
 * imagem dentro do plano é refeito pela WebKitGTK na imagem INTEIRA a cada
 * repintura do que está por cima dela: arrastar a alça de uma parede grande
 * redesenha a sombra e a luz a cada quadro, e cada quadro filtrava o mapa de
 * novo -- o Mestre travava. Pintado uma vez, fora da tela, o palco desenha um
 * arquivo comum. É a regra de `silhueta.ts`: filtro roda uma vez, num canvas
 * fora da tela, e não a cada quadro em cima de um filho do palco.
 *
 * Aqui só a pintura, sem DOM: ela roda também no worker. Quem pede e guarda o
 * resultado é `mapa-com-tom.ts`.
 */

type Contexto = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** O maior lado do mapa assado: o do `palco`. Ver `useVarianteDoFundo`. */
const LADO_ASSADO = 4096;

/**
 * O tamanho do arquivo assado: o do mapa, reduzido para caber em
 * `LADO_ASSADO`. Quem pede já manda o `palco`; isto é a guarda para o arquivo
 * que vier maior, que custaria centenas de megabytes no forno.
 */
export function tamanhoAssado(largura: number, altura: number) {
  const escala = Math.min(1, LADO_ASSADO / Math.max(largura, altura, 1));

  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

/**
 * A `fonte` no `ctx`, com o tom.
 *
 * Pelo `filter` do canvas quando o motor o tem: é a mesma conta do CSS da TV,
 * e roda no motor. Sem ele -- chegou tarde ao WebKit, ver `efeito-na-figura` --,
 * pixel a pixel por `aplicarTom`.
 */
export function pintarComTom(
  ctx: Contexto,
  fonte: CanvasImageSource,
  largura: number,
  altura: number,
  ajuste: Required<AjusteDeImagem>,
): void {
  const filtro = filtroDaImagem(ajuste);

  if (filtro && typeof ctx.filter === "string") {
    ctx.filter = filtro;
    ctx.drawImage(fonte, 0, 0, largura, altura);
    ctx.filter = "none";
    return;
  }

  ctx.drawImage(fonte, 0, 0, largura, altura);
  if (!filtro) return;

  const dados = ctx.getImageData(0, 0, largura, altura);
  aplicarTom(dados.data, ajuste);
  ctx.putImageData(dados, 0, 0);
}

/**
 * O tom nos pixels RGBA, no lugar, com a conta do `filter` do CSS: brilho,
 * contraste, saturação e matiz, nessa ordem, cada passo cortado em 0 e 1 como
 * o navegador faz entre uma função e a próxima. O alfa não muda.
 *
 * Os coeficientes são os da especificação de Filter Effects, em sRGB, que é
 * onde as funções do `filter` trabalham.
 */
export function aplicarTom(
  dados: Uint8ClampedArray,
  ajuste: Required<AjusteDeImagem>,
): void {
  const brilho = ajuste.brilho / 100;
  const contraste = ajuste.contraste / 100;
  const sat = matrizDaSaturacao(ajuste.saturacao / 100);
  const hue = matrizDoMatiz(ajuste.matiz);
  const comSaturacao = ajuste.saturacao !== 100;
  const comMatiz = ajuste.matiz !== 0;

  for (let i = 0; i < dados.length; i += 4) {
    let r = dados[i]! / 255;
    let g = dados[i + 1]! / 255;
    let b = dados[i + 2]! / 255;

    if (brilho !== 1) {
      r = corte(r * brilho);
      g = corte(g * brilho);
      b = corte(b * brilho);
    }
    if (contraste !== 1) {
      r = corte((r - 0.5) * contraste + 0.5);
      g = corte((g - 0.5) * contraste + 0.5);
      b = corte((b - 0.5) * contraste + 0.5);
    }
    if (comSaturacao) [r, g, b] = vezes(sat, r, g, b);
    if (comMatiz) [r, g, b] = vezes(hue, r, g, b);

    dados[i] = r * 255;
    dados[i + 1] = g * 255;
    dados[i + 2] = b * 255;
  }
}

type Matriz = readonly [number, number, number, number, number, number, number, number, number];

function matrizDaSaturacao(s: number): Matriz {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
}

function matrizDoMatiz(graus: number): Matriz {
  const rad = (graus * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.14,
    0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072,
  ];
}

function vezes(m: Matriz, r: number, g: number, b: number): [number, number, number] {
  return [
    corte(m[0] * r + m[1] * g + m[2] * b),
    corte(m[3] * r + m[4] * g + m[5] * b),
    corte(m[6] * r + m[7] * g + m[8] * b),
  ];
}

function corte(valor: number): number {
  return valor < 0 ? 0 : valor > 1 ? 1 : valor;
}
