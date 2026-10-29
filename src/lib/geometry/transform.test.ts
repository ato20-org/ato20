import { describe, expect, it } from "vitest";

import {
  desenrolarAngulo,
  MIN_ITEM_SIZE,
  MIN_SCENE_ITEM_SIZE,
  normalizeAngle,
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

  it("o token encolhe abaixo do piso de item, até o piso de cena", () => {
    // O caso do mapa de cidade: um token de 24 x 47 que o 2D não deixava
    // encolher mais, e o 2.5D deixava.
    const token = { x: 0, y: 0, width: 24, height: 47, rotation: 0 };
    const out = resizeItem(
      token,
      "se",
      { x: -1000, y: -1000 },
      { keepAspect: true, round: false, minimo: MIN_SCENE_ITEM_SIZE },
    );

    expect(out.width).toBe(MIN_SCENE_ITEM_SIZE);
    expect(out.height / out.width).toBeCloseTo(47 / 24);
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

describe("desenrolarAngulo", () => {
  it("cruzar a base para a frente não dá a volta: 350° → 0° anda só 10°", () => {
    // O bug do espectador: sem desenrolar, a transição iria de 350 a 0 pelo
    // arco longo e o token dava um giro inteiro.
    expect(desenrolarAngulo(350, 0)).toBe(360);
  });

  it("cruzar a base para trás vira negativo em vez de dar a volta: 10° → 350°", () => {
    expect(desenrolarAngulo(10, 350)).toBe(-10);
  });

  it("escolhe sempre o arco curto, nunca passando de meia-volta", () => {
    for (const anterior of [0, 90, 200, 359, -40, 720]) {
      for (const bruto of [0, 45, 179, 181, 270, 359]) {
        const out = desenrolarAngulo(anterior, bruto);
        expect(Math.abs(out - anterior)).toBeLessThanOrEqual(180);
        // Continua sendo o mesmo ângulo na tela, só que desenrolado.
        expect(normalizeAngle(out)).toBeCloseTo(normalizeAngle(bruto));
      }
    }
  });

  it("a mesma amostra de novo não mexe no que já foi desenrolado", () => {
    const out = desenrolarAngulo(350, 0);
    expect(desenrolarAngulo(out, 0)).toBe(out);
  });

  it("acumula voltas sem engasgar na base: giro contínuo passa de 360°", () => {
    let desenhado = 0;
    for (const amostra of [90, 180, 270, 0, 90, 180]) {
      desenhado = desenrolarAngulo(desenhado, amostra);
    }
    expect(desenhado).toBe(540);
  });
});
