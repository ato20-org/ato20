import { describe, expect, it } from "vitest";

import {
  deltaDaRoda,
  LARGURA_DO_LAPIS_MAXIMA,
  LARGURA_DO_LAPIS_MINIMA,
  proximoTamanhoDoPincel,
} from "@/lib/geometry/pincel";
import { caminhoMacio, cortarRisco, pontaNaCorda } from "@/lib/geometry/risco";

describe("pontaNaCorda", () => {
  it("dentro da corda a ponta fica: o tremido some", () => {
    expect(pontaNaCorda({ x: 0, y: 0 }, { x: 3, y: 4 }, 10)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("fora dela a ponta anda o que passou, na direção do cursor", () => {
    // O cursor a 20 numa corda de 5: a ponta para a 5 dele.
    const ponta = pontaNaCorda({ x: 0, y: 0 }, { x: 20, y: 0 }, 5);
    expect(ponta.x).toBeCloseTo(15);
    expect(ponta.y).toBeCloseTo(0);
  });

  it("corda zero é o lápis cru: a ponta é o cursor", () => {
    expect(pontaNaCorda({ x: 1, y: 1 }, { x: 7, y: -2 }, 0)).toEqual({
      x: 7,
      y: -2,
    });
  });
});

describe("caminhoMacio", () => {
  it("sem ponto, sem caminho", () => {
    expect(caminhoMacio([])).toBe("");
  });

  it("um ponto é o traço de comprimento zero, a bolinha", () => {
    expect(caminhoMacio([5, 6])).toBe("M5 6L5 6");
  });

  it("dois pontos são a reta", () => {
    expect(caminhoMacio([0, 0, 10, 0])).toBe("M0 0L10 0");
  });

  it("três ou mais: curvas pelos meios, pontas exatas", () => {
    expect(caminhoMacio([0, 0, 10, 0, 10, 10])).toBe(
      "M0 0L5 0Q10 0 10 5L10 10",
    );
  });

  it("ignora a coordenada sobrando de uma lista ímpar", () => {
    expect(caminhoMacio([0, 0, 10, 0, 99])).toBe("M0 0L10 0");
  });
});

describe("proximoTamanhoDoPincel", () => {
  it("o fino cresce: o piso de uma unidade por passo", () => {
    expect(proximoTamanhoDoPincel(1, 1, 1, 64)).toBe(2);
    expect(proximoTamanhoDoPincel(2, 1, 1, 64)).toBe(3);
  });

  it("o grosso anda por fator", () => {
    expect(proximoTamanhoDoPincel(40, 1, 1, 64)).toBe(50);
    expect(proximoTamanhoDoPincel(50, -1, 1, 64)).toBe(40);
  });

  it("para nos limites", () => {
    expect(
      proximoTamanhoDoPincel(
        LARGURA_DO_LAPIS_MAXIMA,
        1,
        LARGURA_DO_LAPIS_MINIMA,
        LARGURA_DO_LAPIS_MAXIMA,
      ),
    ).toBe(LARGURA_DO_LAPIS_MAXIMA);
    expect(
      proximoTamanhoDoPincel(
        LARGURA_DO_LAPIS_MINIMA,
        -1,
        LARGURA_DO_LAPIS_MINIMA,
        LARGURA_DO_LAPIS_MAXIMA,
      ),
    ).toBe(LARGURA_DO_LAPIS_MINIMA);
  });
});

describe("deltaDaRoda", () => {
  it("o eixo vertical, quando há", () => {
    expect(deltaDaRoda({ deltaX: 30, deltaY: -50, deltaMode: 0 })).toBe(-50);
  });

  it("o horizontal quando o Alt virou a roda de lado", () => {
    expect(deltaDaRoda({ deltaX: -50, deltaY: 0, deltaMode: 0 })).toBe(-50);
  });

  it("linhas viram pixels", () => {
    expect(deltaDaRoda({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBe(48);
  });
});

describe("cortarRisco", () => {
  // Uma reta de 0 a 100 no eixo x, gravada só com as pontas: o caso do risco
  // riscado depressa, em que a borracha cai entre duas amostras.
  const reta = [0, 0, 100, 0];

  it("longe do risco, nada: `null`, e quem chama fica com o original", () => {
    expect(cortarRisco(reta, [{ x: 50, y: 40 }], 10)).toBeNull();
  });

  it("no meio, o risco vira dois, mesmo sem amostra perto da borracha", () => {
    const pedacos = cortarRisco(reta, [{ x: 50, y: 0 }], 10)!;

    expect(pedacos).toHaveLength(2);
    const [esquerda, direita] = pedacos;
    // O fim da esquerda e o começo da direita ficam fora do alcance, e perto
    // da borda dele: o adensamento é de um terço do alcance.
    const fim = esquerda![esquerda!.length - 2]!;
    const comeco = direita![0]!;
    expect(fim).toBeLessThan(40);
    expect(fim).toBeGreaterThan(35);
    expect(comeco).toBeGreaterThan(60);
    expect(comeco).toBeLessThan(65);
    // As pontas de fora continuam exatas.
    expect(esquerda!.slice(0, 2)).toEqual([0, 0]);
    expect(direita!.slice(-2)).toEqual([100, 0]);
  });

  it("a passada que CRUZA o risco entre duas amostras dela também corta", () => {
    const pedacos = cortarRisco(
      reta,
      [
        { x: 50, y: -50 },
        { x: 50, y: 50 },
      ],
      5,
    );

    expect(pedacos).toHaveLength(2);
  });

  it("na ponta, sobra um pedaço só", () => {
    const pedacos = cortarRisco(reta, [{ x: 100, y: 0 }], 10)!;

    expect(pedacos).toHaveLength(1);
    expect(pedacos[0]!.slice(0, 2)).toEqual([0, 0]);
  });

  it("a borracha maior que o risco leva tudo: lista vazia", () => {
    expect(cortarRisco([10, 0, 20, 0], [{ x: 15, y: 0 }], 30)).toEqual([]);
  });

  it("a migalha de um ponto só some", () => {
    // Três pontos a uma unidade um do outro, sem trecho a adensar: a borracha
    // leva os dois primeiros, e sobraria só o último.
    expect(cortarRisco([0, 0, 1, 0, 2, 0], [{ x: 0, y: 0 }], 1.5)).toEqual([]);
  });

  it("o trecho depois da borracha continua, sem engordar o risco", () => {
    // Do adensamento fica só a borda do corte: o resto da reta continua com
    // as amostras que já tinha.
    expect(cortarRisco([0, 0, 2, 0, 20, 0], [{ x: 0, y: 0 }], 3)).toEqual([
      [4, 0, 20, 0],
    ]);
  });
});
