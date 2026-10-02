import { afterEach, describe, expect, it } from "vitest";

import { cameraNaPosicao } from "@/lib/mestre/camera-actions";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { useEsguelhaStore } from "@/lib/store/use-esguelha-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { sceneForTable } from "@/lib/sync/for-table";
import { createScene, type Scene, type Tripe } from "@/types/scene";

const OLHO: Tripe = {
  x: 400,
  y: 300,
  altura: 80,
  giro: 30,
  inclinacao: 70,
  rolagem: 0,
  lente: 45,
};

const RECORTE = { x: 0, y: 0, width: 960, height: 540 };

function montar(extra: Partial<Scene> = {}) {
  const cena = {
    ...createScene("Cripta"),
    id: "c1",
    cameras: [{ id: "cam1", nome: "Câmera 1", viewport: RECORTE }],
    ...extra,
  } as Scene;

  useSceneStore.setState({
    board: { scenes: [cena], editingSceneId: "c1", liveSceneId: "c1" },
    status: "ready",
  } as never);
}

function cena(): Scene {
  return useSceneStore.getState().board!.scenes[0]!;
}

afterEach(() => {
  useSceneStore.setState({ board: null, status: "idle" } as never);
  useCameraLockStore.setState({
    selecionadaId: null,
    doOutroModo: null,
    espelhoMestre: false,
  });
  useEsguelhaStore.setState({ ligada: false });
});

describe("tripés no ar", () => {
  it("pôr um tripé no ar põe a mesa de esguelha, e tira o recorte", () => {
    montar();
    const store = useSceneStore.getState();
    store.transmitirCamera("c1", "cam1");
    const id = store.salvarTripe("c1", { ...OLHO, nome: "Tripé 1" });

    store.transmitirCamera("c1", id);

    expect(cena().cameraNoArId).toBe(id);
    expect(cena().tripeNoAr).toEqual(OLHO);
    expect(cena().camera).toBeUndefined();
  });

  it("uma câmera 2D no ar devolve a mesa ao prumo, sem deixar o campo vazio", () => {
    montar();
    const store = useSceneStore.getState();
    const id = store.salvarTripe("c1", { ...OLHO, nome: "Tripé 1" });
    store.transmitirCamera("c1", id);

    store.transmitirCamera("c1", "cam1");

    expect(cena().cameraNoArId).toBe("cam1");
    expect(cena().camera).toEqual(RECORTE);
    // AUSENTE, e não `undefined`: é a ausência que a mesa lê como "de prumo".
    expect("tripeNoAr" in cena()).toBe(false);
  });

  it("mexer no tripé no ar leva o olho novo à mesa; o de fora não", () => {
    montar();
    const store = useSceneStore.getState();
    const noAr = store.salvarTripe("c1", { ...OLHO, nome: "Tripé 1" });
    const outro = store.salvarTripe("c1", { ...OLHO, nome: "Tripé 2" });
    store.transmitirCamera("c1", noAr);

    store.atualizarTripe("c1", outro, { altura: 300 });
    expect(cena().tripeNoAr?.altura).toBe(80);

    store.atualizarTripe("c1", noAr, { altura: 150, giro: 90 });
    expect(cena().tripeNoAr).toEqual({ ...OLHO, altura: 150, giro: 90 });
  });

  it("apagar o tripé no ar devolve a mesa à cena inteira", () => {
    montar();
    const store = useSceneStore.getState();
    const id = store.salvarTripe("c1", { ...OLHO, nome: "Tripé 1" });
    store.transmitirCamera("c1", id);

    store.removerTripe("c1", id);

    expect(cena().tripes).toBeUndefined();
    expect("cameraNoArId" in cena()).toBe(false);
    expect("tripeNoAr" in cena()).toBe(false);
  });

  it("no 2.5D, um tripé selecionado continua selecionado quando a cena reabre", () => {
    montar();
    const id = useSceneStore
      .getState()
      .salvarTripe("c1", { ...OLHO, nome: "Tripé 1" });
    useEsguelhaStore.setState({ ligada: true });
    useCameraLockStore.setState({ selecionadaId: id });

    useCameraLockStore.getState().garantirCameraInicial(cena());

    expect(useCameraLockStore.getState().selecionadaId).toBe(id);
  });
});

describe("cada modo, a sua lista de câmeras", () => {
  it("o Shift+n conta só a lista do modo", () => {
    montar();
    const tripe = useSceneStore
      .getState()
      .salvarTripe("c1", { ...OLHO, nome: "Tripé 1" });

    expect(cameraNaPosicao(1)?.id).toBe("cam1");
    expect(cameraNaPosicao(2)).toBeUndefined();

    useEsguelhaStore.setState({ ligada: true });
    expect(cameraNaPosicao(1)?.id).toBe(tripe);
  });

  it("ir ao 2.5D seleciona um tripé, e voltar devolve a câmera que se preparava", () => {
    montar({
      cameras: [
        { id: "cam1", nome: "Câmera 1", viewport: RECORTE },
        { id: "cam2", nome: "Câmera 2", viewport: RECORTE },
      ],
    });
    const tripe = useSceneStore
      .getState()
      .salvarTripe("c1", { ...OLHO, nome: "Tripé 1" });
    useCameraLockStore.setState({ selecionadaId: "cam2" });

    useEsguelhaStore.getState().alternar();
    expect(useCameraLockStore.getState().selecionadaId).toBe(tripe);

    useEsguelhaStore.getState().alternar();
    expect(useCameraLockStore.getState().selecionadaId).toBe("cam2");
  });

  it("na troca, a câmera do ar daquela lista vem antes da primeira", () => {
    montar();
    const store = useSceneStore.getState();
    store.salvarTripe("c1", { ...OLHO, nome: "Tripé 1" });
    const segundo = store.salvarTripe("c1", { ...OLHO, nome: "Tripé 2" });
    store.transmitirCamera("c1", segundo);
    useCameraLockStore.setState({ selecionadaId: "cam1" });

    useEsguelhaStore.getState().alternar();

    expect(useCameraLockStore.getState().selecionadaId).toBe(segundo);
  });

  it("um modo sem câmera nenhuma deixa a seleção onde estava", () => {
    montar();
    useCameraLockStore.setState({ selecionadaId: "cam1" });

    useEsguelhaStore.getState().alternar();

    expect(useCameraLockStore.getState().selecionadaId).toBe("cam1");
  });
});

describe("tripés e a mesa", () => {
  it("a lista de tripés nunca chega à mesa, nem numa cena só com eles", () => {
    // O atalho do filtro devolve a cena intacta quando não há nada a tirar --
    // e uma cena com tripés e nada mais caía nele.
    const scene = createScene("");
    scene.tripes = [{ ...OLHO, id: "t", nome: "Tripé 1" }];
    scene.tripeNoAr = OLHO;
    scene.cameraNoArId = "t";

    const mesa = sceneForTable(scene)!;
    expect(mesa.tripes).toBeUndefined();
    expect(mesa.tripeNoAr).toEqual(OLHO);
    expect(mesa.cameraNoArId).toBe("t");
  });

  it("o quadro vai sem tripé nenhum: ele não é visto de esguelha", () => {
    const scene = createScene("Linha do tempo", "quadro");
    scene.tripes = [{ ...OLHO, id: "t", nome: "Tripé 1" }];
    scene.tripeNoAr = OLHO;

    const mesa = sceneForTable(scene)!;
    expect(mesa.tripes).toBeUndefined();
    expect(mesa.tripeNoAr).toBeUndefined();
  });
});

describe("o Shift+L em cada modo", () => {
  it("no 2D, com um tripé selecionado, espelha a câmera 2D e a seleciona", () => {
    montar();
    const tripe = useSceneStore
      .getState()
      .salvarTripe("c1", { ...OLHO, nome: "Tripé 1" });
    useCameraLockStore.setState({ selecionadaId: tripe });

    useCameraLockStore.getState().alternarEspelho();

    expect(useCameraLockStore.getState().selecionadaId).toBe("cam1");
    expect(useCameraLockStore.getState().espelhoMestre).toBe(true);
  });

  it("no 2D, sem câmera 2D nenhuma, não liga nada", () => {
    montar({ cameras: [] });
    useCameraLockStore.setState({ selecionadaId: "apagada" });

    useCameraLockStore.getState().alternarEspelho();

    expect(useCameraLockStore.getState().espelhoMestre).toBe(false);
  });
});
