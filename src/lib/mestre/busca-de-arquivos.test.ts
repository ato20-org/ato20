import { describe, expect, it } from "vitest";

import type { Nota, Pasta, Scene } from "@/types/scene";

import { buscarArquivos, trechoCom } from "./busca-de-arquivos";

const quadro = (id: string, name: string, extra: Partial<Scene> = {}): Scene =>
  ({ id, name, tipo: "quadro", items: [], fog: [], createdAt: 0, updatedAt: 0, ...extra }) as Scene;
const nota = (id: string, titulo: string, pastaId?: string): Nota => ({
  id,
  titulo,
  arquivo: `${id}.md`,
  ...(pastaId ? { pastaId } : {}),
});

describe("trechoCom", () => {
  it("acha sem acento nem caixa, e separa o achado para o destaque", () => {
    expect(trechoCom("O Salão dos Ossos", "salao")).toEqual({
      antes: "O ",
      achado: "Salão",
      depois: " dos Ossos",
    });
  });

  it("corta o texto longo em palavra, com reticências do lado cortado", () => {
    const texto =
      "A sala é quente e úmida e cheira a ferro e cinza, e no fundo há um altar coberto de pó e de ossos velhos.";
    expect(trechoCom(texto, "altar")).toEqual({
      antes: "…e no fundo há um ",
      achado: "altar",
      depois: " coberto de pó e de…",
    });
  });

  it("quebra de linha vira espaço", () => {
    expect(trechoCom("linha um\nlinha dois", "um")).toEqual({
      antes: "linha ",
      achado: "um",
      depois: " linha dois",
    });
  });

  it("texto decomposto não desloca o achado", () => {
    const decomposto = "O Salão".normalize("NFD");
    expect(trechoCom(decomposto, "salao")?.achado).toBe("Salão".normalize("NFD"));
  });

  it("sem o termo, nada", () => {
    expect(trechoCom("nada aqui", "altar")).toBeNull();
  });
});

describe("buscarArquivos", () => {
  const pastas: Pasta[] = [
    { id: "p1", nome: "Ato 1", recolhido: true },
    { id: "p2", nome: "Masmorra", parentId: "p1" },
    { id: "p3", nome: "Vazia" },
  ];
  const quadros = [
    quadro("q1", "Quadro 1", {
      postits: [{ id: "a", x: 0, y: 0, largura: 1, altura: 1, texto: "O altar de ossos", cor: "amarelo" }],
    } as Partial<Scene>),
    quadro("q2", "Mapa da vila"),
  ];
  const notas = [nota("n1", "Rumores"), nota("n2", "Chefe", "p2")];
  const textos = { "n2.md": "O goblin guarda a chave do altar." };

  const achar = (busca: string) =>
    buscarArquivos({ quadros, pastas, notas, textos }, busca).map((achado) =>
      achado.tipo === "pasta"
        ? `pasta:${achado.pasta.id}@${achado.depth}`
        : achado.tipo === "cena"
          ? `cena:${achado.scene.id}@${achado.depth}${achado.trecho ? "+" : ""}`
          : `nota:${achado.nota.id}@${achado.depth}${achado.trecho ? "+" : ""}`,
    );

  it("busca vazia não acha nada", () => {
    expect(achar("  ")).toEqual([]);
  });

  it("pelo nome, sem trecho", () => {
    expect(achar("vila")).toEqual(["cena:q2@0"]);
    expect(achar("rumor")).toEqual(["nota:n1@0"]);
  });

  it("por dentro: postit do quadro e texto da nota, com trecho e as pastas abertas", () => {
    expect(achar("altar")).toEqual(["pasta:p1@0", "pasta:p2@1", "nota:n2@2+", "cena:q1@0+"]);
  });

  it("pasta achada vem com tudo o que tem dentro", () => {
    expect(achar("ato")).toEqual(["pasta:p1@0", "pasta:p2@1", "nota:n2@2"]);
  });

  it("nota ainda não lida acha só pelo título", () => {
    expect(achar("goblin")).toEqual(["pasta:p1@0", "pasta:p2@1", "nota:n2@2+"]);
    expect(
      buscarArquivos({ quadros, pastas, notas, textos: {} }, "goblin"),
    ).toEqual([]);
  });
});
