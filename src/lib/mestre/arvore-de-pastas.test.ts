import { describe, expect, it } from "vitest";

import {
  achatarArvore,
  caminhoDaPasta,
  descendentes,
  pastaDoMembro,
  pastasDaLista,
} from "@/lib/mestre/arvore-de-pastas";
import type { Pasta } from "@/types/scene";

type Item = { id: string; pastaId?: string };

const pastas: Pasta[] = [
  { id: "a", nome: "Capítulo 1" },
  { id: "b", nome: "Cidade", parentId: "a" },
  { id: "c", nome: "Capítulo 2", recolhido: true },
];

const itens: Item[] = [
  { id: "1" },
  { id: "2", pastaId: "a" },
  { id: "3", pastaId: "b" },
  { id: "4", pastaId: "c" },
  { id: "5", pastaId: "sumiu" },
];

const resumo = (linhas: ReturnType<typeof achatarArvore<Item>>) =>
  linhas.map((linha) =>
    linha.tipo === "pasta"
      ? `${"  ".repeat(linha.depth)}[${linha.pasta.id}:${linha.total}]`
      : `${"  ".repeat(linha.depth)}${linha.item.id}`,
  );

describe("achatarArvore", () => {
  it("pastas primeiro em cada nível, itens na ordem recebida", () => {
    expect(resumo(achatarArvore(itens, pastas, (item) => item.pastaId))).toEqual([
      "[a:2]",
      "  [b:1]",
      "    3",
      "  2",
      "[c:1]",
      "1",
      "5",
    ]);
  });

  it("pasta recolhida esconde o que tem dentro, mas conta", () => {
    const linhas = achatarArvore(itens, pastas, (item) => item.pastaId);

    expect(linhas.some((linha) => linha.tipo === "item" && linha.item.id === "4")).toBe(
      false,
    );
  });

  it("quem aponta para pasta que sumiu cai na raiz", () => {
    const linhas = achatarArvore(itens, pastas, (item) => item.pastaId);
    const cinco = linhas.find((linha) => linha.tipo === "item" && linha.item.id === "5");

    expect(cinco?.depth).toBe(0);
  });
});

describe("pastasDaLista", () => {
  it("ausente é o Arquivos", () => {
    const mistas: Pasta[] = [
      { id: "x", nome: "Notas" },
      { id: "y", nome: "Masmorras", lista: "mapas" },
    ];

    expect(pastasDaLista(mistas, undefined).map((pasta) => pasta.id)).toEqual(["x"]);
    expect(pastasDaLista(mistas, "mapas").map((pasta) => pasta.id)).toEqual(["y"]);
  });
});

describe("descendentes", () => {
  it("a pasta e toda a família abaixo dela", () => {
    expect(descendentes(pastas, "a").sort()).toEqual(["a", "b"]);
  });
});

describe("caminhoDaPasta", () => {
  it("da raiz até ela", () => {
    expect(caminhoDaPasta(pastas, "b")).toBe("Capítulo 1 / Cidade");
    expect(caminhoDaPasta(pastas, undefined)).toBe("");
  });

  it("não trava em ciclo", () => {
    const ciclo: Pasta[] = [
      { id: "p", nome: "P", parentId: "q" },
      { id: "q", nome: "Q", parentId: "p" },
    ];

    expect(caminhoDaPasta(ciclo, "p")).toBe("Q / P");
  });
});

describe("pastaDoMembro", () => {
  it("acha pelo `membros`", () => {
    const deGente: Pasta[] = [
      { id: "t", nome: "Taverna", lista: "npcs", membros: ["goblin"] },
    ];

    expect(pastaDoMembro(deGente, "goblin")).toBe("t");
    expect(pastaDoMembro(deGente, "orc")).toBeUndefined();
  });
});
