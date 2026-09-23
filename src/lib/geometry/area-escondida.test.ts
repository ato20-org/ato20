import { describe, expect, it } from "vitest";

import {
  areaDoPoligono,
  normalizarPoligono,
  paraCaixa,
  paraCena,
  pontosNaCaixa,
} from "@/lib/geometry/area-escondida";

/** Duas casas bastam: o que se compara aqui é posição de cena, não precisão. */
function perto(valor: number): number {
  return Math.round(valor * 100) / 100;
}

describe("areaDoPoligono", () => {
  it("fecha o laço numa caixa com os vértices em fração dela", () => {
    expect(
      areaDoPoligono([
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 200 },
      ]),
    ).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      formato: "poligono",
      pontos: [0, 0, 1, 0, 1, 1],
    });
  });

  it("dá lado mínimo ao laço plano, para a fração não dividir por zero", () => {
    const area = areaDoPoligono([
      { x: 0, y: 50 },
      { x: 400, y: 50 },
    ]);

    expect(area.height).toBe(1);
    expect(area.pontos?.every(Number.isFinite)).toBe(true);
  });
});

describe("pontosNaCaixa", () => {
  it("devolve o vértice em coordenada local, sem giro", () => {
    expect(
      pontosNaCaixa({ x: 500, y: 500, width: 200, height: 100 }, [0, 0, 1, 0.5]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 50 },
    ]);
  });
});

describe("paraCena e paraCaixa", () => {
  it("são inversas, com e sem giro", () => {
    const caixa = { x: 300, y: 200, width: 400, height: 120, rotation: 37 };
    const local = { x: 90, y: 30 };

    const volta = paraCaixa(caixa, paraCena(caixa, local));

    expect(perto(volta.x)).toBe(local.x);
    expect(perto(volta.y)).toBe(local.y);
  });

  it("sem giro, o local é só a caixa somada", () => {
    expect(
      paraCena({ x: 10, y: 20, width: 100, height: 100 }, { x: 5, y: 5 }),
    ).toEqual({ x: 15, y: 25 });
  });
});

describe("normalizarPoligono", () => {
  it("reencaixa a caixa em volta do vértice que saiu dela", () => {
    const caixa = { x: 100, y: 100, width: 200, height: 100 };

    expect(
      normalizarPoligono(caixa, [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 0, y: 100 },
      ]),
    ).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 100,
      pontos: [0, 0, 1, 0, 0, 1],
    });
  });

  it("com giro, o que não se mexeu fica onde estava", () => {
    const caixa = { x: 100, y: 100, width: 200, height: 100, rotation: 30 };
    const parados = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ];
    const antes = parados.map((local) => paraCena(caixa, local));

    const nova = normalizarPoligono(caixa, [...parados, { x: 100, y: 260 }]);
    const depois = pontosNaCaixa(nova, nova.pontos).map((local) =>
      paraCena({ ...nova, rotation: caixa.rotation }, local),
    );

    expect(perto(depois[0].x)).toBe(perto(antes[0].x));
    expect(perto(depois[0].y)).toBe(perto(antes[0].y));
    expect(perto(depois[1].x)).toBe(perto(antes[1].x));
    expect(perto(depois[1].y)).toBe(perto(antes[1].y));
  });
});
