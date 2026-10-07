import { afterEach, describe, expect, it } from "vitest";

import {
  apontarLanterna,
  fachoDaSelecao,
  lanternaDaSelecao,
  setSelectionLanterna,
} from "@/lib/mestre/item-actions";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import type { CanvasItem, LuzCarregada, Scene } from "@/types/scene";

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

  it("mesma lanterna com intensidade diferente discorda", () => {
    expect(
      lanternaDaSelecao([
        token("a", chama),
        token("b", { ...chama, intensidade: 0.35 }),
      ]),
    ).toBeUndefined();
  });

  it("intensidade ausente e inteira são a mesma lanterna", () => {
    // A cena de antes da intensidade não grava o campo, e a forte do menu
    // também não: as duas têm de marcar "Forte" juntas.
    expect(
      lanternaDaSelecao([
        token("a", chama),
        token("b", { ...chama, intensidade: 1 }),
      ]),
    ).toEqual(chama);
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

describe("setSelectionLanterna", () => {
  function montar(...itens: CanvasItem[]) {
    useSceneStore.setState({
      board: {
        scenes: [
          { id: "c1", items: itens, fog: [], pins: [] } as unknown as Scene,
        ],
        editingSceneId: "c1",
        liveSceneId: "c1",
      },
      status: "ready",
    } as never);
    useSelectionStore.getState().select(itens.map((item) => item.id));
  }

  const luzDe = (id: string) =>
    useSceneStore
      .getState()
      .board!.scenes[0]!.items.find((item) => item.id === id)!.luz;

  afterEach(() => {
    useSceneStore.setState({ board: null, status: "idle" } as never);
    useSelectionStore.getState().clear();
  });

  it("baixar a intensidade não mexe no alcance nem na cor", () => {
    montar(token("a", { ...chama, raio: 420 }));

    setSelectionLanterna({ intensidade: 0.35 });

    expect(luzDe("a")).toEqual({
      raio: 420,
      cor: chama.cor,
      intensidade: 0.35,
    });
  });

  it("a forte grava como ausente, como a fixa e o círculo", () => {
    montar(token("a", { ...chama, intensidade: 0.35 }));

    setSelectionLanterna({ intensidade: 1 });

    expect(luzDe("a")).not.toHaveProperty("intensidade");
  });

  it("trocar a cor não acende de novo a lanterna fraca", () => {
    montar(token("a", { ...chama, intensidade: 0.35 }));

    setSelectionLanterna({ cor: "#93c5fd" });

    expect(luzDe("a")?.intensidade).toBe(0.35);
  });

  it("escolher a intensidade de uma apagada a acende", () => {
    montar(token("a"));

    setSelectionLanterna({ intensidade: 0.65 });

    expect(luzDe("a")).toMatchObject({ raio: 260, intensidade: 0.65 });
  });

  it("apontar o facho guarda a intensidade", () => {
    montar(token("a", { ...chama, intensidade: 0.65 }));

    apontarLanterna({ angulo: 0 });

    expect(luzDe("a")).toMatchObject({
      intensidade: 0.65,
      cone: { angulo: 0 },
    });
  });
});
