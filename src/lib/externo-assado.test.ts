import { describe, expect, it } from "vitest";

import { precisaDeForno } from "./externo-assado";
import { processarFolha, rampaDaCor } from "./folha-de-efeito";

describe("rampaDaCor", () => {
  it("escura no frio, a cor no meio, quase branca no miolo", () => {
    const rampa = rampaDaCor("#f59e0b");
    const em = (i: number) => [...rampa.slice(i * 3, i * 3 + 3)];

    expect(em(0)).toEqual([86, 55, 4]);
    expect(em(115)).toEqual([245, 158, 11]);
    expect(em(255)[0]).toBeGreaterThan(250);
  });
});

describe("processarFolha", () => {
  // Uma folha de 2 quadros de 2x1: calor 0 e 255, alfa cheio.
  const px = new Uint8ClampedArray([
    0, 0, 0, 255, 255, 255, 255, 255, // quadro 1
    0, 0, 0, 255, 255, 255, 255, 255, // quadro 2
  ]);
  const folha = { px, largura: 4, altura: 1, colunas: 2, linhas: 1 };

  it("a rampa pinta pelo calor, e a máscara vale por QUADRO", () => {
    const saida = processarFolha({
      ...folha,
      rampa: rampaDaCor("#0000ff"),
      // Apaga o segundo pixel de cada quadro.
      mascara: new Float32Array([1, 0]),
    });

    if (!("unica" in saida)) throw new Error("devia sair uma folha só");
    expect([...saida.unica.slice(0, 4)]).toEqual([0, 0, 89, 255]);
    expect(saida.unica[7]).toBe(0);
    expect(saida.unica[15]).toBe(0);
  });

  it("a profundidade divide o alfa entre a frente e o atrás", () => {
    const saida = processarFolha({ ...folha, profundidade: new Float32Array([1, 0.25]) });

    if ("unica" in saida) throw new Error("devia sair dividida");
    // Primeiro pixel do quadro: todo na frente.
    expect(saida.frente[3]).toBe(255);
    expect(saida.atras[3]).toBe(0);
    // Segundo: um quarto na frente, três quartos atrás.
    expect(saida.frente[7]).toBe(64);
    expect(saida.atras[7]).toBe(191);
  });
});

describe("precisaDeForno", () => {
  it("só com cor, máscara ou profundidade", () => {
    expect(precisaDeForno({})).toBe(false);
    expect(precisaDeForno({ mascara: "m.webp" })).toBe(true);
    expect(precisaDeForno({ cores: { cor: "#fff" } })).toBe(true);
  });
});
