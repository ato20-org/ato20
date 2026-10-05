import { beforeEach, describe, expect, it } from "vitest";

import {
  alternarCondicaoNosObjetos,
  criarCondicaoNoObjeto,
  editarCondicaoDoObjeto,
  removerCondicaoDoObjeto,
  reordenarCondicoesDoObjeto,
} from "@/lib/mestre/condicoes-do-objeto";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { MAX_CONDICOES, type Condicao } from "@/types/character";
import type { CanvasItem, Scene } from "@/types/scene";

const item = (id: string, extra: Partial<CanvasItem> = {}) =>
  ({ id, assetId: "a", x: 0, y: 0, width: 80, height: 80, rotation: 0, z: 1, ...extra }) as CanvasItem;

const emChamas: Condicao = {
  id: "modelo-fogo",
  nome: "Em chamas",
  cor: "#f59e0b",
  icone: "chama",
  efeito: "aura",
  escondido: false,
};

function montar(items: CanvasItem[]) {
  useSceneStore.setState({
    board: {
      scenes: [{ id: "c1", items, fog: [] } as unknown as Scene],
      editingSceneId: "c1",
      liveSceneId: "c1",
    },
    status: "ready",
  } as never);
}

function itemAtual(id: string): CanvasItem {
  return useSceneStore.getState().board!.scenes[0]!.items.find((cada) => cada.id === id)!;
}

describe("as condições do objeto", () => {
  beforeEach(() => montar([item("barril"), item("porta"), item("goblin", { personagemId: "p1" })]));

  it("marca nos objetos da seleção com id próprio, e não no token", () => {
    // O token leva as do personagem, pelo Rust: aqui ele fica de fora.
    const mudaram = alternarCondicaoNosObjetos(["barril", "porta", "goblin"], emChamas, true);

    expect(mudaram).toBe(2);
    expect(itemAtual("barril").condicoes?.[0]?.nome).toBe("Em chamas");
    expect(itemAtual("barril").condicoes?.[0]?.id).not.toBe(emChamas.id);
    expect(itemAtual("goblin").condicoes).toBeUndefined();
  });

  it("desmarca pelo nome, e a lista vazia vira campo ausente", () => {
    alternarCondicaoNosObjetos(["barril"], emChamas, true);
    alternarCondicaoNosObjetos(["barril"], { ...emChamas, nome: "  em CHAMAS " }, false);

    expect("condicoes" in itemAtual("barril") && itemAtual("barril").condicoes).toBeFalsy();
  });

  it("não passa do teto, e diz que nada mudou", () => {
    for (let n = 0; n < MAX_CONDICOES; n++) {
      expect(criarCondicaoNoObjeto("barril", { nome: `C${n}`, cor: "#fff", icone: "x" })).toBe(true);
    }

    expect(criarCondicaoNoObjeto("barril", { nome: "Mais", cor: "#fff", icone: "x" })).toBe(false);
    expect(alternarCondicaoNosObjetos(["barril"], emChamas, true)).toBe(0);
  });

  it("edita, esconde, reordena e apaga como a ficha", () => {
    criarCondicaoNoObjeto("barril", { nome: "Rachado", cor: "#fff", icone: "x" });
    alternarCondicaoNosObjetos(["barril"], emChamas, true);
    const [rachado, fogo] = itemAtual("barril").condicoes!;

    editarCondicaoDoObjeto("barril", rachado!.id, { escondido: true, efeito: "apagado" });
    expect(itemAtual("barril").condicoes![0]).toMatchObject({ escondido: true, efeito: "apagado" });

    editarCondicaoDoObjeto("barril", rachado!.id, { efeito: null, nome: "" });
    expect(itemAtual("barril").condicoes![0]!.efeito).toBeUndefined();
    expect(itemAtual("barril").condicoes![0]!.nome).toBe("Condição");

    reordenarCondicoesDoObjeto("barril", [fogo!.id]);
    expect(itemAtual("barril").condicoes!.map((c) => c.id)).toEqual([fogo!.id, rachado!.id]);

    removerCondicaoDoObjeto("barril", fogo!.id);
    expect(itemAtual("barril").condicoes!.map((c) => c.id)).toEqual([rachado!.id]);
  });

  it("cada gesto é um passo de desfazer", () => {
    alternarCondicaoNosObjetos(["barril", "porta"], emChamas, true);
    useSceneStore.getState().undo();

    expect(itemAtual("barril").condicoes).toBeUndefined();
    expect(itemAtual("porta").condicoes).toBeUndefined();
  });
});
