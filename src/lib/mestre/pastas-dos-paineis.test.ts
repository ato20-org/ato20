import { afterEach, describe, expect, it } from "vitest";

import { useSceneStore } from "@/lib/store/use-scene-store";
import { aceita } from "@/lib/store/use-token-drag-store";
import { createScene, type Pasta } from "@/types/scene";

function montar(pastas: Pasta[] = []) {
  useSceneStore.setState({
    board: {
      scenes: [{ ...createScene("Porão"), id: "m1" }],
      editingSceneId: "m1",
      liveSceneId: null,
      pastas: pastas.length > 0 ? pastas : undefined,
    },
    status: "ready",
  } as never);
}

const store = () => useSceneStore.getState();
const pastas = () => store().board!.pastas ?? [];
const pasta = (id: string) => pastas().find((atual) => atual.id === id);

afterEach(() => {
  useSceneStore.setState({ board: null, status: "idle" } as never);
});

describe("criarPasta", () => {
  it("guarda a lista do painel", () => {
    montar();
    const id = store().criarPasta("Masmorras", undefined, "mapas");

    expect(pasta(id)?.lista).toBe("mapas");
  });

  it("sem lista é do Arquivos, como a pasta gravada antes", () => {
    montar();
    const id = store().criarPasta("Notas");

    expect(pasta(id)).not.toHaveProperty("lista");
  });

  it("a subpasta herda a lista da mãe", () => {
    montar([{ id: "m", nome: "Capítulo 1", lista: "mapas" }]);
    const id = store().criarPasta("Cidade", "m", "fundos");

    expect(pasta(id)?.lista).toBe("mapas");
  });
});

describe("moverPasta", () => {
  it("recusa mãe de outra lista", () => {
    montar([
      { id: "m", nome: "Mapas", lista: "mapas" },
      { id: "f", nome: "Fundos", lista: "fundos" },
    ]);
    store().moverPasta("m", "f");

    expect(pasta("m")?.parentId).toBeUndefined();
  });
});

describe("moverPersonagemParaPasta", () => {
  it("põe e tira, e a pasta vazia perde o campo", () => {
    montar([
      { id: "a", nome: "Taverna", lista: "npcs" },
      { id: "b", nome: "Vilões", lista: "npcs" },
    ]);

    store().moverPersonagemParaPasta("goblin", "npcs", "a");
    expect(pasta("a")?.membros).toEqual(["goblin"]);

    store().moverPersonagemParaPasta("goblin", "npcs", "b");
    expect(pasta("a")).not.toHaveProperty("membros");
    expect(pasta("b")?.membros).toEqual(["goblin"]);

    store().moverPersonagemParaPasta("goblin", "npcs", undefined);
    expect(pasta("b")).not.toHaveProperty("membros");
  });

  it("não mexe na pasta da outra seção", () => {
    montar([
      { id: "n", nome: "Taverna", lista: "npcs", membros: ["edgar"] },
      { id: "p", nome: "Grupo", lista: "players" },
    ]);

    store().moverPersonagemParaPasta("edgar", "players", "p");

    expect(pasta("n")?.membros).toEqual(["edgar"]);
    expect(pasta("p")?.membros).toEqual(["edgar"]);
  });

  it("recusa pasta de outra lista", () => {
    montar([{ id: "m", nome: "Masmorras", lista: "mapas" }]);
    store().moverPersonagemParaPasta("goblin", "npcs", "m");

    expect(pasta("m")).not.toHaveProperty("membros");
  });
});

describe("removerPasta", () => {
  it("os membros sobem para a mãe", () => {
    montar([
      { id: "mae", nome: "Cidade", lista: "npcs", membros: ["guarda"] },
      { id: "filha", nome: "Taverna", lista: "npcs", parentId: "mae", membros: ["dono"] },
    ]);
    store().removerPasta("filha");

    expect(pasta("filha")).toBeUndefined();
    expect(pasta("mae")?.membros).toEqual(["guarda", "dono"]);
  });

  it("a cena da pasta desfeita sobe junto", () => {
    montar([{ id: "m", nome: "Masmorras", lista: "mapas" }]);
    store().moverParaPasta("m1", "m");
    store().removerPasta("m");

    expect(store().board!.scenes[0]!.pastaId).toBeUndefined();
  });
});

describe("o arrasto até a pasta", () => {
  it("a cena entra só na pasta da mesma aba", () => {
    const mapa = { tipo: "cena", sceneId: "m1", nome: "Porão", lista: "mapas" } as const;

    expect(aceita(mapa, { tipo: "pasta-cenas", lista: "mapas", pastaId: "p" })).toBe(true);
    expect(aceita(mapa, { tipo: "pasta-cenas", lista: "fundos", pastaId: "p" })).toBe(false);
  });

  it("o personagem entra só na pasta da seção dele", () => {
    const npc = { tipo: "personagem", personagemId: "g", assetId: "", secao: "npcs" } as const;

    expect(aceita(npc, { tipo: "pasta-personagens", lista: "npcs", pastaId: undefined })).toBe(
      true,
    );
    expect(aceita(npc, { tipo: "pasta-personagens", lista: "players", pastaId: "p" })).toBe(
      false,
    );
  });

  it("sem miniatura, o personagem não cai no palco", () => {
    const semPeca = { tipo: "personagem", personagemId: "g", assetId: "" } as const;
    const comPeca = { tipo: "personagem", personagemId: "g", assetId: "a1" } as const;

    expect(aceita(semPeca, { tipo: "palco" })).toBe(false);
    expect(aceita(comPeca, { tipo: "palco" })).toBe(true);
  });
});
