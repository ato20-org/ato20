import { describe, expect, it } from "vitest";

import { cloneScene, createScene, type CanvasItem, type Scene } from "@/types/scene";

describe("cloneScene", () => {
  it("a câmera que segue um item passa a seguir a cópia dele", () => {
    const item = { id: "i1", x: 0, y: 0 } as unknown as CanvasItem;
    const cena: Scene = {
      ...createScene("Igreja"),
      items: [item],
      cameras: [
        { id: "c1", nome: "Segue", viewport: { x: 0, y: 0, width: 1920, height: 1080 }, alvoIds: ["i1", "sumiu"] },
        { id: "c2", nome: "Fixa", viewport: { x: 0, y: 0, width: 1920, height: 1080 } },
      ],
    } as Scene;

    const copia = cloneScene(cena, "Igreja (2)");
    const novoItem = copia.items[0].id;

    expect(novoItem).not.toBe("i1");
    expect(copia.cameras?.[0].alvoIds).toEqual([novoItem, "sumiu"]);
    expect(copia.cameras?.[1].alvoIds).toBeUndefined();
  });

  it("não leva a marca de capa", () => {
    const capa = { ...createScene("Taverna", "fundo"), capa: true } as Scene;

    expect(cloneScene(capa, "Taverna (2)").capa).toBeUndefined();
  });
});
