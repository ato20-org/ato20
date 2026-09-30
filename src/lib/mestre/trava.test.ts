import { afterEach, describe, expect, it } from "vitest";

import {
  cutSelection,
  nudgeSelection,
  removeFogSelection,
  removeLuzSelection,
  removeParedeSelection,
  removeSelection,
  selectAllItems,
  toggleSelectionLock,
} from "@/lib/mestre/item-actions";
import { useClipboardStore } from "@/lib/store/use-clipboard-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import type {
  CanvasItem,
  FogRegion,
  Forma,
  Luz,
  Parede,
  Scene,
  Texto,
} from "@/types/scene";

const boss = {
  id: "boss",
  assetId: "a",
  x: 100,
  y: 100,
  width: 80,
  height: 80,
  rotation: 0,
  z: 1,
  locked: true,
} as CanvasItem;

const parede: Parede = {
  id: "w",
  x: 100,
  y: 100,
  width: 300,
  height: 200,
  formato: "retangulo",
};
const area: FogRegion = {
  id: "a",
  x: 400,
  y: 400,
  width: 120,
  height: 80,
  revealed: false,
};
const luz: Luz = { id: "l", x: 500, y: 300, raio: 260, cor: "#fb923c" };
const forma: Forma = {
  id: "f",
  tipo: "retangulo",
  x: 200,
  y: 200,
  width: 100,
  height: 100,
  rotation: 0,
};
const texto: Texto = { id: "t", x: 50, y: 50, texto: "Altar" };

function montar(mudar: Partial<Scene> = {}) {
  useSceneStore.setState({
    board: {
      scenes: [
        {
          id: "c1",
          items: [boss],
          fog: [area],
          paredes: [parede],
          luzes: [luz],
          formas: [forma],
          textos: [texto],
          ...mudar,
        } as unknown as Scene,
      ],
      editingSceneId: "c1",
      liveSceneId: "c1",
    },
    status: "ready",
  } as never);
}

function atual(): Scene {
  return useSceneStore.getState().board!.scenes[0]!;
}

afterEach(() => {
  useSceneStore.setState({ board: null, status: "idle" } as never);
  useSelectionStore.getState().clear();
  useClipboardStore.getState().copy({});
});

describe("o cadeado", () => {
  it("trava e destrava a parede, e destravada ela volta sem o campo", () => {
    montar();
    useSelectionStore.getState().selectParede("w");

    toggleSelectionLock();
    expect(atual().paredes![0]!.locked).toBe(true);

    toggleSelectionLock();
    expect(atual().paredes![0]!.locked).toBeUndefined();
  });

  it("trava a área e a luz pelo mesmo gesto", () => {
    montar();
    useSelectionStore.getState().selectFog("a");
    toggleSelectionLock();
    useSelectionStore.getState().selectLuz("l");
    toggleSelectionLock();

    expect(atual().fog[0]!.locked).toBe(true);
    expect(atual().luzes![0]!.locked).toBe(true);
  });

  it("com um livre na mão, o toque trava todos", () => {
    montar();
    useSelectionStore
      .getState()
      .selectMisto({ itens: ["boss"], formas: ["f"], textos: ["t"] });

    toggleSelectionLock();

    expect(atual().items[0]!.locked).toBe(true);
    expect(atual().formas![0]!.locked).toBe(true);
    expect(atual().textos![0]!.locked).toBe(true);
  });
});

describe("travado não sai", () => {
  it("o Delete não apaga parede, área nem luz travadas", () => {
    montar({
      paredes: [{ ...parede, locked: true }],
      fog: [{ ...area, locked: true }],
      luzes: [{ ...luz, locked: true }],
    });

    useSelectionStore.getState().selectParede("w");
    removeParedeSelection();
    useSelectionStore.getState().selectFog("a");
    removeFogSelection();
    useSelectionStore.getState().selectLuz("l");
    removeLuzSelection();

    expect(atual().paredes).toHaveLength(1);
    expect(atual().fog).toHaveLength(1);
    expect(atual().luzes).toHaveLength(1);
  });

  it("numa mão misturada, sai só o que está livre", () => {
    montar({ formas: [{ ...forma, locked: true }] });
    useSelectionStore
      .getState()
      .selectMisto({ itens: ["boss"], formas: ["f"], textos: ["t"] });

    removeSelection();

    expect(atual().items).toHaveLength(1);
    expect(atual().formas).toHaveLength(1);
    expect(atual().textos ?? []).toHaveLength(0);
  });

  it("Ctrl+X na parede travada copia e deixa ela onde está", () => {
    montar({ paredes: [{ ...parede, locked: true }] });
    useSelectionStore.getState().selectParede("w");

    cutSelection();

    expect(atual().paredes).toHaveLength(1);
    expect(useClipboardStore.getState().paredes).toHaveLength(1);
  });
});

describe("travado não anda", () => {
  it("as setas empurram o texto livre e não a forma travada", () => {
    montar({ formas: [{ ...forma, locked: true }] });
    useSelectionStore
      .getState()
      .selectMisto({ formas: ["f"], textos: ["t"] });

    nudgeSelection(10, 0);

    expect(atual().formas![0]!.x).toBe(200);
    expect(atual().textos![0]!.x).toBe(60);
  });

  it("selecionar tudo deixa o travado de fora", () => {
    montar({ formas: [{ ...forma, locked: true }] });

    selectAllItems();

    const selecao = useSelectionStore.getState();
    expect(selecao.selectedIds).toEqual([]);
    expect(selecao.selectedFormaIds).toEqual([]);
    expect(selecao.selectedTextoIds).toEqual(["t"]);
  });
});
