import { describe, expect, it } from "vitest";

import { MIN_ITEM_SIZE, resizeItem } from "@/lib/geometry/transform";

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
