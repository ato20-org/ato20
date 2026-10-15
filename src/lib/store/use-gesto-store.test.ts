import { describe, expect, it } from "vitest";

import {
  aplicarGesto,
  moverNoGesto,
  moverPortaNoGesto,
  terminarGestoDaPorta,
  useGestoStore,
} from "@/lib/store/use-gesto-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import type { Scene } from "@/types/scene";

const cena = {
  id: "c1",
  items: [
    { id: "a", x: 0, y: 0, width: 10, height: 10, rotation: 0, z: 1, assetId: "", locked: false },
    { id: "b", x: 5, y: 5, width: 10, height: 10, rotation: 0, z: 2, assetId: "", locked: false },
  ],
  fog: [],
} as unknown as Scene;

const comCamera = {
  ...cena,
  cameras: [{ id: "k", viewport: { x: 0, y: 0, width: 960, height: 540 } }],
  cameraNoArId: "k",
  camera: { x: 0, y: 0, width: 960, height: 540 },
} as unknown as Scene;

describe("aplicarGesto", () => {
  it("a moldura no gesto move a câmera e, no ar, o recorte da mesa", () => {
    const alvo = { x: 100, y: 50, width: 480, height: 270 };
    const vista = aplicarGesto(comCamera, {
      sceneId: "c1",
      patches: null,
      textos: null,
      formas: null,
      camera: { cameraId: "k", viewport: alvo },
    });
    expect(vista.cameras?.[0]?.viewport).toEqual(alvo);
    expect(vista.camera).toEqual(alvo);
    expect(vista.items).toBe(comCamera.items);
  });

  it("sem gesto devolve a mesma cena", () => {
    expect(
      aplicarGesto(cena, {
        sceneId: null,
        patches: null,
        textos: null,
        formas: null,
        camera: null,
      }),
    ).toBe(cena);
  });

  it("gesto de outra cena não toca nesta", () => {
    expect(
      aplicarGesto(cena, {
        sceneId: "outra",
        patches: [{ id: "a", patch: { x: 9 } }],
        textos: null,
        formas: null,
        camera: null,
      }),
    ).toBe(cena);
  });

  it("o texto do quadro anda no gesto, e o que não anda continua o mesmo", () => {
    const comTextos = {
      ...cena,
      textos: [
        { id: "t1", x: 0, y: 0, texto: "reino", tamanho: 40 },
        { id: "t2", x: 80, y: 80, texto: "vilão", tamanho: 40 },
      ],
    } as unknown as Scene;

    const vista = aplicarGesto(comTextos, {
      sceneId: "c1",
      patches: null,
      textos: [{ id: "t1", patch: { x: 30, y: 12 } }],
      formas: null,
      camera: null,
    });

    expect(vista.textos?.[0]).toMatchObject({ x: 30, y: 12, texto: "reino" });
    expect(vista.textos?.[1]).toBe(comTextos.textos?.[1]);
    // O board não foi tocado: o gesto é uma camada por cima.
    expect(comTextos.textos?.[0]?.x).toBe(0);
  });

  it("a forma do quadro anda no gesto, como o item e o texto", () => {
    const comFormas = {
      ...cena,
      formas: [
        { id: "f1", tipo: "retangulo", x: 0, y: 0, width: 100, height: 60, rotation: 0, espessura: 6 },
        { id: "f2", tipo: "linha", x: 200, y: 200, width: 50, height: 50, rotation: 0, espessura: 6 },
      ],
    } as unknown as Scene;

    const vista = aplicarGesto(comFormas, {
      sceneId: "c1",
      patches: null,
      textos: null,
      formas: [{ id: "f1", patch: { x: 40, width: 200 } }],
      camera: null,
    });

    expect(vista.formas?.[0]).toMatchObject({ x: 40, width: 200, height: 60 });
    expect(vista.formas?.[1]).toBe(comFormas.formas?.[1]);
    expect(comFormas.formas?.[0]?.x).toBe(0);
  });

  it("aplica o patch e preserva a identidade dos itens parados", () => {
    const vista = aplicarGesto(cena, {
      sceneId: "c1",
      patches: [{ id: "a", patch: { x: 99, rotation: 45 } }],
      textos: null,
      formas: null,
      camera: null,
    });
    expect(vista).not.toBe(cena);
    expect(vista.items[0]).toMatchObject({ x: 99, rotation: 45, y: 0 });
    expect(vista.items[1]).toBe(cena.items[1]);
  });
});

describe("moverNoGesto", () => {
  it("no ar, o gesto fica no gesto: o board não muda a cada quadro", () => {
    useSceneStore.setState({
      board: { scenes: [cena], editingSceneId: "c1", liveSceneId: "c1" },
      status: "ready",
    });
    const antes = useSceneStore.getState().board;

    moverNoGesto("c1", [{ id: "a", patch: { x: 40 } }]);
    moverNoGesto("c1", [{ id: "a", patch: { x: 80 } }]);

    // Publicar para a mesa não é gravar: a mesa vê a vista com o gesto
    // aplicado (ver `publicarGestoAoVivo`), e o board só sabe do gesto ao
    // soltar. Antes, cada intervalo do canal era um commit.
    expect(useSceneStore.getState().board).toBe(antes);
    expect(useGestoStore.getState().patches).toEqual([{ id: "a", patch: { x: 80 } }]);

    useGestoStore.getState().terminar();
    useSceneStore.setState({ board: null, status: "idle" });
  });
});

describe("o gesto da porta", () => {
  const comPorta = {
    ...cena,
    portas: [
      { id: "p", x: 100, y: 100, comprimento: 50, angulo: 0 },
      { id: "q", x: 300, y: 100, comprimento: 50, angulo: 0 },
    ],
  } as unknown as Scene;

  it("abre só a porta do gesto, e a outra continua a mesma", () => {
    const vista = aplicarGesto(comPorta, {
      sceneId: "c1",
      patches: null,
      textos: null,
      formas: null,
      camera: null,
      porta: { portaId: "p", patch: { abertura: 90 } },
    });

    expect(vista.portas?.[0]).toMatchObject({ abertura: 90, angulo: 0 });
    expect(vista.portas?.[1]).toBe(comPorta.portas?.[1]);
    expect(vista.items).toBe(comPorta.items);
  });

  it("gira sem gravar, e grava um passo só ao soltar", () => {
    useSceneStore.setState({
      board: { scenes: [comPorta], editingSceneId: "c1", liveSceneId: "c1" },
      status: "ready",
    });
    const antes = useSceneStore.getState().board;

    moverPortaNoGesto("c1", "p", { abertura: 30 });
    moverPortaNoGesto("c1", "p", { abertura: 75 });
    expect(useSceneStore.getState().board).toBe(antes);

    terminarGestoDaPorta();
    const depois = useSceneStore.getState().board!.scenes[0]!;
    expect(depois.portas?.[0]?.abertura).toBe(75);
    expect(useGestoStore.getState().porta).toBeNull();
    expect(useGestoStore.getState().sceneId).toBeNull();

    useSceneStore.setState({ board: null, status: "idle" });
  });

  it("fechar pelo ímã grava a porta sem abertura", () => {
    const aberta = {
      ...comPorta,
      portas: [{ id: "p", x: 100, y: 100, comprimento: 50, angulo: 0, abertura: 60 }],
    } as unknown as Scene;
    useSceneStore.setState({
      board: { scenes: [aberta], editingSceneId: "c1", liveSceneId: "c1" },
      status: "ready",
    });

    moverPortaNoGesto("c1", "p", { abertura: undefined });
    terminarGestoDaPorta();

    expect(useSceneStore.getState().board!.scenes[0]!.portas?.[0]?.abertura).toBeUndefined();

    useSceneStore.setState({ board: null, status: "idle" });
  });
});
