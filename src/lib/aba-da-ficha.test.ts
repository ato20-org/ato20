import { describe, expect, it } from "vitest";

import { LEMBRADAS, lembrar, lerLembradas } from "./aba-da-ficha";

describe("lerLembradas", () => {
  it("aceita só as abas conhecidas", () => {
    const cru = JSON.stringify({ a: "inventario", b: "magias", c: 3, d: "arquivos" });

    expect(lerLembradas(cru)).toEqual({ a: "inventario", d: "arquivos" });
  });

  it("volta vazio com disco ausente, quebrado ou de outro formato", () => {
    expect(lerLembradas(null)).toEqual({});
    expect(lerLembradas("{")).toEqual({});
    expect(lerLembradas(JSON.stringify(["ficha"]))).toEqual({});
    expect(lerLembradas("null")).toEqual({});
  });
});

describe("lembrar", () => {
  it("troca a aba da ficha e a põe no fim da fila", () => {
    const antes = { a: "ficha", b: "arquivos" } as const;
    const depois = lembrar(antes, "a", "inventario");

    expect(depois).toEqual({ b: "arquivos", a: "inventario" });
    expect(Object.keys(depois)).toEqual(["b", "a"]);
  });

  it("corta as mais antigas no teto", () => {
    let lembradas = {};
    for (let i = 0; i <= LEMBRADAS; i++) {
      lembradas = lembrar(lembradas, `p${i}`, "ficha");
    }

    const ids = Object.keys(lembradas);
    expect(ids).toHaveLength(LEMBRADAS);
    expect(ids[0]).toBe("p1");
    expect(ids.at(-1)).toBe(`p${LEMBRADAS}`);
  });
});
