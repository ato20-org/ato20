import { describe, expect, it } from "vitest";

import { aplicarGesto } from "@/lib/store/use-gesto-store";
import type { Scene } from "@/types/scene";

const cena = {
  id: "c1",
  items: [
    { id: "a", x: 0, y: 0, width: 10, height: 10, rotation: 0, z: 1, assetId: "", locked: false },
    { id: "b", x: 5, y: 5, width: 10, height: 10, rotation: 0, z: 2, assetId: "", locked: false },
  ],
  fog: [],
} as unknown as Scene;

const comCamera = {
  ...cena,
  cameras: [{ id: "k", viewport: { x: 0, y: 0, width: 960, height: 540 } }],
  cameraNoArId: "k",
  camera: { x: 0, y: 0, width: 960, height: 540 },
} as unknown as Scene;

describe("aplicarGesto", () => {
  it("a moldura no gesto move a câmera e, no ar, o recorte da mesa", () => {
    const alvo = { x: 100, y: 50, width: 480, height: 270 };
    const vista = aplicarGesto(comCamera, {
      sceneId: "c1",
      patches: null,
      textos: null,
      formas: null,
      camera: { cameraId: "k", viewport: alvo },
    });
    expect(vista.cameras?.[0]?.viewport).toEqual(alvo);
    expect(vista.camera).toEqual(alvo);
    expect(vista.items).toBe(comCamera.items);
  });

  it("sem gesto devolve a mesma cena", () => {
    expect(
      aplicarGesto(cena, {
        sceneId: null,
        patches: null,
        textos: null,
        formas: null,
        camera: null,
      }),
    ).toBe(cena);
  });

  it("gesto de outra cena não toca nesta", () => {
    expect(
      aplicarGesto(cena, {
        sceneId: "outra",
        patches: [{ id: "a", patch: { x: 9 } }],
        textos: null,
        formas: null,
        camera: null,
      }),
    ).toBe(cena);
  });

  it("o texto do quadro anda no gesto, e o que não anda continua o mesmo", () => {
    const comTextos = {
      ...cena,
      textos: [
        { id: "t1", x: 0, y: 0, texto: "reino", tamanho: 40 },
        { id: "t2", x: 80, y: 80, texto: "vilão", tamanho: 40 },
      ],
    } as unknown as Scene;

    const vista = aplicarGesto(comTextos, {
      sceneId: "c1",
      patches: null,
      textos: [{ id: "t1", patch: { x: 30, y: 12 } }],
      formas: null,
      camera: null,
    });

    expect(vista.textos?.[0]).toMatchObject({ x: 30, y: 12, texto: "reino" });
    expect(vista.textos?.[1]).toBe(comTextos.textos?.[1]);
    // O board não foi tocado: o gesto é uma camada por cima.
    expect(comTextos.textos?.[0]?.x).toBe(0);
  });

  it("a forma do quadro anda no gesto, como o item e o texto", () => {
    const comFormas = {
      ...cena,
      formas: [
        { id: "f1", tipo: "retangulo", x: 0, y: 0, width: 100, height: 60, rotation: 0, espessura: 6 },
        { id: "f2", tipo: "linha", x: 200, y: 200, width: 50, height: 50, rotation: 0, espessura: 6 },
      ],
    } as unknown as Scene;

    const vista = aplicarGesto(comFormas, {
      sceneId: "c1",
      patches: null,
      textos: null,
      formas: [{ id: "f1", patch: { x: 40, width: 200 } }],
      camera: null,
    });

    expect(vista.formas?.[0]).toMatchObject({ x: 40, width: 200, height: 60 });
    expect(vista.formas?.[1]).toBe(comFormas.formas?.[1]);
    expect(comFormas.formas?.[0]?.x).toBe(0);
  });

  it("aplica o patch e preserva a identidade dos itens parados", () => {
    const vista = aplicarGesto(cena, {
      sceneId: "c1",
      patches: [{ id: "a", patch: { x: 99, rotation: 45 } }],
      textos: null,
      formas: null,
      camera: null,
    });
    expect(vista).not.toBe(cena);
    expect(vista.items[0]).toMatchObject({ x: 99, rotation: 45, y: 0 });
    expect(vista.items[1]).toBe(cena.items[1]);
  });
});
