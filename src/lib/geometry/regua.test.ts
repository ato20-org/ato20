import { describe, expect, it } from "vitest";

import {
  caixaDoRetangulo,
  formatarArea,
  reguaVazia,
  moverRegua,
  rotuloDoMedidor,
} from "@/lib/geometry/regua";
import type { Regua, SceneGrid } from "@/types/scene";

/** Um quadrado de 50 unidades: 50 unidades = 1 m. */
const grid = { size: 50 } as SceneGrid;

function medidor(parcial: Partial<Regua>): Regua {
  return {
    id: "m",
    forma: "linha",
    x: 0,
    y: 0,
    x2: 0,
    y2: 0,
    cor: "#fff",
    ...parcial,
  };
}

describe("rótulo do medidor", () => {
  it("a régua diz o comprimento em linha reta", () => {
    expect(rotuloDoMedidor(medidor({ x2: 150, y2: 200 }), grid)).toBe("5.0 m");
  });

  it("o círculo diz raio e área", () => {
    expect(
      rotuloDoMedidor(medidor({ forma: "circulo", x2: 100 }), grid),
    ).toBe("r 2.0 m · 13 m²");
  });

  it("o cone diz alcance, abertura e área do setor", () => {
    // Raio 2 m, 90°: um quarto de círculo, π m².
    expect(
      rotuloDoMedidor(medidor({ forma: "cone", x2: 100, abertura: 90 }), grid),
    ).toBe("2.0 m · 90° · 3.1 m²");
  });

  it("o retângulo diz os lados e a área, para qualquer lado que se arraste", () => {
    expect(
      rotuloDoMedidor(medidor({ forma: "retangulo", x2: -200, y2: 150 }), grid),
    ).toBe("4.0 × 3.0 m · 12 m²");
  });
});

describe("área", () => {
  it("um decimal até 10, inteiro acima", () => {
    expect(formatarArea(3.14159)).toBe("3.1 m²");
    expect(formatarArea(12.6)).toBe("13 m²");
  });
});

describe("gestos", () => {
  it("mover leva as duas pontas juntas", () => {
    const movido = moverRegua(medidor({ x: 1, y: 2, x2: 3, y2: 4 }), {
      x: 10,
      y: 20,
    });

    expect(movido).toMatchObject({ x: 11, y: 22, x2: 13, y2: 24 });
  });

  it("um clique sem arrasto é medidor vazio", () => {
    expect(reguaVazia({ x: 0, y: 0, x2: 2, y2: 2 })).toBe(true);
    expect(reguaVazia({ x: 0, y: 0, x2: 10, y2: 0 })).toBe(false);
  });

  it("a caixa do retângulo é normalizada", () => {
    expect(caixaDoRetangulo(medidor({ x: 10, y: 10, x2: -5, y2: 30 }))).toEqual({
      x: -5,
      y: 10,
      width: 15,
      height: 20,
    });
  });
});
