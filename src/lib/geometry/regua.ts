import { formatarMetros, METROS_POR_QUADRADO } from "@/lib/geometry/grid";
import type { Vec } from "@/lib/geometry/transform";
import {
  ABERTURA_CONE_PADRAO,
  type Regua,
  type SceneGrid,
} from "@/types/scene";

/**
 * O que um medidor mede, em metros, pronto para a etiqueta.
 *
 * Uma função para as quatro formas porque a etiqueta é o mesmo pedaço da
 * camada: quem desenha não quer saber se é raio ou lado, quer o texto.
 *
 * A área sai em metros quadrados porque é isso que a régua de área responde:
 * "essa sala tem quanto de chão" e "a explosão pega quantos quadrados" são a
 * mesma pergunta com unidade diferente, e o quadrado vale um metro quadrado.
 * Ver `METROS_POR_QUADRADO`.
 */
export function rotuloDoMedidor(medidor: Regua, grid: SceneGrid): string {
  const metro = grid.size / METROS_POR_QUADRADO;
  const dx = medidor.x2 - medidor.x;
  const dy = medidor.y2 - medidor.y;
  const comprimento = Math.hypot(dx, dy) / metro;

  switch (medidor.forma) {
    case "linha":
      return formatarMetros(comprimento);
    case "circulo":
      return `r ${formatarMetros(comprimento)} · ${formatarArea(Math.PI * comprimento ** 2)}`;
    case "cone": {
      const abertura = aberturaDoCone(medidor);
      const area = (comprimento ** 2 * ((abertura * Math.PI) / 180)) / 2;

      return `${formatarMetros(comprimento)} · ${abertura}° · ${formatarArea(area)}`;
    }
    case "retangulo": {
      const largura = Math.abs(dx) / metro;
      const altura = Math.abs(dy) / metro;

      return `${formatarLado(largura)} × ${formatarMetros(altura)} · ${formatarArea(largura * altura)}`;
    }
  }
}

/** Metros quadrados: um decimal até 10, inteiro acima, como `formatarMetros`. */
export function formatarArea(metros2: number): string {
  return metros2 < 10 ? `${metros2.toFixed(1)} m²` : `${Math.round(metros2)} m²`;
}

/** Um lado do retângulo, sem a unidade: ela vai no segundo lado. */
function formatarLado(metros: number): string {
  return metros < 10 ? metros.toFixed(1) : String(Math.round(metros));
}

export function aberturaDoCone(medidor: Pick<Regua, "abertura">): number {
  return medidor.abertura ?? ABERTURA_CONE_PADRAO;
}

/** O medidor inteiro deslocado. Mover é o mesmo gesto para as quatro formas. */
export function moverRegua(medidor: Regua, delta: Vec): Regua {
  return {
    ...medidor,
    x: medidor.x + delta.x,
    y: medidor.y + delta.y,
    x2: medidor.x2 + delta.x,
    y2: medidor.y2 + delta.y,
  };
}

/**
 * Menor que isto entre os dois pontos, em unidades de cena, e o medidor é um
 * clique que não virou arrasto: não fica.
 */
export const MEDIDOR_MINIMO = 4;

export function reguaVazia(medidor: Pick<Regua, "x" | "y" | "x2" | "y2">): boolean {
  return Math.hypot(medidor.x2 - medidor.x, medidor.y2 - medidor.y) < MEDIDOR_MINIMO;
}

/**
 * A caixa do retângulo, normalizada: o mestre pode arrastar para qualquer
 * lado, e `x2 < x` é um retângulo tão bom quanto o outro.
 */
export function caixaDoRetangulo(medidor: Regua): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: Math.min(medidor.x, medidor.x2),
    y: Math.min(medidor.y, medidor.y2),
    width: Math.abs(medidor.x2 - medidor.x),
    height: Math.abs(medidor.y2 - medidor.y),
  };
}
