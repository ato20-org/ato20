import { describe, expect, it } from "vitest";

import { segmentosDasParedes, type Ponto } from "@/lib/geometry/luz";
import { olhoDoToken, sombraNaVisao, sombrasDaVisao } from "@/lib/geometry/visao";
import { SCENE_HEIGHT, SCENE_WIDTH, type Parede } from "@/types/scene";

/** O ponto está dentro do polígono? Raio para a direita, contando cruzamentos. */
function dentro(ponto: Ponto, poligono: Ponto[]): boolean {
  let cruza = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i]!;
    const b = poligono[j]!;
    if (
      a.y > ponto.y !== b.y > ponto.y &&
      ponto.x < ((b.x - a.x) * (ponto.y - a.y)) / (b.y - a.y) + a.x
    ) {
      cruza = !cruza;
    }
  }
  return cruza;
}

function escondido(ponto: Ponto, sombras: Ponto[][]): boolean {
  return sombras.some((sombra) => dentro(ponto, sombra));
}

function areaComSinal(pontos: Ponto[]): number {
  let area = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const atual = pontos[i]!;
    const proximo = pontos[(i + 1) % pontos.length]!;
    area += atual.x * proximo.y - proximo.x * atual.y;
  }
  return area / 2;
}

describe("olhoDoToken", () => {
  it("é o centro da figura, de onde a lanterna acende", () => {
    expect(olhoDoToken({ x: 100, y: 200, width: 60, height: 80 })).toEqual({
      x: 130,
      y: 240,
    });
  });
});

describe("sombrasDaVisao", () => {
  const olho = { x: 400, y: 500 };

  it("sem parede, nada se esconde", () => {
    expect(sombrasDaVisao([], olho)).toEqual([]);
  });

  it("esconde o que está atrás da parede, e só isso", () => {
    const sombras = sombrasDaVisao(
      [{ x1: 600, y1: 400, x2: 600, y2: 600 }],
      olho,
    );

    expect(escondido({ x: 800, y: 500 }, sombras)).toBe(true);
    expect(escondido({ x: 500, y: 500 }, sombras)).toBe(false);
    expect(escondido({ x: 800, y: 900 }, sombras)).toBe(false);
  });

  it("a sombra vai até o canto do plano", () => {
    const sombras = sombrasDaVisao(
      [{ x1: 600, y1: 0, x2: 600, y2: SCENE_HEIGHT }],
      olho,
    );

    expect(escondido({ x: SCENE_WIDTH - 1, y: 1 }, sombras)).toBe(true);
    expect(escondido({ x: SCENE_WIDTH - 1, y: SCENE_HEIGHT - 1 }, sombras)).toBe(true);
  });

  it("encostado numa parede comprida, não enxerga por trás do meio dela", () => {
    // O caso que a umbra da luz não cobre: o ângulo quase raso afundava a
    // corda, e o fundo da sala atrás da parede aparecia.
    const sombras = sombrasDaVisao(
      [{ x1: 0, y1: 510, x2: SCENE_WIDTH, y2: 510 }],
      { x: 960, y: 500 },
    );

    expect(escondido({ x: 960, y: SCENE_HEIGHT - 1 }, sombras)).toBe(true);
    expect(escondido({ x: 100, y: SCENE_HEIGHT - 1 }, sombras)).toBe(true);
    expect(escondido({ x: 960, y: 400 }, sombras)).toBe(false);
  });

  it("dentro de uma sala fechada, não vê nada fora dela", () => {
    const sala: Parede = {
      id: "sala",
      x: 300,
      y: 400,
      width: 300,
      height: 250,
      formato: "retangulo",
    };
    const sombras = sombrasDaVisao(segmentosDasParedes([sala]), olho);

    expect(escondido({ x: 450, y: 500 }, sombras)).toBe(false);
    for (const fora of [
      { x: 100, y: 100 },
      { x: 1800, y: 500 },
      { x: 450, y: 1000 },
      { x: 450, y: 50 },
    ]) {
      expect(escondido(fora, sombras)).toBe(true);
    }
  });

  it("todas as sombras giram no mesmo sentido, e o caminho único não abre buraco", () => {
    const sala: Parede = {
      id: "sala",
      x: 300,
      y: 400,
      width: 300,
      height: 250,
      formato: "retangulo",
    };
    const sinais = sombrasDaVisao(segmentosDasParedes([sala]), olho).map(
      (sombra) => Math.sign(areaComSinal(sombra)),
    );

    expect(sinais.length).toBeGreaterThan(0);
    expect(new Set(sinais).size).toBe(1);
  });

  it("parede fora do plano ainda esconde o que fica atrás dela, dentro do plano", () => {
    const sombras = sombrasDaVisao(
      [{ x1: -50, y1: -400, x2: -50, y2: 1400 }],
      { x: -200, y: 500 },
    );

    expect(escondido({ x: 10, y: 500 }, sombras)).toBe(true);
    expect(escondido({ x: SCENE_WIDTH - 1, y: 10 }, sombras)).toBe(true);
  });
});

describe("sombraNaVisao", () => {
  it("o olho em cima da parede não esconde nenhum dos lados", () => {
    expect(
      sombraNaVisao({ x1: 0, y1: 0, x2: 100, y2: 0 }, { x: 50, y: 0 }, 1000),
    ).toBeNull();
  });

  it("a parede vista de lado não esconde nada", () => {
    expect(
      sombraNaVisao({ x1: 100, y1: 0, x2: 200, y2: 0 }, { x: 0, y: 0 }, 1000),
    ).toBeNull();
  });
});
