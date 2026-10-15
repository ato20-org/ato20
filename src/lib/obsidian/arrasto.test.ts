import { describe, expect, it } from "vitest";

import { rotuloDoQueVem } from "@/lib/obsidian/arrasto";

const item = (nome: string, tipo: "pasta" | "vault" | "arquivo") => ({ caminho: `/x/${nome}`, nome, tipo });

describe("rotuloDoQueVem", () => {
  it("um item diz o nome e o que ele é", () => {
    expect(rotuloDoQueVem([item("Lendas", "vault")])).toBe("Vault do Obsidian · Lendas");
    expect(rotuloDoQueVem([item("Fotos", "pasta")])).toBe("Pasta · Fotos");
    expect(rotuloDoQueVem([item("a.md", "arquivo")])).toBe("Arquivo · a.md");
  });

  it("vários dizem quantos de cada", () => {
    expect(rotuloDoQueVem([item("A", "vault"), item("B", "pasta"), item("c.png", "arquivo")])).toBe(
      "2 pastas e 1 arquivo",
    );
    expect(rotuloDoQueVem([item("a.md", "arquivo"), item("b.md", "arquivo")])).toBe("2 arquivos");
  });

  it("antes de identificar, o convite", () => {
    expect(rotuloDoQueVem([])).toBe("Solte para importar");
  });
});
