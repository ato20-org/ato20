import { describe, expect, it } from "vitest";

import type { Texto } from "@/types/scene";

import {
  empurrarTextos,
  escalarCaixa,
  escalarTextos,
  girarTextos,
  girarTextosNoLugar,
  TAMANHO_MINIMO_DO_TEXTO,
} from "./grupo-de-textos";

/** Caixa medida junto: é o que a cena guarda depois do primeiro render. */
const titulo: Texto = {
  id: "t1",
  x: 100,
  y: 100,
  texto: "O reino",
  tamanho: 40,
  largura: 200,
  altura: 50,
};

describe("escalarTextos", () => {
  it("dobra a fonte e afasta o canto na mesma proporção", () => {
    const de = { minX: 100, minY: 100, maxX: 300, maxY: 150 };
    const para = { minX: 100, minY: 100, maxX: 500, maxY: 200 };

    const [patch] = escalarTextos([titulo], de, para);

    expect(patch.patch).toMatchObject({ x: 100, y: 100, tamanho: 80 });
    // A caixa medida acompanha, para o gizmo não saltar no meio do gesto.
    expect(patch.patch.largura).toBe(400);
  });

  it("um texto longe do canto caminha com a caixa", () => {
    const longe: Texto = { ...titulo, id: "t2", x: 300, y: 100 };
    const de = { minX: 100, minY: 100, maxX: 300, maxY: 150 };
    const para = { minX: 100, minY: 100, maxX: 500, maxY: 200 };

    const [patch] = escalarTextos([longe], de, para);

    expect(patch.patch).toMatchObject({ x: 500, y: 100 });
  });

  it("não encolhe abaixo do que ainda se lê", () => {
    const de = { minX: 0, minY: 0, maxX: 1000, maxY: 100 };
    const para = { minX: 0, minY: 0, maxX: 10, maxY: 1 };

    const [patch] = escalarTextos([titulo], de, para);

    expect(patch.patch.tamanho).toBe(TAMANHO_MINIMO_DO_TEXTO);
  });

  it("caixa sem área não vira NaN", () => {
    const vazia = { minX: 50, minY: 50, maxX: 50, maxY: 50 };
    expect(escalarTextos([titulo], vazia, vazia)).toEqual([]);
  });
});

describe("girarTextos", () => {
  it("orbita o centro do grupo e soma o giro próprio", () => {
    // Centro da caixa do texto: (200, 125). Girando 90° em volta da origem do
    // grupo, o ponto vai para (-125, 200).
    const [patch] = girarTextos([titulo], { x: 0, y: 0 }, 90);

    expect(patch.patch.rotation).toBe(90);
    expect(patch.patch.x).toBe(-225);
    expect(patch.patch.y).toBe(175);
  });

  it("volta ao ângulo zero sem gravar o padrão", () => {
    const torto: Texto = { ...titulo, rotation: 270 };
    const [patch] = girarTextos([torto], { x: 200, y: 125 }, 90);

    expect(patch.patch.rotation).toBeUndefined();
    // Girando em volta do próprio centro, o canto não sai do lugar.
    expect(patch.patch).toMatchObject({ x: 100, y: 100 });
  });
});

describe("girarTextosNoLugar", () => {
  it("só soma ao ângulo, sem mexer na posição", () => {
    const [patch] = girarTextosNoLugar([titulo], 15);

    expect(patch.patch).toEqual({ rotation: 15 });
  });
});

describe("empurrarTextos", () => {
  it("desloca e arredonda", () => {
    const [patch] = empurrarTextos([titulo], 10.4, -20.6);

    expect(patch.patch).toEqual({ x: 110, y: 79 });
  });
});

describe("escalarCaixa", () => {
  it("amplia em volta do centro dado", () => {
    const caixa = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

    expect(escalarCaixa(caixa, 2, { x: 50, y: 50 })).toEqual({
      minX: -50,
      minY: -50,
      maxX: 150,
      maxY: 150,
    });
  });
});
