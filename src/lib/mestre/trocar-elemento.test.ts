import { beforeEach, describe, expect, it } from "vitest";

import { trocarFormato, trocarTipo } from "@/lib/mestre/trocar-elemento";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import type { AreaDeEfeito, Forma, Scene } from "@/types/scene";

const fogo: AreaDeEfeito = {
  id: "a1",
  x: 100,
  y: 100,
  width: 300,
  height: 200,
  rotation: 30,
  formato: "elipse",
  efeito: "chamas",
};

const caixa: Forma = {
  id: "f1",
  tipo: "retangulo",
  x: 0,
  y: 0,
  width: 50,
  height: 50,
  rotation: 0,
  espessura: 4,
};

function montar(cena: Partial<Scene>) {
  useSceneStore.setState({
    board: {
      scenes: [{ id: "c1", items: [], fog: [], ...cena } as unknown as Scene],
      editingSceneId: "c1",
      liveSceneId: null,
    },
    status: "ready",
  } as never);
}

function atual(): Scene {
  return useSceneStore.getState().board!.scenes[0]!;
}

describe("o painel de Elementos troca o selecionado", () => {
  beforeEach(() => {
    useToolStore.setState({ efeitoDaArea: undefined, nevoaNovaDinamica: false, fundoForma: undefined });
  });

  it("a área de efeito vira forma no mesmo lugar, e a seleção vai junto", () => {
    montar({ areasDeEfeito: [fogo] });
    useSelectionStore.getState().selectAreaDeEfeito("a1");

    trocarTipo("c1", { natureza: "efeito", area: fogo }, "elemento");

    const cena = atual();
    expect(cena.areasDeEfeito).toBeUndefined();
    expect(cena.formas).toHaveLength(1);
    expect(cena.formas![0]).toMatchObject({ tipo: "elipse", x: 100, y: 100, width: 300, height: 200, rotation: 30 });
    const { selectedFormaIds, selectedAreaDeEfeitoId } = useSelectionStore.getState();
    expect(selectedAreaDeEfeitoId).toBeNull();
    expect(selectedFormaIds).toEqual([cena.formas![0]!.id]);
  });

  // As duas gravações caem no mesmo passo: um Ctrl+Z devolve o fogo.
  it("um desfazer só devolve o que era", () => {
    montar({ areasDeEfeito: [fogo] });
    useSceneStore.setState({ lastCommitAt: 0 } as never);

    trocarTipo("c1", { natureza: "efeito", area: fogo }, "area");
    expect(atual().fog).toHaveLength(1);

    useSceneStore.getState().undo();
    expect(atual().areasDeEfeito).toEqual([fogo]);
    expect(atual().fog).toEqual([]);
  });

  it("a forma vira área de efeito com o efeito que o painel tem na mão", () => {
    montar({ formas: [caixa] });
    useToolStore.setState({ efeitoDaArea: "campanha/nevoa" });

    trocarTipo("c1", { natureza: "elemento", forma: caixa }, "efeito");

    expect(atual().formas).toBeUndefined();
    expect(atual().areasDeEfeito![0]).toMatchObject({ efeito: "campanha/nevoa", width: 50 });
    expect(useSelectionStore.getState().selectedAreaDeEfeitoId).toBe(atual().areasDeEfeito![0]!.id);
  });

  it("o formato troca na mesma caixa, e o laço começa dos cantos", () => {
    montar({ areasDeEfeito: [fogo], formas: [caixa] });

    trocarFormato("c1", [{ natureza: "elemento", forma: caixa }], "poligono");
    trocarFormato("c1", [{ natureza: "efeito", area: fogo }], "retangulo");

    expect(atual().formas![0]).toMatchObject({ tipo: "poligono", pontos: [0, 0, 1, 0, 1, 1, 0, 1] });
    const area = atual().areasDeEfeito![0]!;
    expect(area.formato).toBeUndefined();
    expect(area).toMatchObject({ x: 100, width: 300, efeito: "chamas" });
  });
});
