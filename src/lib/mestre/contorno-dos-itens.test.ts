import { describe, expect, it } from "vitest";

import { contornoDosItens } from "./contorno-dos-itens";
import { CONTORNO_DE_JOGADOR, CONTORNO_DE_NPC } from "@/lib/contorno";
import type { CanvasItem } from "@/types/scene";

function item(id: string, personagemId?: string): CanvasItem {
  return {
    id,
    assetId: `asset-${id}`,
    personagemId,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    z: 0,
    locked: false,
  };
}

describe("contornoDosItens", () => {
  it("azul para o personagem com jogador, branco para o resto", () => {
    const cores = contornoDosItens(
      [item("a", "edgar"), item("b", "goblin")],
      new Set(["edgar"]),
    );

    expect(cores.get("a")).toBe(CONTORNO_DE_JOGADOR);
    expect(cores.get("b")).toBe(CONTORNO_DE_NPC);
  });

  it("item sem personagem não recebe contorno", () => {
    const cores = contornoDosItens([item("mesa")], new Set(["edgar"]));

    expect(cores.has("mesa")).toBe(false);
    expect(cores.size).toBe(0);
  });
});
