import { describe, expect, it } from "vitest";

import {
  ehFundo,
  ehMapa,
  ehQuadro,
  temAnotacao,
  temCamera,
  temChao,
  temGrade,
  temMedida,
  temNevoa,
  temSol,
  type TipoDeCena,
} from "@/types/scene";

/** A tabela do comentário de `temChao`, escrita uma vez e conferida aqui. */
const TABELA: Record<
  "mapa" | TipoDeCena,
  Record<string, boolean>
> = {
  mapa: {
    temChao: true,
    temAnotacao: true,
    temCamera: true,
    temGrade: true,
    temNevoa: true,
    temSol: true,
    temMedida: true,
  },
  fundo: {
    temChao: true,
    temAnotacao: true,
    temCamera: false,
    temGrade: false,
    temNevoa: false,
    temSol: false,
    temMedida: false,
  },
  quadro: {
    temChao: false,
    temAnotacao: false,
    temCamera: false,
    temGrade: false,
    temNevoa: false,
    temSol: false,
    temMedida: false,
  },
};

const PERGUNTAS = {
  temChao,
  temAnotacao,
  temCamera,
  temGrade,
  temNevoa,
  temSol,
  temMedida,
};

describe("o que cada tipo de cena sabe fazer", () => {
  for (const [nome, esperado] of Object.entries(TABELA)) {
    // `undefined` é mapa, e é assim que ele chega no arquivo da cena.
    const tipo = nome === "mapa" ? undefined : (nome as TipoDeCena);

    it(`${nome} responde a tabela inteira`, () => {
      for (const [pergunta, resposta] of Object.entries(esperado)) {
        expect(
          PERGUNTAS[pergunta as keyof typeof PERGUNTAS]({ tipo }),
          `${pergunta} em ${nome}`,
        ).toBe(resposta);
      }
    });
  }

  it("os três tipos se distinguem, e o mapa é a ausência de tipo", () => {
    expect(ehMapa({ tipo: undefined })).toBe(true);
    expect(ehFundo({ tipo: "fundo" })).toBe(true);
    expect(ehQuadro({ tipo: "quadro" })).toBe(true);

    expect(ehMapa({ tipo: "fundo" })).toBe(false);
    expect(ehFundo({ tipo: "quadro" })).toBe(false);
    expect(ehQuadro({ tipo: undefined })).toBe(false);
  });
});
