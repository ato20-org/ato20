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
import type {
  Documento,
  FogRegion,
  Forma,
  Luz,
  Parede,
  Postit,
  Scene,
  Texto,
  Traco,
} from "@/types/scene";

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
  opacidadeDoTraco: 0.8,
  opacidadeDoFundo: 0.25,
  arredondado: true,
  aMao: true,
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
      opacidadeDoTraco: 0.8,
      opacidadeDoFundo: 0.25,
      arredondado: true,
      aMao: true,
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

  describe("o chão do mapa", () => {
    const parede: Parede = {
      id: "w",
      x: 100,
      y: 100,
      width: 300,
      height: 200,
      rotation: 15,
      formato: "retangulo",
      altura: 140,
      semTeto: true,
    };
    const area: FogRegion = {
      id: "a",
      x: 400,
      y: 400,
      width: 120,
      height: 80,
      revealed: true,
      formato: "elipse",
    };
    const luz: Luz = {
      id: "l",
      x: 500,
      y: 300,
      raio: 260,
      cor: "#93c5fd",
      intensidade: 0.5,
      cone: { angulo: 90, abertura: 60 },
    };

    function montarChao(tipo?: Scene["tipo"]) {
      useSceneStore.setState({
        board: {
          scenes: [
            {
              id: "c1",
              tipo,
              items: [],
              fog: [area],
              paredes: [parede],
              luzes: [luz],
            } as unknown as Scene,
          ],
          editingSceneId: "c1",
          liveSceneId: "c1",
        },
        status: "ready",
      } as never);
    }

    it("copia e cola a parede com a altura e o teto dela, e a cópia fica na mão", () => {
      montarChao();
      useSelectionStore.getState().selectParede("w");
      copySelection();
      pasteClipboard();

      const { paredes } = atual();
      expect(paredes).toHaveLength(2);
      expect(paredes![1]).toMatchObject({
        formato: "retangulo",
        rotation: 15,
        altura: 140,
        semTeto: true,
        x: 100 + PASTE_OFFSET,
        y: 100 + PASTE_OFFSET,
      });
      expect(paredes![1]!.id).not.toBe("w");
      expect(useSelectionStore.getState().selectedParedeId).toBe(
        paredes![1]!.id,
      );
    });

    it("a área colada nasce escondendo, com o formato da original", () => {
      montarChao();
      useSelectionStore.getState().selectFog("a");
      copySelection();
      pasteClipboard();

      const { fog } = atual();
      expect(fog).toHaveLength(2);
      expect(fog[1]).toMatchObject({
        formato: "elipse",
        revealed: false,
        x: 400 + PASTE_OFFSET,
      });
      expect(useSelectionStore.getState().selectedFogId).toBe(fog[1]!.id);
    });

    it("duplica a luz com a cor, o cone e a intensidade", () => {
      montarChao();
      useSelectionStore.getState().selectLuz("l");
      duplicateSelection();

      const { luzes } = atual();
      expect(luzes).toHaveLength(2);
      expect(luzes![1]).toMatchObject({
        cor: "#93c5fd",
        intensidade: 0.5,
        cone: { angulo: 90, abertura: 60 },
        x: 500 + PASTE_OFFSET,
        y: 300 + PASTE_OFFSET,
      });
      expect(useSelectionStore.getState().selectedLuzId).toBe(luzes![1]!.id);
    });

    it("recortar a parede tira só ela, e o Ctrl+V a devolve", () => {
      montarChao();
      useSelectionStore.getState().selectParede("w");
      cutSelection();

      expect(atual().paredes ?? []).toHaveLength(0);
      expect(atual().fog).toHaveLength(1);
      expect(atual().luzes).toHaveLength(1);

      pasteClipboard();
      expect(atual().paredes).toHaveLength(1);
    });

    it("não cola parede, área nem luz num quadro", () => {
      montarChao();
      useSelectionStore.getState().selectParede("w");
      copySelection();

      montarChao("quadro");
      pasteClipboard();

      expect(atual().paredes).toHaveLength(1);
    });
  });
});
