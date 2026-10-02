import { describe, expect, it } from "vitest";

import {
  aproximar,
  arrastar,
  enquadreInicial,
  prenderEnquadre,
  regiaoDoEnquadre,
  tamanhoDaSaida,
  ZOOM_MAXIMO,
} from "@/lib/geometry/recorte";

const deitada = { largura: 2000, altura: 1000 };
const empe = { largura: 800, altura: 1200 };

describe("regiaoDoEnquadre", () => {
  it("no zoom 1, é o maior quadrado do arquivo, no meio", () => {
    expect(regiaoDoEnquadre(deitada, 1, enquadreInicial(deitada))).toEqual({
      x: 500,
      y: 0,
      largura: 1000,
      altura: 1000,
    });
    expect(regiaoDoEnquadre(empe, 1, enquadreInicial(empe))).toEqual({
      x: 0,
      y: 200,
      largura: 800,
      altura: 800,
    });
  });

  it("o zoom divide o lado", () => {
    const regiao = regiaoDoEnquadre(deitada, 1, { zoom: 4, cx: 1000, cy: 500 });

    expect(regiao).toEqual({ x: 875, y: 375, largura: 250, altura: 250 });
  });

  it("segue a proporção da moldura", () => {
    const regiao = regiaoDoEnquadre(empe, 3 / 4, enquadreInicial(empe));

    expect(regiao.largura / regiao.altura).toBeCloseTo(3 / 4);
    expect(regiao.largura).toBe(800);
  });
});

describe("prenderEnquadre", () => {
  it("não deixa a borda do arquivo entrar na moldura", () => {
    const preso = prenderEnquadre(deitada, 1, { zoom: 2, cx: 0, cy: 5000 });

    expect(preso).toEqual({ zoom: 2, cx: 250, cy: 750 });
  });

  it("zoom fica entre 1 e o teto", () => {
    expect(prenderEnquadre(deitada, 1, { zoom: 0.2, cx: 1000, cy: 500 }).zoom).toBe(1);
    expect(prenderEnquadre(deitada, 1, { zoom: 99, cx: 1000, cy: 500 }).zoom).toBe(
      ZOOM_MAXIMO,
    );
  });
});

describe("arrastar", () => {
  it("a imagem acompanha a mão, na escala da moldura", () => {
    // Zoom 1 num arquivo deitado: o quadrado de 1000px numa moldura de 250px,
    // quatro pixels do arquivo por pixel de tela.
    const depois = arrastar(deitada, 1, enquadreInicial(deitada), 50, 0, 250);

    expect(depois.cx).toBe(800);
    expect(depois.cy).toBe(500);
  });

  it("para na borda", () => {
    const depois = arrastar(deitada, 1, enquadreInicial(deitada), 10_000, 0, 250);

    expect(depois.cx).toBe(500);
  });
});

describe("aproximar", () => {
  it("mantém parado o ponto sob o cursor", () => {
    const antes = { zoom: 1, cx: 1000, cy: 500 };
    const ponto = { x: 0.25, y: 0.75 };
    const regiaoAntes = regiaoDoEnquadre(deitada, 1, antes);

    const depois = aproximar(deitada, 1, antes, 2, ponto);
    const regiaoDepois = regiaoDoEnquadre(deitada, 1, depois);

    expect(regiaoDepois.x + ponto.x * regiaoDepois.largura).toBeCloseTo(
      regiaoAntes.x + ponto.x * regiaoAntes.largura,
    );
    expect(regiaoDepois.y + ponto.y * regiaoDepois.altura).toBeCloseTo(
      regiaoAntes.y + ponto.y * regiaoAntes.altura,
    );
    expect(depois.zoom).toBe(2);
  });

  it("afastar volta a cobrir sem sair da borda", () => {
    const perto = { zoom: 6, cx: 1900, cy: 950 };
    const depois = aproximar(deitada, 1, perto, 1, { x: 0.5, y: 0.5 });

    expect(regiaoDoEnquadre(deitada, 1, depois)).toEqual({
      x: 1000,
      y: 0,
      largura: 1000,
      altura: 1000,
    });
  });
});

describe("tamanhoDaSaida", () => {
  it("reduz o pedaço grande até o teto", () => {
    expect(tamanhoDaSaida({ x: 0, y: 0, largura: 4000, altura: 4000 }, 1536)).toEqual({
      largura: 1536,
      altura: 1536,
    });
  });

  it("não amplia o pedaço pequeno", () => {
    expect(tamanhoDaSaida({ x: 0, y: 0, largura: 300.4, altura: 300.4 })).toEqual({
      largura: 300,
      altura: 300,
    });
  });
});
