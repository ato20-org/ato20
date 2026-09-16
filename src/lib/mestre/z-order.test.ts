import { describe, expect, it } from "vitest";

import { moveItemsBefore } from "@/lib/mestre/z-order";
import type { CanvasItem } from "@/types/scene";

/** Item só com o que a ordem usa. O resto não entra em `moveItemsBefore`. */
function item(id: string, z: number): CanvasItem {
  return {
    id,
    assetId: `a-${id}`,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotation: 0,
    locked: false,
    z,
  };
}

/** A pilha lida como o painel de camadas mostra: frente primeiro. */
function frenteAoFundo(items: CanvasItem[]): string[] {
  return [...items].sort((a, b) => b.z - a.z).map(({ id }) => id);
}

describe("moveItemsBefore", () => {
  it("leva os itens para cima da âncora, na ordem em que estavam", () => {
    // Frente ao fundo: p, a, b, c.
    const pilha = [item("c", 1), item("b", 2), item("a", 3), item("p", 4)];

    expect(frenteAoFundo(moveItemsBefore(pilha, ["a", "b"], "p"))).toEqual([
      "a",
      "b",
      "p",
      "c",
    ]);
  });

  it("preserva a ordem quando um dos movidos já estava acima da âncora", () => {
    // É o caso que quebrava ao encadear um movimento por item: o que já
    // estava acima terminava embaixo do outro, e o resultado dependia de
    // quem foi movido primeiro.
    const pilha = [item("b", 1), item("p", 2), item("a", 3)];

    expect(frenteAoFundo(moveItemsBefore(pilha, ["a", "b"], "p"))).toEqual([
      "a",
      "b",
      "p",
    ]);
  });

  it("âncora nula manda para o fundo", () => {
    const pilha = [item("c", 1), item("b", 2), item("a", 3)];

    expect(frenteAoFundo(moveItemsBefore(pilha, ["a", "b"], null))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("devolve a pilha intocada quando a âncora está entre os movidos", () => {
    const pilha = [item("b", 1), item("a", 2)];

    expect(moveItemsBefore(pilha, ["a", "b"], "a")).toBe(pilha);
  });

  it("reescreve z sem buraco nem empate", () => {
    const pilha = [item("c", 10), item("b", 50), item("a", 99)];
    const depois = moveItemsBefore(pilha, ["a"], "c");

    expect([...depois].map(({ z }) => z).sort((x, y) => x - y)).toEqual([
      1, 2, 3,
    ]);
  });
});
