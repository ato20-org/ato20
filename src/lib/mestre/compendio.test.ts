import { describe, expect, it } from "vitest";

import type { Pasta } from "@/types/scene";

import {
  blocosDaArvore,
  cortarArvore,
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

describe("blocosDaArvore", () => {
  const pasta = (id: string): Pasta => ({ id, nome: id });

  it("junta as vizinhas de mesma profundidade numa grade, e a pasta é um bloco", () => {
    const blocos = blocosDaArvore<string>([
      { tipo: "pasta", pasta: pasta("humanoides"), depth: 0, total: 2 },
      { tipo: "item", item: "goblin", depth: 1 },
      { tipo: "item", item: "orc", depth: 1 },
      { tipo: "pasta", pasta: pasta("mortos"), depth: 0, total: 1 },
      { tipo: "item", item: "lich", depth: 1 },
      { tipo: "item", item: "barao", depth: 0 },
      { tipo: "item", item: "dragao", depth: 0 },
    ]);

    expect(
      blocos.map((bloco) =>
        bloco.tipo === "pasta" ? `pasta:${bloco.linha.pasta.id}` : `${bloco.depth}:${bloco.itens.join(",")}`,
      ),
    ).toEqual(["pasta:humanoides", "1:goblin,orc", "pasta:mortos", "1:lich", "0:barao,dragao"]);
  });
});

describe("cortarArvore", () => {
  const pasta = (id: string): Pasta => ({ id, nome: id });
  const linhas = [
    { tipo: "pasta" as const, pasta: pasta("a"), depth: 0, total: 2 },
    { tipo: "item" as const, item: "1", depth: 1 },
    { tipo: "item" as const, item: "2", depth: 1 },
    { tipo: "pasta" as const, pasta: pasta("b"), depth: 0, total: 1 },
    { tipo: "item" as const, item: "3", depth: 1 },
    { tipo: "item" as const, item: "4", depth: 0 },
  ];
  const resumo = (cortadas: typeof linhas) =>
    cortadas.map((l) => (l.tipo === "pasta" ? `p:${l.pasta.id}` : l.item));

  it("conta só as coisas, e leva as pastas que vêm antes", () => {
    expect(resumo(cortarArvore(linhas, 2))).toEqual(["p:a", "1", "2"]);
    expect(resumo(cortarArvore(linhas, 3))).toEqual(["p:a", "1", "2", "p:b", "3"]);
  });

  it("com limite folgado, tudo", () => {
    expect(cortarArvore(linhas, 100)).toEqual(linhas);
  });
});
