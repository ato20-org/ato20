import { describe, expect, it } from "vitest";

import { createScene, type CanvasItem } from "@/types/scene";

import { destinoAceito, podePegar, prenderNoLimite } from "./movimento";

function token(patch: Partial<CanvasItem> = {}): CanvasItem {
  return {
    id: "t",
    assetId: "a",
    personagemId: "corvo",
    x: 100,
    y: 100,
    width: 80,
    height: 80,
    rotation: 0,
    z: 1,
    locked: false,
    ...patch,
  };
}

function mapaCom(...items: CanvasItem[]) {
  const scene = createScene("Porão");
  scene.items = items;
  return scene;
}

describe("prenderNoLimite", () => {
  const limite = { x: 0, y: 0, width: 1000, height: 500 };

  it("deixa como está o que cai dentro", () => {
    expect(prenderNoLimite(token(), 300, 200, limite)).toEqual({ x: 300, y: 200 });
  });

  it("prende o CENTRO: o token encosta na borda com metade para fora", () => {
    expect(prenderNoLimite(token(), -500, -500, limite)).toEqual({ x: -40, y: -40 });
    expect(prenderNoLimite(token(), 5000, 5000, limite)).toEqual({ x: 960, y: 460 });
  });

  it("vale para câmera fora da origem", () => {
    const camera = { x: 400, y: 300, width: 200, height: 100 };
    expect(prenderNoLimite(token(), 0, 0, camera)).toEqual({ x: 360, y: 260 });
  });
});

describe("podePegar", () => {
  const meus = new Set(["corvo"]);

  it("pega o token do próprio personagem", () => {
    expect(podePegar(token(), meus)).toBe(true);
  });

  it("não pega PNJ, token de outro nem mobília", () => {
    expect(podePegar(token({ personagemId: "mira" }), meus)).toBe(false);
    expect(podePegar(token({ personagemId: undefined }), meus)).toBe(false);
  });

  it("não pega o que o mestre travou", () => {
    expect(podePegar(token({ locked: true }), meus)).toBe(false);
  });
});

describe("destinoAceito", () => {
  const movimento = { personagemId: "corvo", itemId: "t", x: 300, y: 200 };

  it("aceita o token do personagem na cena no ar", () => {
    expect(destinoAceito(mapaCom(token()), movimento)).toEqual({ x: 300, y: 200 });
  });

  it("recusa item de outro personagem, mesmo com o id certo", () => {
    // O daemon conferiu que o jogador é do Corvo. O item que ele mandou é do
    // Mira: um celular modificado não move o token alheio trocando o id.
    const scene = mapaCom(token({ personagemId: "mira" }));
    expect(destinoAceito(scene, movimento)).toBeNull();
  });

  it("recusa token travado e item que não está na cena", () => {
    expect(destinoAceito(mapaCom(token({ locked: true })), movimento)).toBeNull();
    expect(destinoAceito(mapaCom(), movimento)).toBeNull();
  });

  it("recusa movimento no quadro", () => {
    const quadro = createScene("Rede", "quadro");
    quadro.items = [token()];
    expect(destinoAceito(quadro, movimento)).toBeNull();
  });

  it("prende o destino à câmera, mesmo que o celular não tenha preso", () => {
    const scene = mapaCom(token());
    scene.camera = { x: 0, y: 0, width: 960, height: 540 };
    expect(destinoAceito(scene, { ...movimento, x: 9000, y: -9000 })).toEqual({
      x: 920,
      y: -40,
    });
  });

  it("não devolve nada quando o token já está lá", () => {
    expect(
      destinoAceito(mapaCom(token()), { ...movimento, x: 100, y: 100 }),
    ).toBeNull();
  });
});
