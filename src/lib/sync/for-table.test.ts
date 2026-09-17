import { describe, expect, it } from "vitest";

import { createScene } from "@/types/scene";

import { sceneForTable } from "./for-table";

describe("sceneForTable", () => {
  it("apaga a anotação do mestre numa cena de mapa", () => {
    const scene = createScene("Porão");
    scene.postits = [
      { id: "p", x: 0, y: 0, largura: 1, altura: 1, texto: "segredo", cor: "amarelo" },
    ];
    scene.textos = [{ id: "t", x: 0, y: 0, texto: "título", tamanho: 40 }];
    scene.ligacoes = [
      { id: "l", de: { tipo: "postit", id: "p" }, para: { tipo: "texto", id: "t" } },
    ];

    const mesa = sceneForTable(scene)!;
    expect(mesa.postits).toBeUndefined();
    expect(mesa.textos).toBeUndefined();
    expect(mesa.ligacoes).toBeUndefined();
    expect(mesa.name).toBe("");
  });

  it("devolve a MESMA referência quando não há nada a apagar", () => {
    const scene = createScene("");
    expect(sceneForTable(scene)).toBe(scene);
  });

  it("deixa o quadro passar inteiro: postit, texto e seta são o conteúdo dele", () => {
    const scene = createScene("Rede de PNJs", "quadro");
    scene.postits = [
      { id: "p", x: 0, y: 0, largura: 1, altura: 1, texto: "Edgar", cor: "azul" },
    ];
    scene.ligacoes = [
      { id: "l", de: { tipo: "postit", id: "p" }, para: { tipo: "postit", id: "p" } },
    ];

    expect(sceneForTable(scene)).toBe(scene);
  });
});
