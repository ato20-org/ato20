import { describe, expect, it } from "vitest";

import {
  COMPRIMENTO_MAX,
  COMPRIMENTO_MIN,
  LONGE_PX,
  PERTO_PX,
  comprimentoDoRaio,
  raioDoComprimento,
  solNoCeu,
  sombraDoPonteiro,
} from "@/lib/geometry/ceu";

describe("sombraDoPonteiro", () => {
  it("a sombra cai do lado OPOSTO ao sol", () => {
    // O sol à esquerda do meio: a sombra vai para a direita, que é zero grau.
    expect(sombraDoPonteiro(-50, 0).angulo).toBe(0);
    // E o sol em cima joga a sombra para baixo.
    expect(sombraDoPonteiro(0, -50).angulo).toBe(90);
  });

  it("o ângulo fica dentro de uma volta, e inteiro", () => {
    const { angulo } = sombraDoPonteiro(50, 1);

    expect(angulo).toBeGreaterThanOrEqual(0);
    expect(angulo).toBeLessThan(360);
    expect(Number.isInteger(angulo)).toBe(true);
  });

  it("Shift trava de quinze em quinze", () => {
    // Um ponteiro a uns 38 graus do eixo, travado, cai no múltiplo de 15.
    const solto = sombraDoPonteiro(-50, -39).angulo;
    const travado = sombraDoPonteiro(-50, -39, true).angulo;

    expect(solto % 15).not.toBe(0);
    expect(travado % 15).toBe(0);
    expect(Math.abs(travado - solto)).toBeLessThanOrEqual(8);
  });

  it("perto do meio a sombra é a mais curta, no horizonte a mais longa", () => {
    expect(sombraDoPonteiro(PERTO_PX, 0).comprimento).toBe(COMPRIMENTO_MIN);
    expect(sombraDoPonteiro(LONGE_PX, 0).comprimento).toBe(COMPRIMENTO_MAX);
  });

  it("dentro do meio e fora do horizonte não passam dos limites", () => {
    expect(sombraDoPonteiro(2, 0).comprimento).toBe(COMPRIMENTO_MIN);
    expect(sombraDoPonteiro(900, 0).comprimento).toBe(COMPRIMENTO_MAX);
  });

  it("é o caminho de volta de onde o sol é desenhado", () => {
    const sol = solNoCeu(215, 0.8);
    const volta = sombraDoPonteiro(sol.x, sol.y);

    expect(volta.angulo).toBe(215);
    expect(volta.comprimento).toBeCloseTo(0.8, 2);
  });
});

describe("raioDoComprimento", () => {
  it("o mínimo fica no anel de perto e o máximo no horizonte", () => {
    expect(raioDoComprimento(COMPRIMENTO_MIN)).toBe(PERTO_PX);
    expect(raioDoComprimento(COMPRIMENTO_MAX)).toBe(LONGE_PX);
  });

  it("desfaz `comprimentoDoRaio`, que é o que o arrasto usa", () => {
    for (const raio of [PERTO_PX, 45, 60, LONGE_PX]) {
      expect(raioDoComprimento(comprimentoDoRaio(raio))).toBeCloseTo(raio, 0);
    }
  });
});
