import { describe, expect, it } from "vitest";

import { PASSO_CAMERA } from "@/lib/mestre/camera-actions";
import {
  andarComAsSetas,
  parou,
  VELOCIDADE_CAMERA,
  type Embalo,
  type SetaSegurada,
} from "@/lib/mestre/camera-nas-setas";

const V = VELOCIDADE_CAMERA;
/** Quanto um toque empurra: o tempo de andar um passo. */
const TOQUE_MS = (PASSO_CAMERA / V) * 1000;

/**
 * Anda quadro a quadro de 0 a `fim`, e devolve cada quadro: o instante, o
 * deslocamento acumulado e a velocidade.
 */
function percorrer(
  setas: SetaSegurada[],
  fim: number,
  quadros: (t: number) => number = () => 16,
) {
  let embalo: Embalo = { vx: 0, vy: 0 };
  let x = 0;
  let y = 0;
  let t = 0;
  const passos = [{ t, x, y, vx: 0, vy: 0 }];

  while (t < fim) {
    const proximo = Math.min(fim, t + quadros(t));
    const passo = andarComAsSetas(embalo, setas, V, t, proximo);
    embalo = passo;
    x += passo.dx;
    y += passo.dy;
    t = proximo;
    passos.push({ t, x, y, vx: passo.vx, vy: passo.vy });
  }

  return passos;
}

const direita = (desde: number, ate: number): SetaSegurada => ({
  x: 1,
  y: 0,
  desde,
  ate,
});

describe("a câmera nas setas", () => {
  it("um toque anda o passo inteiro", () => {
    const fim = percorrer([direita(0, TOQUE_MS)], 2000).at(-1)!;

    expect(fim.x).toBeCloseTo(PASSO_CAMERA, 6);
    expect(fim.y).toBe(0);
  });

  it("segurada, anda a velocidade vezes o tempo", () => {
    const fim = percorrer([direita(0, 1000)], 3000).at(-1)!;

    expect(fim.x).toBeCloseTo(V, 6);
  });

  // O que a TV recebe é uma amostra a cada 100 ms. Com o dedo parado na
  // seta, toda amostra tem de trazer o mesmo tanto: é a diferença entre andar
  // e andar aos trancos.
  it("segurada, toda amostra de 100 ms anda o mesmo tanto", () => {
    const passos = percorrer([direita(0, Infinity)], 2000, () => 1);
    const em = (t: number) => passos.find((passo) => passo.t >= t)!.x;

    // Depois do arranque, que leva uns 500 ms para chegar a 0,1% da velocidade.
    for (let t = 800; t < 2000; t += 100)
      expect(em(t + 100) - em(t)).toBeCloseTo(V * 0.1, 4);
  });

  it("arranca e para sem tranco", () => {
    const passos = percorrer([direita(0, 1000)], 2000);

    for (let i = 1; i < passos.length; i++) {
      const salto = Math.abs(passos[i]!.vx - passos[i - 1]!.vx);
      // Num quadro de 16 ms a velocidade muda no máximo 15% do total.
      expect(salto).toBeLessThan(V * 0.15);
    }
  });

  it("o percurso não depende da cadência dos quadros", () => {
    const setas = [direita(0, 430)];
    const liso = percorrer(setas, 1500).at(-1)!;
    // Quadros irregulares: 7, 33, 7, 33… como uma webview ocupada.
    const torto = percorrer(setas, 1500, (t) => (Math.floor(t) % 2 ? 7 : 33)).at(-1)!;

    expect(torto.x).toBeCloseTo(liso.x, 9);
    expect(torto.vx).toBeCloseTo(liso.vx, 9);
  });

  it("na diagonal anda na mesma velocidade", () => {
    const fim = percorrer(
      [direita(0, 1000), { x: 0, y: -1, desde: 0, ate: 1000 }],
      3000,
    ).at(-1)!;

    expect(Math.hypot(fim.x, fim.y)).toBeCloseTo(V, 6);
    expect(fim.x).toBeCloseTo(-fim.y, 9);
  });

  it("setas opostas se anulam", () => {
    const fim = percorrer(
      [direita(0, 1000), { x: -1, y: 0, desde: 0, ate: 1000 }],
      2000,
    ).at(-1)!;

    expect(fim.x).toBeCloseTo(0, 9);
  });

  it("solta, para em meio segundo", () => {
    const passos = percorrer([direita(0, 1000)], 2000);
    const parada = passos.find(
      (passo) => passo.t > 1000 && parou({ vx: passo.vx, vy: passo.vy }),
    );

    expect(parada).toBeDefined();
    expect(parada!.t - 1000).toBeLessThan(600);
  });
});
