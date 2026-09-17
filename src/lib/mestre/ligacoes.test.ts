import { describe, expect, it } from "vitest";

import { createScene } from "@/types/scene";

import {
  ancoraNaBorda,
  caixaDe,
  ligavelEm,
  pontaEm,
  pontasDe,
  semReferencia,
} from "./ligacoes";

function cenaComTudo() {
  const scene = createScene("Quadro", "quadro");
  scene.items = [
    {
      id: "img",
      assetId: "a",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      rotation: 0,
      z: 1,
      locked: false,
    },
  ];
  scene.postits = [
    { id: "post", x: 500, y: 500, largura: 260, altura: 180, texto: "", cor: "amarelo" },
  ];
  scene.textos = [{ id: "txt", x: 1000, y: 100, texto: "Título", tamanho: 40 }];
  scene.pins = [{ id: "pin", x: 1500, y: 800, title: "", note: "", attachments: [] }];
  return scene;
}

describe("ancoraNaBorda", () => {
  const caixa = { minX: 0, minY: 0, maxX: 200, maxY: 100 };

  it("sai pela borda direita quando o alvo está à direita", () => {
    expect(ancoraNaBorda(caixa, { x: 1000, y: 50 })).toEqual({ x: 200, y: 50 });
  });

  it("sai pela borda de baixo quando o alvo está abaixo", () => {
    expect(ancoraNaBorda(caixa, { x: 100, y: 1000 })).toEqual({ x: 100, y: 100 });
  });

  it("devolve o centro para caixa de tamanho zero, que é o alfinete", () => {
    const ponto = { minX: 5, minY: 5, maxX: 5, maxY: 5 };
    expect(ancoraNaBorda(ponto, { x: 100, y: 100 })).toEqual({ x: 5, y: 5 });
  });
});

describe("caixaDe", () => {
  it("acha cada tipo de ponta, e devolve null para quem sumiu", () => {
    const scene = cenaComTudo();
    expect(caixaDe(scene, { tipo: "item", id: "img" })).toEqual({
      minX: 100,
      minY: 100,
      maxX: 300,
      maxY: 200,
    });
    expect(caixaDe(scene, { tipo: "postit", id: "post" })?.maxX).toBe(760);
    expect(caixaDe(scene, { tipo: "texto", id: "txt" })?.minX).toBe(1000);
    expect(caixaDe(scene, { tipo: "pin", id: "pin" })).toEqual({
      minX: 1500,
      minY: 800,
      maxX: 1500,
      maxY: 800,
    });
    expect(caixaDe(scene, { tipo: "postit", id: "nada" })).toBeNull();
  });
});

describe("ligavelEm", () => {
  it("acha o que está sob o ponto, e nada no vazio", () => {
    const scene = cenaComTudo();
    expect(ligavelEm(scene, { x: 150, y: 150 })).toEqual({ tipo: "item", id: "img" });
    expect(ligavelEm(scene, { x: 600, y: 600 })).toEqual({ tipo: "postit", id: "post" });
    expect(ligavelEm(scene, { x: 1010, y: 110 })).toEqual({ tipo: "texto", id: "txt" });
    expect(ligavelEm(scene, { x: 1510, y: 810 })).toEqual({ tipo: "pin", id: "pin" });
    expect(ligavelEm(scene, { x: 10, y: 10 })).toBeNull();
  });

  it("o postit ganha da imagem por baixo dele", () => {
    const scene = cenaComTudo();
    scene.postits![0] = { ...scene.postits![0]!, x: 100, y: 100 };
    expect(ligavelEm(scene, { x: 150, y: 150 })?.tipo).toBe("postit");
  });
});

describe("semReferencia", () => {
  const ligacoes = [
    { id: "l1", de: { tipo: "postit" as const, id: "a" }, para: { tipo: "texto" as const, id: "b" } },
    { id: "l2", de: { tipo: "item" as const, id: "c" }, para: { tipo: "postit" as const, id: "a" } },
    { id: "l3", de: { tipo: "item" as const, id: "c" }, para: { tipo: "texto" as const, id: "b" } },
  ];

  it("derruba toda ligação com uma ponta apagada", () => {
    expect(semReferencia(ligacoes, ["a"])?.map((l) => l.id)).toEqual(["l3"]);
  });

  it("devolve undefined quando não sobra nenhuma", () => {
    expect(semReferencia(ligacoes, ["a", "b"])).toBeUndefined();
  });

  it("deixa a lista ausente em paz", () => {
    expect(semReferencia(undefined, ["a"])).toBeUndefined();
  });
});

describe("pontasDe", () => {
  it("ponta livre fica onde está, e a ancorada encosta na borda virada para ela", () => {
    const scene = cenaComTudo();
    const pontas = pontasDe(scene, { tipo: "item", id: "img" }, { x: 1000, y: 150 })!;
    // A imagem vai de 100 a 300 em x; a borda direita é 300, na altura do alvo.
    expect(pontas.a).toEqual({ x: 300, y: 150 });
    expect(pontas.b).toEqual({ x: 1000, y: 150 });
  });

  it("duas pontas livres é um risco: os dois pontos como estão", () => {
    const scene = cenaComTudo();
    expect(pontasDe(scene, { x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({
      a: { x: 1, y: 2 },
      b: { x: 3, y: 4 },
    });
  });

  it("âncora que perdeu o alvo derruba a seta", () => {
    const scene = cenaComTudo();
    expect(pontasDe(scene, { tipo: "postit", id: "nada" }, { x: 0, y: 0 })).toBeNull();
  });
});

describe("pontaEm", () => {
  it("ancora no que há sob o ponto, e fica livre no vazio", () => {
    const scene = cenaComTudo();
    expect(pontaEm(scene, { x: 150, y: 150 })).toEqual({ tipo: "item", id: "img" });
    expect(pontaEm(scene, { x: 10.4, y: 10.6 })).toEqual({ x: 10, y: 11 });
  });
});

describe("semReferencia com ponta livre", () => {
  it("ponta livre não morre com ninguém", () => {
    const ligacoes = [
      { id: "l1", de: { x: 0, y: 0 }, para: { tipo: "postit" as const, id: "a" } },
      { id: "l2", de: { x: 0, y: 0 }, para: { x: 5, y: 5 } },
    ];
    expect(semReferencia(ligacoes, ["a"])?.map((l) => l.id)).toEqual(["l2"]);
  });
});
