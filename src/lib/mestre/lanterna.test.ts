import { describe, expect, it } from "vitest";

import { lanternaDaSelecao } from "@/lib/mestre/item-actions";
import type { CanvasItem, LuzCarregada } from "@/types/scene";

function token(id: string, luz?: LuzCarregada): CanvasItem {
  return {
    id,
    assetId: "a",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    z: 1,
    ...(luz ? { luz } : {}),
  } as CanvasItem;
}

const chama = { raio: 260, cor: "#fb923c" };

describe("lanternaDaSelecao", () => {
  it("todas apagadas é `null`, e o menu marca Apagada", () => {
    expect(lanternaDaSelecao([token("a"), token("b")])).toBeNull();
  });

  it("todas iguais devolve a lanterna delas", () => {
    expect(lanternaDaSelecao([token("a", chama), token("b", chama)])).toEqual(
      chama,
    );
  });

  it("uma acesa e outra apagada discordam: nada marcado", () => {
    expect(lanternaDaSelecao([token("a", chama), token("b")])).toBeUndefined();
  });

  it("mesma cor e alcance diferente também discordam", () => {
    expect(
      lanternaDaSelecao([
        token("a", chama),
        token("b", { ...chama, raio: 160 }),
      ]),
    ).toBeUndefined();
  });

  it("sem seleção não há o que marcar", () => {
    expect(lanternaDaSelecao([])).toBeUndefined();
  });
});
