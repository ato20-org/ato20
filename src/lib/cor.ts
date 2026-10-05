/**
 * As contas de cor do seletor, fora de qualquer componente.
 *
 * HSV, e não HSL nem RGB, porque é o desenho do seletor: o quadrado é
 * saturação na horizontal e brilho na vertical, e a faixa é o matiz. Cada
 * eixo da tela é um número daqui, e arrastar num deles não mexe nos outros.
 *
 * O que sai é sempre `#rrggbb` minúsculo: é o que a luz grava, o que o canvas
 * aceita e o que a paleta usa -- comparar cor com cor é comparar string.
 */

/** Matiz de 0 a 360, saturação e brilho de 0 a 1. */
export type Hsv = { h: number; s: number; v: number };

/**
 * `#rrggbb` a partir do que o mestre digitou, ou `null` se não é cor.
 *
 * Aceita com e sem `#`, e a forma curta de três dígitos: é o que se cola de
 * qualquer lugar. Minúsculo na saída, pela razão do cabeçalho.
 */
export function normalizarHex(valor: string): string | null {
  const limpo = valor.trim().replace(/^#/, "").toLowerCase();

  if (/^[0-9a-f]{3}$/.test(limpo)) {
    return `#${[...limpo].map((digito) => digito + digito).join("")}`;
  }

  return /^[0-9a-f]{6}$/.test(limpo) ? `#${limpo}` : null;
}

/** A cor do vazio quando ninguém escolheu: o breu. Ver `Scene.corDoVazio`. */
export const COR_DO_VAZIO_PADRAO = "#000000";

/**
 * A cor do vazio -- o que está FORA do mapa --, ou o breu para o que não é cor.
 * Ver `Scene.corDoVazio`.
 *
 * O valor chega pelo disco e pelo canal, e um `backgroundColor` inválido o
 * navegador ignora em silêncio: o palco voltaria ao preto do tema, ou pior,
 * deixaria ver o que estivesse atrás dele.
 */
export function corDoVazioDe(valor: unknown): string {
  return (
    (typeof valor === "string" && normalizarHex(valor)) || COR_DO_VAZIO_PADRAO
  );
}

export function hexParaHsv(hex: string): Hsv | null {
  const normal = normalizarHex(hex);
  if (!normal) return null;

  const r = Number.parseInt(normal.slice(1, 3), 16) / 255;
  const g = Number.parseInt(normal.slice(3, 5), 16) / 255;
  const b = Number.parseInt(normal.slice(5, 7), 16) / 255;

  const maior = Math.max(r, g, b);
  const menor = Math.min(r, g, b);
  const faixa = maior - menor;

  let h = 0;
  if (faixa > 0) {
    if (maior === r) h = ((g - b) / faixa) % 6;
    else if (maior === g) h = (b - r) / faixa + 2;
    else h = (r - g) / faixa + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: maior === 0 ? 0 : faixa / maior, v: maior };
}

export function hsvParaHex({ h, s, v }: Hsv): string {
  const matiz = (((h % 360) + 360) % 360) / 60;
  const croma = v * s;
  const x = croma * (1 - Math.abs((matiz % 2) - 1));
  const base = v - croma;

  const [r, g, b] =
    matiz < 1
      ? [croma, x, 0]
      : matiz < 2
        ? [x, croma, 0]
        : matiz < 3
          ? [0, croma, x]
          : matiz < 4
            ? [0, x, croma]
            : matiz < 5
              ? [x, 0, croma]
              : [croma, 0, x];

  const canal = (valor: number) =>
    Math.round(Math.min(1, Math.max(0, valor + base)) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${canal(r)}${canal(g)}${canal(b)}`;
}
