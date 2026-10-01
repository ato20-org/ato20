import { describe, expect, it } from "vitest";

import {
  MIN_ITEM_SIZE,
  resizeItem,
  travarNoEixo,
} from "@/lib/geometry/transform";

describe("resizeItem", () => {
  const alto = { x: 0, y: 0, width: 100, height: 200, rotation: 0 };

  it("com proporção travada, o piso vai para o lado curto e o longo fica proporcional", () => {
    // Arrasta o canto sudeste para dentro muito além do que a caixa tem.
    const out = resizeItem(alto, "se", { x: -1000, y: -1000 }, { keepAspect: true });

    expect(out.width).toBe(MIN_ITEM_SIZE);
    expect(out.height).toBe(MIN_ITEM_SIZE * 2);
    expect(out.height / out.width).toBeCloseTo(alto.height / alto.width);
  });

  it("sem proporção travada, cada eixo para no piso sozinho", () => {
    const out = resizeItem(alto, "se", { x: -1000, y: -1000 });

    expect(out.width).toBe(MIN_ITEM_SIZE);
    expect(out.height).toBe(MIN_ITEM_SIZE);
  });

  it("mantém a âncora oposta parada quando o piso engole o delta", () => {
    const out = resizeItem(alto, "se", { x: -1000, y: -1000 }, { keepAspect: true });

    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});

describe("travarNoEixo", () => {
  it("mais de lado que de cima fica na horizontal, sem resto no outro eixo", () => {
    expect(travarNoEixo({ x: 100, y: 30 })).toEqual({ x: 100, y: 0 });
    expect(travarNoEixo({ x: -100, y: -80 })).toEqual({ x: -100, y: 0 });
  });

  it("mais de cima que de lado fica na vertical", () => {
    expect(travarNoEixo({ x: 30, y: -100 })).toEqual({ x: 0, y: -100 });
    expect(travarNoEixo({ x: -80, y: 100 })).toEqual({ x: 0, y: 100 });
  });

  it("não há diagonal: a 45 graus escolhe um eixo", () => {
    expect(travarNoEixo({ x: 100, y: 100 })).toEqual({ x: 100, y: 0 });
  });

  it("parado continua parado", () => {
    expect(travarNoEixo({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});
