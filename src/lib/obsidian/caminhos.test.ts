import { describe, expect, it } from "vitest";

import { criarResolvedor, pastasDe, semExtensao } from "@/lib/obsidian/caminhos";

describe("pastasDe", () => {
  it("as de cima antes das de baixo, sem repetir e sem a raiz", () => {
    expect(
      pastasDe([
        "Personagens/Npc/Igreja/Padre.md",
        "Personagens/Players/Cristino.md",
        "História.md",
        "Cenários/Poço.md",
      ]),
    ).toEqual([
      "Cenários",
      "Personagens",
      "Personagens/Npc",
      "Personagens/Players",
      "Personagens/Npc/Igreja",
    ]);
  });
});

describe("semExtensao", () => {
  it("tira a pasta e a extensão, e só a última", () => {
    expect(semExtensao("Cenários/Poço.md")).toBe("Poço");
    expect(semExtensao("Itens/v1.2.canvas")).toBe("v1.2");
    expect(semExtensao(".oculto")).toBe(".oculto");
  });
});

describe("criarResolvedor", () => {
  const resolver = criarResolvedor([
    "Imagens/Npc/PadreArlindoBatista.png",
    "Imagens/Poço.jpg",
    "Cenários/Poço.md",
    "Arquivo/Velho/Poço.jpg",
    "Personagens/Npc/Igreja/Padre Arlindo Batista.md",
  ]);

  it("acha pelo nome só, como o Obsidian escreve", () => {
    expect(resolver("PadreArlindoBatista.png", "Personagens/Npc/Igreja/Padre Arlindo Batista.md")).toBe(
      "Imagens/Npc/PadreArlindoBatista.png",
    );
  });

  it("com o nome repetido, ganha o caminho mais curto", () => {
    expect(resolver("Poço.jpg", "Cenários/Poço.md")).toBe("Imagens/Poço.jpg");
  });

  it("o caminho inteiro e o relativo à nota vencem o nome", () => {
    expect(resolver("Arquivo/Velho/Poço.jpg", "x.md")).toBe("Arquivo/Velho/Poço.jpg");
    expect(resolver("Velho/Poço.jpg", "Arquivo/nota.md")).toBe("Arquivo/Velho/Poço.jpg");
  });

  it("nota sem o .md e sem caixa", () => {
    expect(resolver("padre arlindo batista", "x.md")).toBe(
      "Personagens/Npc/Igreja/Padre Arlindo Batista.md",
    );
    expect(resolver("POÇO.JPG", "x.md")).toBe("Imagens/Poço.jpg");
  });

  it("o que não existe é null", () => {
    expect(resolver("Nada.png", "x.md")).toBeNull();
    expect(resolver("  ", "x.md")).toBeNull();
  });
});
