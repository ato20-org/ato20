import { describe, expect, it } from "vitest";

import { tagsDaLista } from "@/lib/mestre/compendio";
import { noIdioma, tagsDosPlugins } from "@/lib/mestre/bestiario";
import type { ColecaoDoPlugin } from "@/lib/vault/bestiario";

describe("o bestiário dos plugins", () => {
  it("diz o motivo do Rust no idioma da tela", () => {
    // O vitest roda com a tela em português.
    expect(noIdioma({ pt: "não veio", en: "did not come" })).toBe("não veio");
  });

  it("soma as tags das fichas de todas as coleções", () => {
    const colecao = (fichas: ColecaoDoPlugin["fichas"]): ColecaoDoPlugin => ({
      extensao: "ordem-paranormal",
      id: "ameacas",
      titulo: "Ameaças",
      fichas,
    });
    const colecoes = [
      colecao([{ id: "zumbi", nome: "Zumbi", tags: ["Sangue", "VD 40"] }]),
      colecao([{ id: "anjo", nome: "Anjo", tags: ["sangue"] }]),
    ];

    expect(tagsDaLista(tagsDosPlugins(colecoes), (ficha) => ficha.tags)).toEqual([
      { tag: "Sangue", total: 2 },
      { tag: "VD 40", total: 1 },
    ]);
  });
});
