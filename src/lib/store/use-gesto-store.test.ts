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
      camera: { cameraId: "k", viewport: alvo },
    });
    expect(vista.cameras?.[0]?.viewport).toEqual(alvo);
    expect(vista.camera).toEqual(alvo);
    expect(vista.items).toBe(comCamera.items);
  });

  it("sem gesto devolve a mesma cena", () => {
    expect(aplicarGesto(cena, { sceneId: null, patches: null, camera: null })).toBe(cena);
  });

  it("gesto de outra cena não toca nesta", () => {
    expect(aplicarGesto(cena, { sceneId: "outra", patches: [{ id: "a", patch: { x: 9 } }], camera: null })).toBe(cena);
  });

  it("aplica o patch e preserva a identidade dos itens parados", () => {
    const vista = aplicarGesto(cena, { sceneId: "c1", patches: [{ id: "a", patch: { x: 99, rotation: 45 } }], camera: null });
    expect(vista).not.toBe(cena);
    expect(vista.items[0]).toMatchObject({ x: 99, rotation: 45, y: 0 });
    expect(vista.items[1]).toBe(cena.items[1]);
  });
});
