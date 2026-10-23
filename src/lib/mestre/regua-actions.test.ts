import { afterEach, describe, expect, it, vi } from "vitest";

const { avisar } = vi.hoisted(() => ({ avisar: vi.fn() }));
vi.mock("sonner", () => ({ toast: { warning: avisar } }));

import { colocarReguaDaFicha } from "@/lib/mestre/regua-actions";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { CanvasItem, Scene } from "@/types/scene";

/** Um token de 80 de lado, com o centro em `(cx, cy)`. */
function token(id: string, cx: number, cy: number, personagemId?: string): CanvasItem {
  return {
    id,
    assetId: "a",
    x: cx - 40,
    y: cy - 40,
    width: 80,
    height: 80,
    rotation: 0,
    z: 1,
    ...(personagemId && { personagemId }),
  } as CanvasItem;
}

function montar(cena: Partial<Scene>) {
  useSceneStore.setState({
    board: {
      scenes: [{ id: "c1", items: [], fog: [], grid: { size: 50, offsetX: 0, offsetY: 0, opacity: 1 }, ...cena } as unknown as Scene],
      editingSceneId: "c1",
      liveSceneId: "c1",
    },
    status: "ready",
  } as never);
}

function medidores() {
  return useSceneStore.getState().board!.scenes[0]!.medidores ?? [];
}

afterEach(() => {
  useSceneStore.setState({ board: null, status: "idle" } as never);
  useSelectionStore.getState().clear();
  avisar.mockClear();
});

describe("a régua da ficha no mapa", () => {
  it("a reta nasce no token de quem é a ficha, para a direita, selecionada e com a medida travada", () => {
    montar({ items: [token("t1", 200, 300, "dante")] });
    useToolStore.getState().setMedidor({ corMedidor: "#ff0000" });

    expect(colocarReguaDaFicha({ forma: "linha", metros: 9 }, "dante")).toBe(true);

    const [regua] = medidores();
    // Nove metros são nove quadrados de 50.
    expect(regua).toMatchObject({ forma: "linha", cor: "#ff0000", x: 200, y: 300, x2: 650, y2: 300, travada: true });
    expect(useSelectionStore.getState().selectedMedidorId).toBe(regua!.id);
  });

  it("o círculo tem o número no raio", () => {
    montar({ items: [token("t1", 200, 300, "dante")] });

    colocarReguaDaFicha({ forma: "circulo", metros: 1.5 }, "dante");

    expect(medidores()[0]).toMatchObject({ forma: "circulo", x: 200, y: 300, x2: 275, y2: 300 });
  });

  it("com dois tokens do personagem, sai do que está na mão", () => {
    montar({ items: [token("t1", 200, 300, "dante"), token("t2", 800, 100, "dante")] });
    useSelectionStore.getState().select(["t2"]);

    colocarReguaDaFicha({ forma: "linha", metros: 2 }, "dante");

    expect(medidores()[0]).toMatchObject({ x: 800, y: 100 });
  });

  it("sem token na cena, nasce no centro do que o mestre enquadra", () => {
    montar({ items: [token("t1", 200, 300, "outro")] });
    useViewportStore.setState({ viewport: { x: 1000, y: 400, width: 600, height: 200 } });

    colocarReguaDaFicha({ forma: "linha", metros: 1 }, "dante");
    colocarReguaDaFicha({ forma: "linha", metros: 1 });

    expect(medidores()).toHaveLength(1);
    expect(medidores()[0]).toMatchObject({ x: 1300, y: 500, x2: 1350, y2: 500 });
  });

  it("o mesmo clique não empilha outra régua igual por cima", () => {
    montar({ items: [token("t1", 200, 300, "dante")] });

    colocarReguaDaFicha({ forma: "linha", metros: 9 }, "dante");
    useSelectionStore.getState().clear();
    colocarReguaDaFicha({ forma: "linha", metros: 9 }, "dante");

    expect(medidores()).toHaveLength(1);
    expect(useSelectionStore.getState().selectedMedidorId).toBe(medidores()[0]!.id);

    colocarReguaDaFicha({ forma: "circulo", metros: 9 }, "dante");
    expect(medidores()).toHaveLength(2);
  });

  it("sem grade, ou fora do mapa, não mede e avisa", () => {
    montar({ grid: undefined, items: [token("t1", 200, 300, "dante")] });
    expect(colocarReguaDaFicha({ forma: "linha", metros: 9 }, "dante")).toBe(false);

    montar({ tipo: "quadro" } as Partial<Scene>);
    expect(colocarReguaDaFicha({ forma: "linha", metros: 9 }, "dante")).toBe(false);

    expect(medidores()).toHaveLength(0);
    expect(avisar).toHaveBeenCalledTimes(2);
  });
});
