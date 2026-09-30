import { describe, expect, it } from "vitest";

import {
  rabiscoDaForma,
  rabiscoDoCaminho,
  sementeDe,
} from "@/lib/geometry/traco-a-mao";
import type { NewForma } from "@/types/scene";

const retangulo: NewForma = {
  tipo: "retangulo",
  x: 0,
  y: 0,
  width: 200,
  height: 120,
  rotation: 0,
  espessura: 4,
};

describe("sementeDe", () => {
  it("é a mesma para o mesmo id, e nunca zero", () => {
    expect(sementeDe("abc")).toBe(sementeDe("abc"));
    expect(sementeDe("abc")).not.toBe(sementeDe("abd"));
    expect(sementeDe("")).toBeGreaterThan(0);
  });
});

describe("rabiscoDaForma", () => {
  it("a mesma semente dá o mesmo rabisco: Mestre e TV desenham igual", () => {
    expect(rabiscoDaForma(retangulo, 7)).toEqual(rabiscoDaForma(retangulo, 7));
  });

  it("outra semente treme de outro jeito", () => {
    expect(rabiscoDaForma(retangulo, 7).contorno).not.toBe(
      rabiscoDaForma(retangulo, 8).contorno,
    );
  });

  it("só tem miolo quando a forma tem fundo", () => {
    expect(rabiscoDaForma(retangulo, 7).miolo).toBeUndefined();
    expect(
      rabiscoDaForma({ ...retangulo, fundo: "#f59e0b33" }, 7).miolo,
    ).toBeTruthy();
  });

  it("desenha os quatro tipos, com e sem canto, sem NaN", () => {
    const formas: NewForma[] = [
      retangulo,
      { ...retangulo, arredondado: true },
      { ...retangulo, tipo: "elipse" },
      { ...retangulo, tipo: "linha", diagonal: "secundaria" },
      { ...retangulo, tipo: "poligono", pontos: [0, 0, 1, 0.2, 0.5, 1] },
      { ...retangulo, tipo: "poligono", pontos: [0, 0, 1, 0.2, 0.5, 1], arredondado: true },
    ];

    for (const forma of formas) {
      const { contorno } = rabiscoDaForma(forma, 3);
      expect(contorno.length).toBeGreaterThan(0);
      expect(contorno).not.toContain("NaN");
    }
  });

  it("polígono sem vértices suficientes não desenha nada", () => {
    expect(
      rabiscoDaForma({ ...retangulo, tipo: "poligono", pontos: [0, 0] }, 3)
        .contorno,
    ).toBe("");
  });
});

describe("rabiscoDoCaminho", () => {
  it("treme a curva da seta, igual para a mesma semente", () => {
    const seta = "M 0 0 C 50 0 50 100 100 100";
    expect(rabiscoDoCaminho(seta, 5)).toBe(rabiscoDoCaminho(seta, 5));
    expect(rabiscoDoCaminho(seta, 5)).not.toContain("NaN");
  });
});
