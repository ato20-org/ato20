import { describe, expect, it } from "vitest";

import {
  aproximarEm,
  deslocarZoom,
  PASSO_DO_ZOOM,
  prenderZoom,
  recorteComZoom,
  temZoom,
  ZOOM_MAXIMO_DA_MESA,
  ZOOM_NEUTRO,
} from "@/lib/geometry/zoom-da-mesa";
import type { Viewport } from "@/types/scene";

const CAMERA: Viewport = { x: 400, y: 200, width: 800, height: 450 };

/** Onde um ponto do recorte do mestre aparece na tela, em fração do recorte desenhado. */
function naTela(recorte: Viewport, x: number, y: number) {
  return { x: (x - recorte.x) / recorte.width, y: (y - recorte.y) / recorte.height };
}

describe("recorteComZoom", () => {
  it("sem zoom devolve o próprio recorte do mestre", () => {
    expect(recorteComZoom(CAMERA, ZOOM_NEUTRO)).toBe(CAMERA);
  });

  it("aproximado no meio mostra o miolo, com o formato da câmera", () => {
    const recorte = recorteComZoom(CAMERA, { fator: 2, u: 0.5, v: 0.5 });

    expect(recorte).toEqual({ x: 600, y: 312.5, width: 400, height: 225 });
    expect(recorte.width / recorte.height).toBeCloseTo(CAMERA.width / CAMERA.height);
  });
});

describe("prenderZoom", () => {
  it("não afasta além do enquadramento do mestre", () => {
    expect(prenderZoom({ fator: 0.5, u: 0.1, v: 0.9 })).toEqual(ZOOM_NEUTRO);
  });

  it("tem teto", () => {
    expect(prenderZoom({ fator: 10, u: 0.5, v: 0.5 }).fator).toBe(ZOOM_MAXIMO_DA_MESA);
  });

  it("não deixa a lupa passar da borda da câmera", () => {
    const preso = prenderZoom({ fator: 2, u: 0, v: 1 });
    const recorte = recorteComZoom(CAMERA, preso);

    expect(recorte.x).toBeCloseTo(CAMERA.x);
    expect(recorte.y + recorte.height).toBeCloseTo(CAMERA.y + CAMERA.height);
  });

  it("o passo dos botões que volta a 1 conta como sem zoom", () => {
    const ida = aproximarEm(ZOOM_NEUTRO, PASSO_DO_ZOOM, { x: 0.5, y: 0.5 });
    const volta = aproximarEm(ida, 1 / PASSO_DO_ZOOM, { x: 0.5, y: 0.5 });

    expect(temZoom(volta)).toBe(false);
    expect(recorteComZoom(CAMERA, volta)).toBe(CAMERA);
  });
});

describe("aproximarEm", () => {
  it("o ponto sob a âncora fica parado na tela", () => {
    const antes = { fator: 1.5, u: 0.4, v: 0.6 };
    const ancora = { x: 0.8, y: 0.25 };
    const recorteAntes = recorteComZoom(CAMERA, antes);
    const ponto = {
      x: recorteAntes.x + ancora.x * recorteAntes.width,
      y: recorteAntes.y + ancora.y * recorteAntes.height,
    };

    const depois = aproximarEm(antes, 1.3, ancora);
    const recorteDepois = recorteComZoom(CAMERA, depois);

    expect(depois.fator).toBeCloseTo(1.95);
    const onde = naTela(recorteDepois, ponto.x, ponto.y);
    expect(onde.x).toBeCloseTo(ancora.x);
    expect(onde.y).toBeCloseTo(ancora.y);
  });

  it("aproximar no canto não abre fresta fora da câmera", () => {
    const zoom = aproximarEm(ZOOM_NEUTRO, 3, { x: 0, y: 0 });
    const recorte = recorteComZoom(CAMERA, zoom);

    expect(recorte.x).toBeCloseTo(CAMERA.x);
    expect(recorte.y).toBeCloseTo(CAMERA.y);
  });
});

describe("deslocarZoom", () => {
  it("o mapa anda com o dedo, e para na borda", () => {
    const zoom = { fator: 2, u: 0.5, v: 0.5 };

    // Dedo para a direita um quarto da tela: o mapa vem junto, a lupa vai para a esquerda.
    expect(deslocarZoom(zoom, 0.25, 0).u).toBeCloseTo(0.375);
    // Arrastar muito não passa da borda.
    expect(deslocarZoom(zoom, 5, -5)).toEqual({ fator: 2, u: 0.25, v: 0.75 });
  });

  it("sem zoom não há o que arrastar", () => {
    expect(deslocarZoom(ZOOM_NEUTRO, 0.3, 0.3)).toEqual(ZOOM_NEUTRO);
  });
});
