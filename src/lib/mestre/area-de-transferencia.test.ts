import { afterEach, describe, expect, it } from "vitest";

import {
  copySelection,
  cutSelection,
  duplicateSelection,
  PASTE_OFFSET,
  pasteClipboard,
} from "@/lib/mestre/item-actions";
import {
  temAlgoParaColar,
  useClipboardStore,
} from "@/lib/store/use-clipboard-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import type { Documento, Forma, Postit, Scene, Texto, Traco } from "@/types/scene";

const texto: Texto = {
  id: "t",
  x: 100,
  y: 100,
  texto: "Taverna",
  tamanho: 40,
  cor: "#ef4444",
  fundo: "#fde047",
  negrito: true,
  italico: true,
  sublinhado: true,
  largura: 200,
  altura: 50,
};

const poligono: Forma = {
  id: "f",
  tipo: "poligono",
  x: 200,
  y: 200,
  width: 100,
  height: 100,
  rotation: 0,
  cor: "#22c55e",
  espessura: 4,
  fundo: "#22c55e33",
  pontos: [0, 0, 1, 0, 0.5, 1],
};

const postit: Postit = {
  id: "p",
  x: 300,
  y: 300,
  largura: 260,
  altura: 180,
  texto: "lembrar do cheiro",
  cor: "rosa",
  fonte: 24,
};

const risco: Traco = { id: "r", pontos: [0, 0, 10, 20], cor: "#3b82f6", espessura: 6 };

const cartao = {
  id: "d",
  arquivo: "nota.md",
  x: 0,
  y: 0,
  largura: 300,
  altura: 200,
} as unknown as Documento;

/** Uma cena de MAPA: o colar vale em qualquer cena, não só no quadro. */
const cena = {
  id: "c1",
  items: [],
  fog: [],
  textos: [texto],
  formas: [poligono],
  postits: [postit],
  tracos: [risco],
  documentos: [cartao],
} as unknown as Scene;

function montar() {
  useSceneStore.setState({
    board: { scenes: [cena], editingSceneId: "c1", liveSceneId: "c1" },
    status: "ready",
  } as never);
  useSelectionStore.getState().selectMisto({
    textos: ["t"],
    formas: ["f"],
    postits: ["p"],
    tracos: ["r"],
    documentos: ["d"],
  });
}

function atual(): Scene {
  return useSceneStore.getState().board!.scenes[0]!;
}

afterEach(() => {
  useSceneStore.setState({ board: null, status: "idle" } as never);
  useSelectionStore.getState().clear();
  useClipboardStore.getState().copy({});
});

describe("área de transferência", () => {
  it("só formas copiadas já é algo para colar", () => {
    useClipboardStore.getState().copy({ formas: [poligono] });

    expect(temAlgoParaColar(useClipboardStore.getState())).toBe(true);
  });

  it("colar traz cada coisa com a cor dela, num mapa", () => {
    montar();
    copySelection();
    pasteClipboard();

    const { textos, formas, postits, tracos, documentos } = atual();

    expect(textos).toHaveLength(2);
    expect(textos![1]).toMatchObject({
      texto: "Taverna",
      cor: "#ef4444",
      fundo: "#fde047",
      negrito: true,
      italico: true,
      sublinhado: true,
      x: 100 + PASTE_OFFSET,
    });
    // A caixa medida é do render: a cópia se mede ao nascer.
    expect(textos![1]!.largura).toBeUndefined();

    expect(formas![1]).toMatchObject({
      cor: "#22c55e",
      fundo: "#22c55e33",
      pontos: [0, 0, 1, 0, 0.5, 1],
    });
    expect(postits![1]).toMatchObject({
      cor: "rosa",
      fonte: 24,
      texto: "lembrar do cheiro",
      x: 300 + PASTE_OFFSET,
    });
    expect(tracos![1]).toMatchObject({
      cor: "#3b82f6",
      espessura: 6,
      pontos: [PASTE_OFFSET, PASTE_OFFSET, 10 + PASTE_OFFSET, 20 + PASTE_OFFSET],
    });
    // O cartão não viaja: ver `copySelection`.
    expect(documentos).toHaveLength(1);

    // A cópia fica na mão, não o original.
    const selecao = useSelectionStore.getState();
    expect(selecao.selectedPostitIds).toEqual([postits![1]!.id]);
    expect(selecao.selectedTracoIds).toEqual([tracos![1]!.id]);
  });

  it("duplicar também leva a cor do texto", () => {
    montar();
    duplicateSelection();

    const { textos, postits } = atual();
    expect(textos![1]).toMatchObject({ cor: "#ef4444", negrito: true });
    expect(postits![1]).toMatchObject({ cor: "rosa", fonte: 24 });
  });

  it("recortar leva papel e risco, e deixa só o cartão", () => {
    montar();
    cutSelection();

    const { textos, formas, postits, tracos, documentos } = atual();
    expect(textos ?? []).toHaveLength(0);
    expect(formas ?? []).toHaveLength(0);
    expect(postits ?? []).toHaveLength(0);
    expect(tracos ?? []).toHaveLength(0);
    expect(documentos).toHaveLength(1);
  });
});
