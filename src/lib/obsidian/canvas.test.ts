import { describe, expect, it } from "vitest";

import { converterCanvas, corDoNo, type ContextoDoBoard } from "@/lib/obsidian/canvas";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

const contexto: ContextoDoBoard = {
  ehNota: (caminho) => caminho.endsWith(".md"),
  anexo: (caminho) =>
    caminho === "Imagens/Poço.jpg"
      ? { nome: "Poço.jpg", tipo: "image" }
      : caminho === "Trilha/tema.mp3"
        ? { nome: "tema.mp3", tipo: "audio" }
        : null,
  converterTexto: (texto) => texto.replace(/\[\[([^\]]+)\]\]/gu, "$1"),
};

/** O `Mapa.canvas` do Lendas Urbanas: quatro notas de cenário, sem setas. */
const MAPA = JSON.stringify({
  nodes: [
    { id: "a", type: "file", file: "Cenários/Torre de rádio abandonada.md", x: -840, y: 1179, width: 360, height: 760 },
    { id: "b", type: "file", file: "Cenários/Capela de santo Antonio.md", x: -400, y: -154, width: 422, height: 554 },
    { id: "c", type: "file", file: "Cenários/Poço.md", x: 280, y: 400, width: 480, height: 760 },
    { id: "d", type: "file", file: "Cenários/Fazenda da Firmina.md", x: 720, y: 600, width: 520, height: 957 },
  ],
  edges: [],
});

describe("converterCanvas", () => {
  it("o Mapa do Lendas Urbanas: quatro cartões, centrados no plano", () => {
    const { elementos, setas, ignorados } = converterCanvas(MAPA, contexto);

    expect(elementos.map((e) => e.tipo)).toEqual(["cartao", "cartao", "cartao", "cartao"]);
    expect(elementos[2]).toMatchObject({ nota: "Cenários/Poço.md", largura: 480, altura: 760 });
    expect(setas).toEqual([]);
    expect(ignorados).toBe(0);

    // O desenho ia de -840 a 1240 em x e de -154 a 1939 em y: o meio dele é
    // o meio do plano.
    const esquerda = Math.min(...elementos.map((e) => e.x));
    const direita = Math.max(...elementos.map((e) => e.x + e.largura));
    const topo = Math.min(...elementos.map((e) => e.y));
    const base = Math.max(...elementos.map((e) => e.y + e.altura));
    // Até uma unidade: cada caixa é arredondada para o pixel.
    expect(Math.abs((esquerda + direita) / 2 - SCENE_WIDTH / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs((topo + base) / 2 - SCENE_HEIGHT / 2)).toBeLessThanOrEqual(1);
  });

  it("texto, link, imagem, som e grupo, cada um no seu elemento", () => {
    const { elementos } = converterCanvas(
      JSON.stringify({
        nodes: [
          { id: "t", type: "text", text: "# Pista\nViu o [[Padre]]", x: 0, y: 0, width: 200, height: 100, color: "4" },
          { id: "l", type: "link", url: "https://a.b", x: 0, y: 0, width: 300, height: 200 },
          { id: "i", type: "file", file: "Imagens/Poço.jpg", x: 0, y: 0, width: 300, height: 200 },
          { id: "s", type: "file", file: "Trilha/tema.mp3", x: 0, y: 0, width: 300, height: 200 },
          { id: "f", type: "file", file: "Sumiu.pdf", x: 0, y: 0, width: 300, height: 200 },
          { id: "g", type: "group", label: "Igreja", x: 0, y: 0, width: 300, height: 200 },
        ],
      }),
      contexto,
    );

    expect(elementos[0]).toMatchObject({
      tipo: "postit",
      texto: "**Pista**\nViu o Padre",
      cor: "verde",
      // O postit tem tamanho mínimo; o nó era mais baixo.
      largura: 200,
      altura: 120,
    });
    expect(elementos[1]).toMatchObject({ tipo: "postit", texto: "https://a.b", cor: "branco" });
    expect(elementos[2]).toMatchObject({ tipo: "imagem", anexo: "Imagens/Poço.jpg" });
    expect(elementos[3]).toMatchObject({ tipo: "postit", texto: "/tema.mp3" });
    expect(elementos[4]).toMatchObject({ tipo: "postit", texto: "Sumiu" });
    expect(elementos[5]).toMatchObject({ tipo: "grupo", rotulo: "Igreja" });
  });

  it("aresta vira seta com lado e rótulo; ponta perdida é ignorada", () => {
    const { setas, ignorados } = converterCanvas(
      JSON.stringify({
        nodes: [
          { id: "a", type: "text", text: "A", x: 0, y: 0, width: 200, height: 200 },
          { id: "b", type: "text", text: "B", x: 400, y: 0, width: 200, height: 200 },
          { id: "x", type: "desconhecido", x: 0, y: 0, width: 1, height: 1 },
        ],
        edges: [
          { id: "e1", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left", label: " sabe de " },
          { id: "e2", fromNode: "a", toNode: "fantasma" },
          { id: "e3", fromNode: "b", toNode: "a" },
        ],
      }),
      contexto,
    );

    expect(setas).toEqual([
      { de: "a", para: "b", ladoDe: "direita", ladoPara: "esquerda", rotulo: "sabe de" },
      { de: "b", para: "a" },
    ]);
    // O nó de tipo desconhecido e a aresta para ele.
    expect(ignorados).toBe(2);
  });

  it("JSON quebrado é um quadro vazio", () => {
    expect(converterCanvas("{nao é json", contexto)).toEqual({ elementos: [], setas: [], ignorados: 0 });
    expect(converterCanvas("{}", contexto)).toEqual({ elementos: [], setas: [], ignorados: 0 });
  });
});

describe("corDoNo", () => {
  it("as seis do Obsidian e o hex pelo matiz", () => {
    expect(["1", "2", "3", "4", "5", "6"].map(corDoNo)).toEqual([
      "rosa",
      "amarelo",
      "amarelo",
      "verde",
      "azul",
      "rosa",
    ]);
    expect(corDoNo(undefined)).toBe("branco");
    expect(corDoNo("#3b82f6")).toBe("azul");
    expect(corDoNo("#22c55e")).toBe("verde");
    expect(corDoNo("#f59e0b")).toBe("amarelo");
    expect(corDoNo("#808080")).toBe("branco");
  });
});
