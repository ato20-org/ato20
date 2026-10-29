import { boundsFromPoints, type Bounds } from "@/lib/geometry/bounds";
import { formatarMetros, METROS_POR_QUADRADO } from "@/lib/geometry/grid";
import type { Vec } from "@/lib/geometry/transform";
import {
  ABERTURA_CONE_PADRAO,
  type FormaDaRegua,
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

type DoisPontos = Pick<Regua, "x" | "y" | "x2" | "y2">;

/**
 * A ponta da régua travada, levada na direção de `para`: gira em volta da
 * origem, e o tamanho fica. É o que a alça faz com a medida travada -- a
 * régua de nove metros que a ficha pôs aponta para a porta e continua com
 * nove. Ver `Regua.travada`.
 *
 * Com o ponteiro em cima da origem não há direção, e a ponta fica onde está.
 */
export function girarPonta(medidor: DoisPontos, para: Vec): Pick<Regua, "x2" | "y2"> {
  const comprimento = Math.hypot(medidor.x2 - medidor.x, medidor.y2 - medidor.y);
  const dx = para.x - medidor.x;
  const dy = para.y - medidor.y;
  const distancia = Math.hypot(dx, dy);
  if (distancia === 0) return { x2: medidor.x2, y2: medidor.y2 };

  return {
    x2: medidor.x + (dx / distancia) * comprimento,
    y2: medidor.y + (dy / distancia) * comprimento,
  };
}

/** Pontos do arco do cone que entram na caixa dele. Ver `caixaDaRegua`. */
const PONTOS_DO_ARCO = 16;

/**
 * A caixa que cerca o que a régua DESENHA, em unidades de cena: o gizmo põe a
 * fileira de botões em cima dela. O círculo é o quadrado do raio, e não a
 * linha do raio -- a fileira cairia no meio da área.
 */
export function caixaDaRegua(medidor: Regua): Bounds {
  const raio = Math.hypot(medidor.x2 - medidor.x, medidor.y2 - medidor.y);

  switch (medidor.forma) {
    case "linha":
      return boundsFromPoints(medidor, { x: medidor.x2, y: medidor.y2 });
    case "circulo":
      return {
        minX: medidor.x - raio,
        minY: medidor.y - raio,
        maxX: medidor.x + raio,
        maxY: medidor.y + raio,
      };
    case "cone": {
      // O vértice e o arco, amostrado: o ponto mais alto do arco não é uma
      // das pontas quando o cone aponta para cima.
      const direcao = Math.atan2(medidor.y2 - medidor.y, medidor.x2 - medidor.x);
      const meia = ((aberturaDoCone(medidor) / 2) * Math.PI) / 180;
      const pontos = Array.from({ length: PONTOS_DO_ARCO + 1 }, (_, i) => {
        const angulo = direcao - meia + (2 * meia * i) / PONTOS_DO_ARCO;
        return { x: medidor.x + Math.cos(angulo) * raio, y: medidor.y + Math.sin(angulo) * raio };
      });
      const xs = [medidor.x, ...pontos.map((ponto) => ponto.x)];
      const ys = [medidor.y, ...pontos.map((ponto) => ponto.y)];

      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    case "retangulo": {
      const caixa = caixaDoRetangulo(medidor);

      return { minX: caixa.x, minY: caixa.y, maxX: caixa.x + caixa.width, maxY: caixa.y + caixa.height };
    }
  }
}

/**
 * A régua em outra forma, nos mesmos dois pontos: a reta de nove metros vira o
 * círculo de nove de raio, o cone de nove de alcance. Devolve o que muda.
 *
 * O retângulo é a exceção: dos dois pontos ele tira os LADOS, e a régua deitada
 * daria um retângulo sem altura, que ninguém vê nem pega. Com um lado menor que
 * `MEDIDOR_MINIMO`, ele vira o quadrado do lado maior, crescendo para onde a
 * régua já ia.
 */
export function trocarFormaDaRegua(medidor: Regua, forma: FormaDaRegua): Partial<Regua> {
  if (forma === medidor.forma) return {};
  if (forma !== "retangulo") return { forma };

  const dx = medidor.x2 - medidor.x;
  const dy = medidor.y2 - medidor.y;
  if (Math.abs(dx) >= MEDIDOR_MINIMO && Math.abs(dy) >= MEDIDOR_MINIMO) return { forma };

  const lado = Math.max(Math.abs(dx), Math.abs(dy));

  return {
    forma,
    x2: medidor.x + (dx < 0 ? -lado : lado),
    y2: medidor.y + (dy < 0 ? -lado : lado),
  };
}
