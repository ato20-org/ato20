import { describe, expect, it } from "vitest";

import {
  lerExpressaoDeRolagem,
  textoDaExpressao,
  textoDoModificador,
  type ExpressaoDeRolagem,
} from "@/lib/mestre/expressao-de-rolagem";

function lida(texto: string): ExpressaoDeRolagem {
  const leitura = lerExpressaoDeRolagem(texto);
  if (!leitura.ok) throw new Error(`${texto}: ${leitura.erro}`);
  return leitura.expressao;
}

describe("lerExpressaoDeRolagem", () => {
  it.each([
    ["2d4", [[2, 4]], 0],
    ["1d20+5", [[1, 20]], 5],
    ["1d20+5-2*5/2", [[1, 20]], 0],
    ["d20 - 2", [[1, 20]], -2],
    ["2d6+1d4+3", [[2, 6], [1, 4]], 3],
    ["(3+1)*2+1d6", [[1, 6]], 8],
    ["1d20+7/2", [[1, 20]], 3],
    ["1d20-7/2", [[1, 20]], -3],
    ["2 D 10 + 4 × 1 ÷ 2", [[2, 10]], 2],
    ["-3+1d8", [[1, 8]], -3],
    ["1d100", [[1, 100]], 0],
  ])("%s", (texto, dados, modificador) => {
    expect(lida(texto)).toEqual({
      dados: dados.map(([quantidade, faces]) => ({ quantidade, faces })),
      modificador,
    });
  });

  it.each([
    ["", "vazia"],
    ["   ", "vazia"],
    ["5+3", "sem-dado"],
    ["1d20*2", "dado-fora-da-soma"],
    ["2d10×1", "dado-fora-da-soma"],
    ["1d20-1d4", "dado-fora-da-soma"],
    ["-1d6", "dado-fora-da-soma"],
    ["(1d20+5)*2", "dado-fora-da-soma"],
    ["1d7", "faces"],
    ["21d6", "muitos-dados"],
    ["11d6+10d4", "muitos-dados"],
    ["1d20+5/0", "divisao-por-zero"],
    ["1d20+99999", "modificador-grande"],
    ["1d20+", "sintaxe"],
    ["1d20 + abc", "sintaxe"],
    ["(1d20+5", "sintaxe"],
    ["0d6", "sintaxe"],
  ])("%j é recusada por %s", (texto, erro) => {
    expect(lerExpressaoDeRolagem(texto)).toEqual({ ok: false, erro });
  });
});

describe("textoDaExpressao", () => {
  it("escreve a forma curta", () => {
    expect(textoDaExpressao(lida("1d20+5-2*5/2"))).toBe("1d20");
    expect(textoDaExpressao(lida("2d6 + 1d4 + 3"))).toBe("2d6+1d4+3");
    expect(textoDaExpressao(lida("d20-2"))).toBe("1d20-2");
  });

  it("o modificador zero some", () => {
    expect(textoDoModificador(0)).toBe("");
    expect(textoDoModificador(5)).toBe("+5");
    expect(textoDoModificador(-2)).toBe("-2");
  });
});
