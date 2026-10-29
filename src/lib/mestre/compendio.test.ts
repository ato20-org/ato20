import { describe, expect, it } from "vitest";

import {
  filtrarNoCompendio,
  tagsDaLista,
  temTag,
} from "./compendio";

type Coisa = { nome: string; tags?: string[] };

const lista: Coisa[] = [
  { nome: "Orc", tags: ["humanoide"] },
  { nome: "goblin", tags: ["humanoide", "Chefe"] },
  { nome: "Esqueleto", tags: ["morto-vivo"] },
  { nome: "Goblin arqueiro", tags: ["humanoide"] },
  { nome: "Árvore desperta" },
  { nome: "Lich", tags: ["morto-vivo", "chefe"] },
];

const filtrar = (busca: string, tags: string[] = []) =>
  filtrarNoCompendio(lista, { busca, tags }, (c) => c.nome, (c) => c.tags ?? []).map((c) => c.nome);

describe("filtrarNoCompendio", () => {
  it("sem filtro, tudo em ordem de nome, sem ligar para caixa nem acento", () => {
    expect(filtrar("")).toEqual(["Árvore desperta", "Esqueleto", "goblin", "Goblin arqueiro", "Lich", "Orc"]);
  });

  it("acha pelo nome e pela tag, sem acento nem caixa", () => {
    expect(filtrar("ARVORE")).toEqual(["Árvore desperta"]);
    expect(filtrar("morto")).toEqual(["Esqueleto", "Lich"]);
  });

  it("cada palavra à parte, todas presentes", () => {
    expect(filtrar("arqueiro gob")).toEqual(["Goblin arqueiro"]);
    expect(filtrar("orc gob")).toEqual([]);
  });

  it("as tags ligadas somam, sem ligar para caixa", () => {
    expect(filtrar("", ["humanoide"])).toEqual(["goblin", "Goblin arqueiro", "Orc"]);
    expect(filtrar("", ["CHEFE"])).toEqual(["goblin", "Lich"]);
    expect(filtrar("", ["chefe", "morto-vivo"])).toEqual(["Lich"]);
  });

  it("busca e tags juntas", () => {
    expect(filtrar("gob", ["chefe"])).toEqual(["goblin"]);
  });
});

describe("tagsDaLista", () => {
  it("cada tag uma vez, com quantos a usam, em ordem de nome", () => {
    expect(tagsDaLista(lista, (c) => c.tags ?? [])).toEqual([
      { tag: "Chefe", total: 2 },
      { tag: "humanoide", total: 3 },
      { tag: "morto-vivo", total: 2 },
    ]);
  });
});

describe("temTag", () => {
  it("sem ligar para caixa nem acento", () => {
    expect(temTag(["Mágico"], "magico")).toBe(true);
    expect(temTag(["arma"], "armadura")).toBe(false);
  });
});
