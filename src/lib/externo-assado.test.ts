import { describe, expect, it } from "vitest";

import { precisaDeForno } from "./externo-assado";
import {
  gradeDoSprite,
  mascaraDaBorda,
  processarFolha,
  rampaDaCor,
  tamanhoDaFolha,
  tamanhoDoSprite,
} from "./folha-de-efeito";

describe("mascaraDaBorda", () => {
  const quadrado = [
    { x: 30, y: 30 },
    { x: 130, y: 30 },
    { x: 130, y: 130 },
    { x: 30, y: 130 },
  ];
  const borda = { largura: 16, semente: 7 };
  const mascara = mascaraDaBorda(160, 160, quadrado, borda);
  const alfa = (x: number, y: number) => mascara[(y * 160 + x) * 4 + 3]!;
  // A aresta de cima, longe dos cantos.
  const linha = Array.from({ length: 70 }, (_, i) => alfa(45 + i, 30));

  it("cheia por dentro, vazia por fora, e nada além de uma largura da linha", () => {
    expect(alfa(80, 80)).toBe(255);
    expect(alfa(80, 30 + 16)).toBe(255);
    expect(alfa(5, 5)).toBe(0);
    expect(alfa(80, 30 - 16)).toBe(0);
    expect(mascara[0]).toBe(255);
  });

  it("na linha, a base pela metade, em média: a linha fica no meio da fumaça", () => {
    const media = linha.reduce((soma, valor) => soma + valor, 0) / linha.length;

    expect(media).toBeGreaterThan(70);
    expect(media).toBeLessThan(180);
  });

  it("irregular ao longo da linha: fumaça, e não um degradê de régua", () => {
    expect(Math.max(...linha) - Math.min(...linha)).toBeGreaterThan(80);
  });

  it("a mesma semente dá a mesma borda; outra, outra", () => {
    expect(mascaraDaBorda(160, 160, quadrado, borda)).toEqual(mascara);
    expect(mascaraDaBorda(160, 160, quadrado, { ...borda, semente: 8 })).not.toEqual(mascara);
  });
});

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

describe("o sprite da partícula", () => {
  it("encolhe cada quadro até 192, e a grade continua inteira", () => {
    // Um símbolo de 755x1124, sozinho.
    expect(tamanhoDoSprite(755, 1124)).toEqual({ largura: 129, altura: 192 });
    // Uma grade 4x2 de quadros de 256: cada um vira 192, a folha 768x384.
    expect(tamanhoDoSprite(1024, 512, 4, 2)).toEqual({ largura: 768, altura: 384 });
  });

  it("a grade sai da contagem, e sem ela é um quadro só", () => {
    expect(gradeDoSprite({ colunas: 4, total: 8, fps: 12 })).toEqual({
      colunas: 4,
      linhas: 2,
      total: 8,
      fps: 12,
    });
    expect(gradeDoSprite()).toEqual({ colunas: 1, linhas: 1, total: 1 });
  });
});

describe("tamanhoDaFolha", () => {
  it("a foto grande do editor é assada com o quadro até 1024, e a grade fica cheia", () => {
    expect(tamanhoDaFolha(4000, 3000, 1, 1)).toEqual({ largura: 1024, altura: 768, ql: 1024, qa: 768 });
    expect(tamanhoDaFolha(2048, 2048, 4, 4)).toEqual({ largura: 2048, altura: 2048, ql: 512, qa: 512 });
  });
});
