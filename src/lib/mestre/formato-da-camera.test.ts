import { afterEach, describe, expect, it } from "vitest";

import {
  clampViewport,
  FULL_VIEWPORT,
  PLANO,
  proporcaoDe,
  temFormatoDaMesa,
} from "@/lib/geometry/viewport";
import {
  enquadrarAqui,
  enquadrarSelecao,
  irParaCamera,
  moverCamera,
  voltarAoFormatoDaMesa,
  zoomCamera,
} from "@/lib/mestre/camera-actions";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { SCENE_HEIGHT, type CanvasItem, type Scene, type Viewport } from "@/types/scene";

/** A torre em pé: estreita, com a altura inteira do plano. */
const torre: Viewport = { x: 700, y: 0, width: 400, height: SCENE_HEIGHT };

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

function montar(viewport: Viewport = torre) {
  useSceneStore.setState({
    board: {
      scenes: [
        {
          id: "c1",
          items: [token],
          fog: [],
          cameras: [{ id: "cam1", nome: "Câmera 1", viewport }],
          cameraNoArId: "cam1",
          camera: viewport,
        } as unknown as Scene,
      ],
      editingSceneId: "c1",
      liveSceneId: "c1",
    },
    status: "ready",
  } as never);
  useCameraLockStore.setState({ selecionadaId: "cam1", espelhoMestre: false });
}

function camera(): Viewport {
  return useSceneStore.getState().board!.scenes[0]!.cameras![0]!.viewport;
}

function centro(viewport: Viewport) {
  return {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  };
}

afterEach(() => {
  useSceneStore.setState({ board: null, status: "idle" } as never);
  useCameraLockStore.setState({ selecionadaId: null, espelhoMestre: false });
  useViewportStore.setState({ viewport: FULL_VIEWPORT, conteudo: PLANO });
  useSelectionStore.getState().clear();
});

describe("o formato é da câmera", () => {
  it("mover não muda o formato", () => {
    montar();
    moverCamera(0.05, 0);

    expect(camera().width).toBe(torre.width);
    expect(camera().height).toBe(torre.height);
  });

  it("aproximar e afastar mantêm o formato", () => {
    montar();
    zoomCamera(1.25);
    expect(proporcaoDe(camera())).toBeCloseTo(proporcaoDe(torre));

    zoomCamera(1 / 1.25);
    zoomCamera(1 / 1.25);
    expect(proporcaoDe(camera())).toBeCloseTo(proporcaoDe(torre));
  });

  it("trazer para onde o mestre está mantém o formato, do tamanho que cabe", () => {
    montar();
    const palco = clampViewport({ x: 100, y: 100, width: 960, height: 0 });
    useViewportStore.setState({ viewport: palco });

    enquadrarAqui();

    expect(proporcaoDe(camera())).toBeCloseTo(proporcaoDe(torre));
    expect(camera().height).toBeCloseTo(palco.height);
    expect(centro(camera()).x).toBeCloseTo(centro(palco).x);
  });

  it("trazer a câmera 16:9 copia o palco, como sempre", () => {
    montar(FULL_VIEWPORT);
    const palco = clampViewport({ x: 100, y: 100, width: 960, height: 0 });
    useViewportStore.setState({ viewport: palco });

    enquadrarAqui();

    expect(camera()).toEqual(palco);
  });

  it("enquadrar a seleção mantém o formato", () => {
    montar();
    useSelectionStore.getState().select(["token"]);

    enquadrarSelecao();

    expect(proporcaoDe(camera())).toBeCloseTo(proporcaoDe(torre));
    expect(centro(camera()).x).toBeCloseTo(token.x + token.width / 2);
  });

  it("prender num token mantém o formato, e segui-lo também", () => {
    montar();
    useCameraLockStore.getState().prenderEm(["token"]);
    expect(proporcaoDe(camera())).toBeCloseTo(proporcaoDe(torre));

    // O token anda; o seguidor leva a câmera junto, no formato dela.
    useSceneStore.getState().updateScene("c1", (scene) => ({
      ...scene,
      items: scene.items.map((item) => ({ ...item, x: item.x + 300 })),
    }));
    expect(proporcaoDe(camera())).toBeCloseTo(proporcaoDe(torre));
    expect(centro(camera()).x).toBeCloseTo(token.x + 300 + token.width / 2);
  });

  it("espelhar o palco mantém o formato", () => {
    montar();
    useCameraLockStore.getState().alternarEspelho();
    useViewportStore
      .getState()
      .setViewport(clampViewport({ x: 300, y: 200, width: 800, height: 0 }));

    expect(proporcaoDe(camera())).toBeCloseTo(proporcaoDe(torre));
  });
});

describe("voltar a 16:9", () => {
  it("devolve o 16:9 em volta da câmera, sem tirar nada do quadro", () => {
    montar();
    voltarAoFormatoDaMesa();

    expect(temFormatoDaMesa(camera())).toBe(true);
    expect(camera().height).toBeCloseTo(torre.height);
    expect(centro(camera()).x).toBeCloseTo(centro(torre).x);
  });

  it("no ar, a mesa recebe o recorte novo", () => {
    montar();
    voltarAoFormatoDaMesa();

    const scene = useSceneStore.getState().board!.scenes[0]!;
    expect(scene.camera).toEqual(camera());
  });
});

describe("ir até a câmera", () => {
  it("leva o palco ao 16:9 que contém a câmera em pé inteira", () => {
    montar();
    irParaCamera();

    const palco = useViewportStore.getState().viewport;
    expect(temFormatoDaMesa(palco)).toBe(true);
    expect(palco.y).toBeLessThanOrEqual(torre.y);
    expect(palco.y + palco.height).toBeGreaterThanOrEqual(
      torre.y + torre.height - 1e-6,
    );
  });
});
