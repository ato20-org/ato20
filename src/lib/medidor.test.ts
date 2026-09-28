import { describe, expect, it } from "vitest";

import type { Medidor } from "@/types/character";

import {
  fracaoDoMedidor,
  medidoresVisiveis,
  pontosDoMedidor,
  textoDoMedidor,
} from "./medidor";

function medidor(extra: Partial<Medidor> = {}): Medidor {
  return {
    id: "m1",
    nome: "Vida",
    cor: "#ef4444",
    estilo: "barra",
    atual: 14,
    maximo: 20,
    escondido: false,
    ...extra,
  };
}

describe("fracaoDoMedidor", () => {
  it("é a razão entre atual e máximo", () => {
    expect(fracaoDoMedidor(medidor())).toBeCloseTo(0.7);
  });

  it("nunca passa de um nem cai abaixo de zero", () => {
    // O Rust prende os dois na escrita. Isto é sobre o arquivo editado à mão e
    // o quadro de uma versão futura, que não passam por lá.
    expect(fracaoDoMedidor(medidor({ atual: 99 }))).toBe(1);
    expect(fracaoDoMedidor(medidor({ atual: -5 }))).toBe(0);
  });

  it("devolve zero em vez de NaN quando o máximo não vale", () => {
    // NaN numa largura de CSS não desenha barra errada: some com a linha, num
    // quadro publicado dez vezes por segundo que ninguém olha no inspetor.
    expect(fracaoDoMedidor(medidor({ maximo: 0 }))).toBe(0);
    expect(fracaoDoMedidor(medidor({ maximo: -3 }))).toBe(0);
    expect(fracaoDoMedidor(medidor({ maximo: Number.NaN }))).toBe(0);
    expect(fracaoDoMedidor(medidor({ atual: Number.NaN }))).toBe(0);
  });
});

describe("textoDoMedidor", () => {
  it("diz os dois números na barra e nos pontos", () => {
    expect(textoDoMedidor(medidor())).toBe("14/20");
    expect(textoDoMedidor(medidor({ estilo: "pontos" }))).toBe("14/20");
  });

  it("omite a escala na porcentagem", () => {
    expect(textoDoMedidor(medidor({ estilo: "porcentagem" }))).toBe("70%");
  });

  it("arredonda a porcentagem para inteiro", () => {
    expect(
      textoDoMedidor(medidor({ estilo: "porcentagem", atual: 1, maximo: 3 })),
    ).toBe("33%");
  });
});

describe("pontosDoMedidor", () => {
  it("conta as bolinhas cheias e o total", () => {
    expect(pontosDoMedidor(medidor({ atual: 2, maximo: 5 }))).toEqual({
      total: 5,
      cheios: 2,
    });
  });

  it("não deixa o cheio passar do total nem ficar negativo", () => {
    expect(pontosDoMedidor(medidor({ atual: 9, maximo: 3 })).cheios).toBe(3);
    expect(pontosDoMedidor(medidor({ atual: -1, maximo: 3 })).cheios).toBe(0);
  });

  it("tem ao menos um ponto, para não desenhar fileira vazia", () => {
    expect(pontosDoMedidor(medidor({ maximo: 0 })).total).toBe(1);
  });
});

describe("medidoresVisiveis", () => {
  it("tira os escondidos e mantém a ordem", () => {
    const lista = [
      medidor({ id: "a" }),
      medidor({ id: "b", escondido: true }),
      medidor({ id: "c" }),
    ];

    expect(medidoresVisiveis(lista).map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("aceita a ausência do campo, que é o caso da campanha antiga", () => {
    expect(medidoresVisiveis(undefined)).toEqual([]);
  });
});
