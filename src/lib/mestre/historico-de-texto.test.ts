import { describe, expect, it } from "vitest";

import { deslocamentoDe, posicaoDe } from "@/lib/mestre/historico-de-texto";

describe("posicaoDe / deslocamentoDe", () => {
  const texto = "ab\ncde\n\nf";

  it("vão e voltam", () => {
    for (let d = 0; d <= texto.length; d++) {
      const { indice, cursor } = posicaoDe(texto, d);
      expect(deslocamentoDe(texto, indice, cursor)).toBe(d);
    }
  });

  it("cai na linha certa", () => {
    expect(posicaoDe(texto, 0)).toEqual({ indice: 0, cursor: 0 });
    expect(posicaoDe(texto, 2)).toEqual({ indice: 0, cursor: 2 });
    expect(posicaoDe(texto, 3)).toEqual({ indice: 1, cursor: 0 });
    expect(posicaoDe(texto, 7)).toEqual({ indice: 2, cursor: 0 });
    expect(posicaoDe(texto, 99)).toEqual({ indice: 3, cursor: 1 });
  });
});
