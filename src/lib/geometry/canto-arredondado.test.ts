import { describe, expect, it } from "vitest";

import {
  caminhoArredondado,
  raioDoCanto,
} from "@/lib/geometry/canto-arredondado";

describe("raioDoCanto", () => {
  it("é um quarto do lado menor", () => {
    expect(raioDoCanto(80, 40)).toBe(10);
  });

  it("para no teto em caixa grande", () => {
    expect(raioDoCanto(800, 600)).toBe(32);
  });
});

describe("caminhoArredondado", () => {
  const quadrado = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it("corta cada vértice a `raio` de distância e curva nele", () => {
    expect(caminhoArredondado(quadrado, 10)).toBe(
      "M10,0 L90,0 Q100,0 100,10 L100,90 Q100,100 90,100 L10,100 Q0,100 0,90 L0,10 Q0,0 10,0 Z",
    );
  });

  it("não corta além da metade do lado", () => {
    // Raio 80 num lado de 100: o corte para em 50, e as curvas se encontram
    // no meio do lado em vez de se cruzarem.
    expect(caminhoArredondado(quadrado, 80)).toContain("M50,0 L50,0");
  });

  it("vértice repetido fica sem curva, e não vira NaN", () => {
    const caminho = caminhoArredondado(
      [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }],
      10,
    );
    expect(caminho).not.toContain("NaN");
  });

  it("menos de três pontos não fecha figura", () => {
    expect(caminhoArredondado([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5)).toBe("");
  });
});
