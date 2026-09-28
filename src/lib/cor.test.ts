import { describe, expect, it } from "vitest";

import { hexParaHsv, hsvParaHex, normalizarHex } from "@/lib/cor";

describe("normalizarHex", () => {
  it("aceita com e sem #, e devolve minúsculo", () => {
    expect(normalizarHex("#FB923C")).toBe("#fb923c");
    expect(normalizarHex("fb923c")).toBe("#fb923c");
  });

  it("aceita a forma curta de três dígitos", () => {
    expect(normalizarHex("#0f8")).toBe("#00ff88");
  });

  it("o que não é cor é `null`", () => {
    expect(normalizarHex("laranja")).toBeNull();
    expect(normalizarHex("#12345")).toBeNull();
    expect(normalizarHex("")).toBeNull();
  });
});

describe("hexParaHsv e hsvParaHex", () => {
  it("as primárias caem nos ângulos certos", () => {
    expect(hexParaHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexParaHsv("#00ff00")?.h).toBeCloseTo(120);
    expect(hexParaHsv("#0000ff")?.h).toBeCloseTo(240);
  });

  it("cinza não tem saturação, e preto não tem brilho", () => {
    expect(hexParaHsv("#808080")?.s).toBe(0);
    expect(hexParaHsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
  });

  it("ida e volta devolve a mesma cor, em toda a paleta da luz", () => {
    for (const cor of [
      "#fb923c",
      "#fde68a",
      "#93c5fd",
      "#c4b5fd",
      "#86efac",
      "#fca5a5",
      "#6366f1",
    ]) {
      expect(hsvParaHex(hexParaHsv(cor)!)).toBe(cor);
    }
  });

  it("matiz fora de 0..360 dá a volta, e não quebra", () => {
    expect(hsvParaHex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvParaHex({ h: -120, s: 1, v: 1 })).toBe("#0000ff");
  });
});
