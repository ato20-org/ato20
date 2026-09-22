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

  it("o quadro vai sem recorte de câmera: a mesa vê a folha inteira", () => {
    const scene = createScene("Linha do tempo", "quadro");
    scene.camera = { x: 0, y: 0, width: 960, height: 540 };
    scene.cameras = [
      { id: "k", nome: "Câmera 1", viewport: scene.camera },
    ];
    scene.cameraNoArId = "k";

    const mesa = sceneForTable(scene)!;
    expect(mesa.camera).toBeUndefined();
    expect(mesa.cameras).toBeUndefined();
    expect(mesa.cameraNoArId).toBeUndefined();
    // O conteúdo do quadro continua inteiro.
    expect(mesa.name).toBe(scene.name);
  });

  it("o quadro sem câmera nenhuma devolve a MESMA referência", () => {
    const scene = createScene("Rede", "quadro");
    expect(sceneForTable(scene)).toBe(scene);
  });

  it("o quadro com câmera antiga devolve sempre a mesma cópia", () => {
    const scene = createScene("Rede", "quadro");
    scene.cameraNoArId = "k";

    // Identidade estável: o publicador compara por referência, e uma cópia
    // nova por render publicaria sessenta vezes por segundo.
    expect(sceneForTable(scene)).toBe(sceneForTable(scene));
  });

  it("num mapa, a letra e a forma fechadas não chegam à mesa", () => {
    const scene = createScene("Porão");
    scene.textos = [{ id: "t", x: 0, y: 0, texto: "aqui dorme o dragão", tamanho: 40 }];
    scene.formas = [
      { id: "f", tipo: "elipse", x: 0, y: 0, width: 10, height: 10, rotation: 0, espessura: 6 },
    ];

    const mesa = sceneForTable(scene)!;
    expect(mesa.textos).toBeUndefined();
    expect(mesa.formas).toBeUndefined();
  });

  it("num mapa, sobem só as que o mestre abriu", () => {
    const scene = createScene("Porão");
    scene.textos = [
      { id: "aberto", x: 0, y: 0, texto: "Taverna", tamanho: 40, naMesa: true },
      { id: "fechado", x: 0, y: 0, texto: "o taverneiro mente", tamanho: 40 },
    ];
    scene.formas = [
      {
        id: "aberta",
        tipo: "elipse",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        rotation: 0,
        espessura: 6,
        naMesa: true,
      },
      {
        id: "fechada",
        tipo: "retangulo",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        rotation: 0,
        espessura: 6,
      },
    ];

    const mesa = sceneForTable(scene)!;
    expect(mesa.textos?.map((texto) => texto.id)).toEqual(["aberto"]);
    expect(mesa.formas?.map((forma) => forma.id)).toEqual(["aberta"]);
  });

  it("uma cena de mapa com formas não devolve a mesma referência", () => {
    // O guarda de identidade tem de cobrir todo campo mexido: sem `formas`
    // nele, uma cena que só tem formas voltaria inteira -- as fechadas junto.
    const scene = createScene("");
    scene.formas = [
      { id: "f", tipo: "linha", x: 0, y: 0, width: 10, height: 10, rotation: 0, espessura: 6 },
    ];

    expect(sceneForTable(scene)).not.toBe(scene);
    expect(sceneForTable(scene)!.formas).toBeUndefined();
  });

  it("no quadro a letra e a forma passam sem precisar de olho nenhum", () => {
    const scene = createScene("Rede", "quadro");
    scene.textos = [{ id: "t", x: 0, y: 0, texto: "Edgar", tamanho: 40 }];
    scene.formas = [
      { id: "f", tipo: "retangulo", x: 0, y: 0, width: 10, height: 10, rotation: 0, espessura: 6 },
    ];

    const mesa = sceneForTable(scene)!;
    expect(mesa.textos).toHaveLength(1);
    expect(mesa.formas).toHaveLength(1);
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
