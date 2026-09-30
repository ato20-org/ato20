import { describe, expect, it } from "vitest";

import { ocorrencias } from "./search";

describe("ocorrencias", () => {
  it("todas as vezes, sem acento nem caixa, em índices do original", () => {
    expect(ocorrencias("Salão e salao e SALÃO", "salao")).toEqual([
      { inicio: 0, fim: 5 },
      { inicio: 8, fim: 13 },
      { inicio: 16, fim: 21 },
    ]);
  });

  it("não sobrepõe", () => {
    expect(ocorrencias("aaaa", "aa")).toEqual([
      { inicio: 0, fim: 2 },
      { inicio: 2, fim: 4 },
    ]);
  });

  it("texto decomposto: o achado cobre o acento junto", () => {
    const texto = "Salão".normalize("NFD");
    expect(ocorrencias(texto, "salao")).toEqual([{ inicio: 0, fim: 6 }]);
  });

  it("termo vazio não acha nada", () => {
    expect(ocorrencias("texto", "")).toEqual([]);
  });
});
