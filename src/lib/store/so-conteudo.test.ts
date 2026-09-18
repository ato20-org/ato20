import { describe, expect, it } from "vitest";

import { soConteudo } from "@/lib/store/use-scene-store";
import type { Board, Scene } from "@/types/scene";

const cena = (id: string, name: string, itens: number, pastaId?: string): Scene =>
  ({
    id,
    name,
    pastaId,
    items: Array.from({ length: itens }, (_, i) => ({ id: `${id}-${i}` })),
    fog: [],
  }) as unknown as Scene;

describe("soConteudo", () => {
  it("restaura o conteúdo das cenas, mas nunca o conjunto delas", () => {
    const passo: Board = {
      scenes: [cena("a", "A velha", 1)],
      editingSceneId: "a",
      liveSceneId: null,
      notas: [{ id: "n1", titulo: "velha", arquivo: "x.md" }],
    };
    const agora: Board = {
      scenes: [cena("a", "A nova", 3, "p1"), cena("b", "B", 2)],
      editingSceneId: "b",
      liveSceneId: "b",
      pastas: [{ id: "p1", nome: "P" }],
      notas: [{ id: "n2", titulo: "nova", arquivo: "y.md" }],
    };

    const volta = soConteudo(agora, passo);

    // Conteúdo de A volta ao passo; nome e pasta ficam os de agora.
    expect(volta.scenes[0]!.items).toHaveLength(1);
    expect(volta.scenes[0]!.name).toBe("A nova");
    expect(volta.scenes[0]!.pastaId).toBe("p1");
    // B nasceu depois do passo: continua existindo, intocada.
    expect(volta.scenes[1]).toBe(agora.scenes[1]);
    // Estrutura é a de agora.
    expect(volta.notas).toBe(agora.notas);
    expect(volta.pastas).toBe(agora.pastas);
    expect(volta.editingSceneId).toBe("b");
    expect(volta.liveSceneId).toBe("b");
  });
});
