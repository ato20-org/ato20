import { afterEach, describe, expect, it } from "vitest";

import { atalhos } from "@/lib/mestre/atalhos";
import { removePin, removePinSelection } from "@/lib/mestre/item-actions";
import { usePinWindowStore } from "@/lib/store/use-pin-window-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import type { CanvasItem, MapPin, Scene } from "@/types/scene";

const token = {
  id: "token",
  assetId: "a",
  x: 100,
  y: 100,
  width: 80,
  height: 80,
  rotation: 0,
  z: 1,
} as CanvasItem;

const alcapao: MapPin = {
  id: "p1",
  x: 400,
  y: 300,
  title: "Alçapão",
  note: "Atrás do balcão.",
  attachments: ["mapa-do-porao"],
};
const altar: MapPin = { id: "p2", x: 900, y: 500, title: "", note: "", attachments: [] };

function montar() {
  useSceneStore.setState({
    board: {
      scenes: [
        {
          id: "c1",
          items: [token],
          fog: [],
          pins: [alcapao, altar],
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

/** A tecla, pela tabela: é ela que o listener do Mestre consulta. */
function apertarDelete() {
  const evento = { key: "Delete", ctrlKey: false, metaKey: false } as KeyboardEvent;
  const atalho = atalhos().find((candidato) => candidato.combina(evento));
  expect(atalho?.rotulo).toBe("Apagar o que está selecionado");
  atalho!.executar(evento);
}

afterEach(() => {
  useSceneStore.setState({ board: null, status: "idle" } as never);
  useSelectionStore.getState().clear();
  usePinWindowStore.setState({ notas: [] });
});

describe("o Delete no ponto de anotação", () => {
  it("apaga o ponto selecionado e deixa o resto", () => {
    montar();
    useSelectionStore.getState().selectPin("p1");

    apertarDelete();

    expect(atual().pins!.map((pin) => pin.id)).toEqual(["p2"]);
    expect(atual().items).toHaveLength(1);
    expect(useSelectionStore.getState().selectedPinId).toBeNull();
  });

  it("selecionar o ponto larga o token, e o Delete não o leva junto", () => {
    montar();
    useSelectionStore.getState().select(["token"]);
    useSelectionStore.getState().selectPin("p1");

    expect(useSelectionStore.getState().selectedIds).toEqual([]);

    apertarDelete();

    expect(atual().items).toHaveLength(1);
  });

  it("selecionar outra coisa larga o ponto", () => {
    montar();
    useSelectionStore.getState().selectPin("p1");
    useSelectionStore.getState().select(["token"]);

    expect(useSelectionStore.getState().selectedPinId).toBeNull();
  });

  it("fecha a nota antes de apagar", () => {
    montar();
    usePinWindowStore.getState().abrir("p1");
    usePinWindowStore.getState().abrir("p2");
    useSelectionStore.getState().selectPin("p1");

    removePinSelection();

    expect(usePinWindowStore.getState().notas.map((nota) => nota.pinId)).toEqual(["p2"]);
  });

  it("o Ctrl+Z traz o ponto de volta com nota e anexos", () => {
    montar();
    useSelectionStore.getState().selectPin("p1");

    removePinSelection();
    useSceneStore.getState().undo();

    expect(atual().pins).toEqual([alcapao, altar]);
  });

  it("seleção de um ponto que já não existe não grava passo no desfazer", () => {
    montar();
    useSelectionStore.getState().selectPin("sumiu");
    const antes = useSceneStore.getState().board;

    removePinSelection();

    expect(useSceneStore.getState().board).toBe(antes);
    expect(useSelectionStore.getState().selectedPinId).toBeNull();
  });

  it("o botão da nota apaga pelo mesmo caminho e larga a seleção", () => {
    montar();
    usePinWindowStore.getState().abrir("p1");
    useSelectionStore.getState().selectPin("p1");

    removePin("c1", "p1");

    expect(atual().pins!.map((pin) => pin.id)).toEqual(["p2"]);
    expect(usePinWindowStore.getState().notas).toEqual([]);
    expect(useSelectionStore.getState().selectedPinId).toBeNull();
  });
});
