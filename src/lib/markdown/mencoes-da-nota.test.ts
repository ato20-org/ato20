import { describe, expect, it } from "vitest";

import { mencoesDaNota } from "./mencoes-da-nota";

describe("mencoesDaNota", () => {
  it("junta por tipo e nome sem acento nem caixa, com linhas e vezes", () => {
    const texto = [
      "# Porão",
      "@Thalor entra, e @thalor vê o /porao.jpg",
      "",
      "- @Álvaro fica em >Porão",
      "@Thalor de novo",
    ].join("\n");

    expect(mencoesDaNota(texto)).toEqual([
      { tipo: "personagem", nome: "Thalor", bruto: "@Thalor", linhas: [1, 4], vezes: 3 },
      { tipo: "arquivo", nome: "porao.jpg", bruto: "/porao.jpg", linhas: [1], vezes: 1 },
      { tipo: "personagem", nome: "Álvaro", bruto: "@Álvaro", linhas: [3], vezes: 1 },
      { tipo: "cena", nome: "Porão", bruto: ">Porão", linhas: [3], vezes: 1 },
    ]);
  });

  it("a linha de prévia conta sem a largura, e `>` de citação não é cena", () => {
    expect(mencoesDaNota("/porao.jpg|320\n> fala baixa\n!Agarrar")).toEqual([
      { tipo: "arquivo", nome: "porao.jpg", bruto: "/porao.jpg", linhas: [0], vezes: 1 },
      { tipo: "marcador", nome: "Agarrar", bruto: "!Agarrar", linhas: [2], vezes: 1 },
    ]);
  });

  it("a fileira conta cada menção, sem os ajustes", () => {
    expect(mencoesDaNota("/mapa.png|240 @Thalor|centro").map((m) => m.nome)).toEqual([
      "mapa.png",
      "Thalor",
    ]);
  });

  it("nome composto entre aspas", () => {
    expect(mencoesDaNota('ver @"Thalor Pé-de-Ferro"')[0]).toMatchObject({
      nome: "Thalor Pé-de-Ferro",
      bruto: '@"Thalor Pé-de-Ferro"',
    });
  });

  it("nota sem menção", () => {
    expect(mencoesDaNota("só texto, e-mail@casa e 3/4")).toEqual([]);
  });
});
