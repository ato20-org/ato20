import { describe, expect, it } from "vitest";

import { aplicarTom, tamanhoAssado } from "@/lib/tom-do-mapa";

const NEUTRO = { brilho: 100, contraste: 100, saturacao: 100, matiz: 0 };

/** Um pixel RGBA, pintado, de volta como array comum. */
function pintar(rgba: number[], ajuste: Partial<typeof NEUTRO>): number[] {
  const dados = new Uint8ClampedArray(rgba);
  aplicarTom(dados, { ...NEUTRO, ...ajuste });
  return [...dados];
}

describe("aplicarTom", () => {
  it("neutro deixa o pixel como está", () => {
    expect(pintar([10, 120, 250, 200], {})).toEqual([10, 120, 250, 200]);
  });

  it("brilho multiplica e corta no branco, sem mexer no alfa", () => {
    expect(pintar([100, 200, 50, 77], { brilho: 150 })).toEqual([150, 255, 75, 77]);
  });

  it("contraste afasta do cinza médio", () => {
    const [r, , b] = pintar([64, 128, 191, 255], { contraste: 200 });
    expect(r).toBeLessThan(10);
    expect(b).toBeGreaterThan(245);
  });

  // Saturação zero é o cinza pela luminância de Filter Effects: os três
  // canais iguais.
  it("saturação zero vira cinza", () => {
    const [r, g, b] = pintar([200, 40, 90, 255], { saturacao: 0 });
    expect(g).toBe(r);
    expect(b).toBe(r);
  });

  it("matiz de meia volta leva o vermelho para o lado do ciano", () => {
    const [r, g, b] = pintar([200, 30, 30, 255], { matiz: 180 });
    expect(r).toBeLessThan(g);
    expect(r).toBeLessThan(b);
  });
});

describe("tamanhoAssado", () => {
  it("mantém o mapa que cabe no palco", () => {
    expect(tamanhoAssado(1200, 1867)).toEqual({ largura: 1200, altura: 1867 });
  });

  it("reduz o maior lado para 4096, na mesma proporção", () => {
    expect(tamanhoAssado(8192, 4096)).toEqual({ largura: 4096, altura: 2048 });
  });
});
