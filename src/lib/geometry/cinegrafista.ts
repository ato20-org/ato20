import { UNIDADES_POR_METRO } from "@/lib/geometry/sombra";
import type { Tripe } from "@/types/scene";

/**
 * O modo cinegrafista do 2.5D, em conta pura: como o tripé anda e olha com o
 * teclado e o mouse, quadro a quadro. Quem lê as teclas e trava o mouse é
 * `useCinegrafistaDeEsguelha`.
 *
 * Os controles são os de jogo em primeira pessoa voando: WASD no plano do chão,
 * na direção em que o tripé olha; Espaço e C na vertical; Q e E rolam; o mouse
 * gira e inclina, e a roda abre e fecha a lente. Shift faz tudo devagar, para
 * o ajuste fino de enquadre.
 */

/** Andar no chão, em metros por segundo. */
const ANDAR_M_S = 3;
/** Subir e descer, em metros por segundo. */
const SUBIR_M_S = 2;
/** Rolar, em graus por segundo. */
const ROLAR_GRAUS_S = 45;
/** O mouse, em graus por pixel. */
const OLHAR_GRAUS_PX = 0.12;
/** Com Shift, tudo vezes isto. */
const DEVAGAR = 0.2;

/**
 * O mais baixo que o tripé desce: rente ao piso, e nunca através dele. A
 * parede ele atravessa -- é câmera, e não corpo.
 */
export const ALTURA_MINIMA = 0.1 * UNIDADES_POR_METRO;

/** O teto da inclinação, o mesmo do anel do gizmo: olhar além disso é virar. */
const INCLINACAO_MAXIMA = 135;

/** A lente entre estes graus, os mesmos do painel do tripé. */
const LENTE_MINIMA = 10;
const LENTE_MAXIMA = 120;
/** Quanto a roda muda a lente, em graus por pixel de rolagem. */
const LENTE_GRAUS_PX = 0.05;

/** As teclas do modo, por `KeyboardEvent.code`. */
export const TECLAS_DO_CINEGRAFISTA = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "Space",
  "KeyC",
]);

/**
 * Um passo das teclas seguradas, em `segundos` desde o último.
 *
 * A frente no chão é `-(sen giro, cos giro)` -- a mesma do olho do tripé --, e
 * a direita é ela girada um quarto de volta no sentido do relógio. Andar não
 * muda a altura: quem sobe é o Espaço, como num jogo voando.
 */
export function passoDoCinegrafista(
  olho: Tripe,
  teclas: ReadonlySet<string>,
  segundos: number,
  devagar: boolean,
): Tripe {
  const ritmo = devagar ? DEVAGAR : 1;
  const giro = (olho.giro * Math.PI) / 180;
  const frente = { x: -Math.sin(giro), y: -Math.cos(giro) };
  const direita = { x: -frente.y, y: frente.x };

  const adiante = eixo(teclas, "KeyW", "KeyS");
  const lado = eixo(teclas, "KeyD", "KeyA");
  const cima = eixo(teclas, "Space", "KeyC");
  // Q soma rolagem e E tira: o contrário do primeiro desenho, que na mão de
  // quem testou rolava para o lado errado.
  const roda = eixo(teclas, "KeyQ", "KeyE");

  // Na diagonal, na mesma velocidade de frente: sem isto W+D andava 41% mais.
  const norma = Math.hypot(adiante, lado) || 1;
  const andar = ANDAR_M_S * UNIDADES_POR_METRO * ritmo * segundos;
  const subir = SUBIR_M_S * UNIDADES_POR_METRO * ritmo * segundos;

  return {
    ...olho,
    x: olho.x + ((frente.x * adiante + direita.x * lado) / norma) * andar,
    y: olho.y + ((frente.y * adiante + direita.y * lado) / norma) * andar,
    altura: Math.max(ALTURA_MINIMA, olho.altura + cima * subir),
    rolagem: rolar(olho.rolagem + roda * ROLAR_GRAUS_S * ritmo * segundos),
  };
}

/**
 * O mouse preso olhando: para a direita vira à direita, para cima levanta o
 * olhar. Os sinais são os do anel do gizmo -- o giro anda ao contrário da
 * direção no chão. Ver `girarPeloAnel`.
 */
export function olharComOMouse(
  olho: Tripe,
  dx: number,
  dy: number,
  devagar: boolean,
): Tripe {
  const graus = OLHAR_GRAUS_PX * (devagar ? DEVAGAR : 1);
  return {
    ...olho,
    giro: (((olho.giro - dx * graus) % 360) + 360) % 360,
    inclinacao: Math.min(
      INCLINACAO_MAXIMA,
      Math.max(0, olho.inclinacao - dy * graus),
    ),
  };
}

/**
 * A roda na lente: para frente fecha (o enquadre aproxima), para trás abre,
 * como o zoom de qualquer câmera. Shift devagar, como o resto.
 */
export function lenteComARoda(
  olho: Tripe,
  deltaY: number,
  devagar: boolean,
): Tripe {
  const graus = deltaY * LENTE_GRAUS_PX * (devagar ? DEVAGAR : 1);
  return {
    ...olho,
    lente: Math.min(LENTE_MAXIMA, Math.max(LENTE_MINIMA, olho.lente + graus)),
  };
}

/** Uma tecla de cada lado: +1, -1, ou 0 com as duas ou nenhuma. */
function eixo(teclas: ReadonlySet<string>, mais: string, menos: string): number {
  return (teclas.has(mais) ? 1 : 0) - (teclas.has(menos) ? 1 : 0);
}

/** A rolagem entre -180 e 180, como o gizmo a guarda. */
function rolar(graus: number): number {
  return ((((graus + 180) % 360) + 360) % 360) - 180;
}
