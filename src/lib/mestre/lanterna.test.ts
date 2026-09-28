import { describe, expect, it } from "vitest";

import { fachoDaSelecao, lanternaDaSelecao } from "@/lib/mestre/item-actions";
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

  it("mesma cor e alcance com efeito diferente também discordam", () => {
    expect(
      lanternaDaSelecao([
        token("a", chama),
        token("b", { ...chama, efeito: "fogo" }),
      ]),
    ).toBeUndefined();
  });

  it("sem seleção não há o que marcar", () => {
    expect(lanternaDaSelecao([])).toBeUndefined();
  });

  it("mesma lanterna com fachos para lados diferentes discorda", () => {
    expect(
      lanternaDaSelecao([
        token("a", { ...chama, cone: { angulo: 90, abertura: 60 } }),
        token("b", { ...chama, cone: { angulo: 0, abertura: 60 } }),
      ]),
    ).toBeUndefined();
  });
});

describe("fachoDaSelecao", () => {
  const cone = (angulo: number, abertura = 60) => ({
    ...chama,
    cone: { angulo, abertura },
  });

  it("todos em cone apontando igual: marca a forma, a direção e a abertura", () => {
    expect(fachoDaSelecao([token("a", cone(90)), token("b", cone(90))])).toEqual({
      forma: "cone",
      angulo: 90,
      abertura: 60,
    });
  });

  it("todos em cone apontando diferente: marca o cone e só a abertura", () => {
    // O caso comum da horda, porque o facho gira com cada token. O menu ainda
    // tem de mostrar a rosa, só sem direção marcada.
    expect(fachoDaSelecao([token("a", cone(90)), token("b", cone(0))])).toEqual({
      forma: "cone",
      angulo: null,
      abertura: 60,
    });
  });

  it("todos acesos em círculo marcam o círculo", () => {
    expect(fachoDaSelecao([token("a", chama), token("b", chama)]).forma).toBe(
      "circulo",
    );
  });

  it("um cone e um círculo discordam, e a rosa não aparece", () => {
    expect(fachoDaSelecao([token("a", cone(90)), token("b", chama)])).toEqual({
      forma: null,
      angulo: null,
      abertura: null,
    });
  });

  it("apagada não é círculo nem cone", () => {
    expect(fachoDaSelecao([token("a")]).forma).toBeNull();
  });
});
