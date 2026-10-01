import { afterEach, describe, expect, it } from "vitest";

import { selectAllItems } from "@/lib/mestre/item-actions";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { sceneForTable } from "@/lib/sync/for-table";
import {
  createScene,
  itensVisiveis,
  pastasEscondidas,
  type CanvasItem,
  type Grupo,
  type Scene,
} from "@/types/scene";

function item(id: string, mudar: Partial<CanvasItem> = {}): CanvasItem {
  return {
    id,
    assetId: `arquivo-${id}`,
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    rotation: 0,
    z: 0,
    locked: false,
    ...mudar,
  };
}

const casa: Grupo = { id: "casa", nome: "Casa" };
const porao: Grupo = { id: "porao", nome: "Porão", parentId: "casa" };

function montar(mudar: Partial<Scene> = {}) {
  useSceneStore.setState({
    board: {
      scenes: [{ ...createScene("Taverna"), id: "c1", ...mudar }],
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
});

describe("itensVisiveis", () => {
  it("sem nada escondido devolve a MESMA lista", () => {
    const items = [item("a"), item("b", { grupoId: "casa" })];
    expect(itensVisiveis(items, [casa])).toBe(items);
  });

  it("tira a imagem de olho apagado", () => {
    const items = [item("a"), item("b", { escondido: true })];
    expect(itensVisiveis(items, undefined).map((i) => i.id)).toEqual(["a"]);
  });

  it("a pasta escondida leva tudo dentro, subpastas incluídas", () => {
    const items = [
      item("solto"),
      item("mesa", { grupoId: "casa" }),
      item("barril", { grupoId: "porao" }),
    ];
    const grupos = [{ ...casa, escondido: true }, porao];

    expect(itensVisiveis(items, grupos).map((i) => i.id)).toEqual(["solto"]);
    expect([...pastasEscondidas(grupos)].sort()).toEqual(["casa", "porao"]);
  });
});

describe("a mesa não recebe o escondido", () => {
  it("num mapa, a imagem escondida não está no JSON", () => {
    const scene = createScene("");
    scene.items = [item("monstro", { escondido: true }), item("chao")];

    expect(sceneForTable(scene)!.items.map((i) => i.id)).toEqual(["chao"]);
  });

  it("num mapa, a pasta escondida tira os itens antes de as pastas saírem", () => {
    const scene = createScene("");
    scene.grupos = [{ ...casa, escondido: true }];
    scene.items = [item("telhado", { grupoId: "casa" }), item("chao")];

    const mesa = sceneForTable(scene)!;
    expect(mesa.grupos).toBeUndefined();
    expect(mesa.items.map((i) => i.id)).toEqual(["chao"]);
  });

  it("no quadro também, e com identidade estável", () => {
    const scene = createScene("", "quadro");
    scene.items = [item("spoiler", { escondido: true }), item("mapa")];

    const mesa = sceneForTable(scene)!;
    expect(mesa.items.map((i) => i.id)).toEqual(["mapa"]);
    expect(sceneForTable(scene)).toBe(mesa);
  });
});

describe("o olho na lista de camadas", () => {
  it("esconde e mostra, e à vista é a ausência do campo", () => {
    montar({ items: [item("a")] });
    const { setItemsEscondidos } = useSceneStore.getState();

    setItemsEscondidos("c1", ["a"], true);
    expect(atual().items[0]!.escondido).toBe(true);

    setItemsEscondidos("c1", ["a"], false);
    expect(atual().items[0]!.escondido).toBeUndefined();
    expect(itensVisiveis(atual().items, atual().grupos)).toBe(atual().items);
  });

  it("desfazer a pasta escondida não põe o de dentro na mesa", () => {
    montar({
      grupos: [{ ...casa, escondido: true }, porao],
      items: [item("mesa", { grupoId: "casa" }), item("barril", { grupoId: "porao" })],
    });

    useSceneStore.getState().removerGrupo("c1", "casa");

    expect(itensVisiveis(atual().items, atual().grupos)).toEqual([]);
    expect(atual().items[0]!.escondido).toBe(true);
    expect(atual().grupos![0]!.escondido).toBe(true);
  });

  it("selecionar tudo deixa o escondido de fora", () => {
    montar({
      grupos: [{ ...casa, escondido: true }],
      items: [
        item("a"),
        item("b", { escondido: true }),
        item("c", { grupoId: "casa" }),
      ],
    });

    selectAllItems();

    expect(useSelectionStore.getState().selectedIds).toEqual(["a"]);
  });
});
