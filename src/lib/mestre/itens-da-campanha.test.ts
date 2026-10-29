import { afterEach, describe, expect, it } from "vitest";

import { cartaoDoItem } from "@/hooks/use-transmissao-do-item";
import { sceneForTable } from "@/lib/sync/for-table";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { aceita, type FonteDoArrasto } from "@/lib/store/use-token-drag-store";
import { medidoresDoItem } from "@/types/inventory";
import { cloneScene, createScene, type Pasta, type Scene } from "@/types/scene";

/**
 * O item da campanha do lado do board: o que o gesto aceita, e o que o store
 * guarda nos pontos, no handout, nas pastas e nas peças do mapa.
 *
 * O lado do disco -- catálogo, inventários, migração -- é do Rust, e os testes
 * dele moram em `vault::itens` e `vault::inventory`.
 */

function montar(cenas: Scene[], pastas: Pasta[] = []) {
  useSceneStore.setState({
    board: {
      scenes: cenas,
      editingSceneId: cenas[0]!.id,
      liveSceneId: null,
      pastas: pastas.length > 0 ? pastas : undefined,
    },
    status: "ready",
  } as never);
}

function cena(id: string, mexer: (scene: Scene) => void = () => {}): Scene {
  const scene = { ...createScene("Porão"), id };
  mexer(scene);
  return scene;
}

const store = () => useSceneStore.getState();
const daCena = (id: string) => store().board!.scenes.find((scene) => scene.id === id)!;

afterEach(() => {
  useSceneStore.setState({ board: null, status: "idle" } as never);
});

describe("aceita, com item da campanha na mão", () => {
  const doCatalogo: FonteDoArrasto = { tipo: "item", itemId: "espada", url: "blob:x" };
  const semImagem: FonteDoArrasto = { tipo: "item", itemId: "bilhete" };
  const daMochila: FonteDoArrasto = {
    tipo: "item",
    itemId: "espada",
    personagemId: "edgar",
    url: "blob:x",
  };

  it("o mapa só recebe o item que tem imagem: a peça é a imagem", () => {
    expect(aceita(doCatalogo, { tipo: "palco" })).toBe(true);
    expect(aceita(semImagem, { tipo: "palco" })).toBe(false);
  });

  it("o inventário e a linha do personagem recebem, menos o do próprio dono", () => {
    expect(aceita(doCatalogo, { tipo: "inventario", personagemId: "edgar" })).toBe(true);
    expect(aceita(semImagem, { tipo: "personagem", personagemId: "edgar" })).toBe(true);

    expect(aceita(daMochila, { tipo: "inventario", personagemId: "edgar" })).toBe(false);
    expect(aceita(daMochila, { tipo: "personagem", personagemId: "edgar" })).toBe(false);
    expect(aceita(daMochila, { tipo: "personagem", personagemId: "mira" })).toBe(true);
  });

  it("o ponto e o handout guardam o item, com imagem ou sem", () => {
    expect(aceita(semImagem, { tipo: "ponto", pinId: "p" })).toBe(true);
    expect(aceita(semImagem, { tipo: "handout" })).toBe(true);
  });

  it("a pasta de Itens só recebe o que veio do catálogo", () => {
    expect(aceita(doCatalogo, { tipo: "pasta-itens", pastaId: "a" })).toBe(true);
    expect(aceita(daMochila, { tipo: "pasta-itens", pastaId: "a" })).toBe(false);
  });

  it("nada mais recebe item na pasta de Itens", () => {
    expect(
      aceita({ tipo: "acervo", assetId: "a" }, { tipo: "pasta-itens", pastaId: undefined }),
    ).toBe(false);
    expect(
      aceita(
        { tipo: "personagem", personagemId: "edgar", assetId: "a" },
        { tipo: "personagem", personagemId: "mira" },
      ),
    ).toBe(false);
  });
});

describe("itens no ponto", () => {
  const comPonto = () =>
    cena("m1", (scene) => {
      scene.pins = [{ id: "p", x: 0, y: 0, title: "", note: "", attachments: [] }];
    });
  const ponto = () => daCena("m1").pins![0]!;

  it("prende sem repetir", () => {
    montar([comPonto()]);
    store().prenderItensNoPonto("m1", "p", ["baú", "chave"]);
    store().prenderItensNoPonto("m1", "p", ["chave"]);

    expect(ponto().itens).toEqual(["baú", "chave"]);
  });

  it("soltar o último tira o campo, como o ponto gravado antes dos itens", () => {
    montar([comPonto()]);
    store().prenderItensNoPonto("m1", "p", ["baú"]);
    store().soltarItemDoPonto("m1", "p", "baú");

    expect(ponto()).not.toHaveProperty("itens");
  });
});

describe("itens no handout", () => {
  it("guarda sem repetir, e o vazio volta a ser ausência", () => {
    montar([cena("m1")]);
    store().guardarItensNoHandout("m1", ["carta", "carta"]);
    expect(daCena("m1").handoutItens).toEqual(["carta"]);

    store().tirarItemDoHandout("m1", "carta");
    expect(daCena("m1").handoutItens).toBeUndefined();
  });

  it("nunca chega à mesa", () => {
    const scene = cena("m1", (s) => {
      s.handoutItens = ["carta"];
    });

    expect(sceneForTable(scene)).not.toHaveProperty("handoutItens");
  });

  it("vem junto ao duplicar a cena, apontando para o mesmo item", () => {
    const copia = cloneScene(
      cena("m1", (s) => {
        s.handoutItens = ["carta"];
      }),
      "Porão (cópia)",
    );

    expect(copia.handoutItens).toEqual(["carta"]);
  });
});

describe("moverItemParaPasta", () => {
  it("guarda o item em `membros`, e só nas pastas de Itens", () => {
    montar(
      [cena("m1")],
      [
        { id: "a", nome: "Armas", lista: "itens" },
        { id: "n", nome: "Vilões", lista: "npcs" },
      ],
    );

    store().moverItemParaPasta("espada", "n");
    expect(store().board!.pastas!.some((pasta) => pasta.membros?.length)).toBe(false);

    store().moverItemParaPasta("espada", "a");
    expect(store().board!.pastas!.find((pasta) => pasta.id === "a")?.membros).toEqual([
      "espada",
    ]);

    store().moverItemParaPasta("espada", undefined);
    expect(store().board!.pastas!.find((pasta) => pasta.id === "a")).not.toHaveProperty(
      "membros",
    );
  });
});

describe("moverNoCompendio", () => {
  it("cada aba do Compêndio guarda os seus, e a pasta de outra aba recusa", () => {
    montar(
      [cena("m1")],
      [
        { id: "c", nome: "Venenos", lista: "compendio-condicoes" },
        { id: "e", nome: "Chão", lista: "compendio-efeitos" },
        { id: "d", nome: "Magias", lista: "compendio-disparos" },
      ],
    );
    const membros = (id: string) =>
      store().board!.pastas!.find((pasta) => pasta.id === id)?.membros;

    // O disparo não entra na pasta dos efeitos de área.
    store().moverNoCompendio("bola", "compendio-disparos", "e");
    expect(membros("e")).toBeUndefined();

    store().moverNoCompendio("bola", "compendio-disparos", "d");
    store().moverNoCompendio("envenenado", "compendio-condicoes", "c");
    expect(membros("d")).toEqual(["bola"]);
    expect(membros("c")).toEqual(["envenenado"]);

    store().moverNoCompendio("bola", "compendio-disparos", undefined);
    expect(membros("d")).toBeUndefined();
  });
});

describe("trocarImagemDoItem", () => {
  it("troca a imagem das peças do item em todas as cenas, e só delas", () => {
    const peca = (id: string, extra: object) => ({
      id,
      assetId: "velha",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 0,
      z: 1,
      locked: false,
      ...extra,
    });

    montar([
      cena("m1", (s) => {
        s.items = [peca("a", { itemId: "baú" }), peca("b", {})];
      }),
      cena("m2", (s) => {
        s.items = [peca("c", { itemId: "baú" })];
      }),
    ]);

    store().trocarImagemDoItem("baú", "nova");

    expect(daCena("m1").items.map((item) => item.assetId)).toEqual(["nova", "velha"]);
    expect(daCena("m2").items[0]!.assetId).toBe("nova");
  });
});

describe("esquecerItem", () => {
  it("tira o item dos pontos, do handout e das pastas, e a peça vira imagem", () => {
    montar(
      [
        cena("m1", (s) => {
          s.items = [
            {
              id: "a",
              assetId: "img",
              itemId: "baú",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              rotation: 0,
              z: 1,
              locked: false,
            },
          ];
          s.pins = [
            { id: "p", x: 0, y: 0, title: "", note: "", attachments: [], itens: ["baú"] },
          ];
          s.handoutItens = ["baú", "carta"];
        }),
      ],
      [{ id: "f", nome: "Tesouros", lista: "itens", membros: ["baú"] }],
    );

    store().esquecerItem("baú");

    const scene = daCena("m1");
    // A peça fica, com a imagem: apagar o catálogo não é mexer no mapa.
    expect(scene.items[0]).toMatchObject({ id: "a", assetId: "img" });
    expect(scene.items[0]).not.toHaveProperty("itemId");
    expect(scene.pins![0]).not.toHaveProperty("itens");
    expect(scene.handoutItens).toEqual(["carta"]);
    expect(store().board!.pastas![0]).not.toHaveProperty("membros");
  });

  it("item que nada cita não grava passo nenhum", () => {
    montar([cena("m1")]);
    const antes = store().board;

    store().esquecerItem("ninguém");

    expect(store().board).toBe(antes);
  });
});

describe("medidores do item", () => {
  const varinha = {
    id: "varinha",
    nome: "Varinha",
    descricao: "",
    autor: "mestre" as const,
    criadoEm: 1,
    medidores: [
      {
        id: "cargas",
        nome: "Cargas",
        cor: "#f00",
        estilo: "pontos" as const,
        maximo: 5,
        escondido: false,
      },
      {
        id: "maldicao",
        nome: "Maldição",
        cor: "#000",
        estilo: "barra" as const,
        maximo: 3,
        escondido: true,
      },
    ],
    atributos: [
      { id: "a", nome: "Dano", valor: "1d4 fogo" },
      { id: "b", nome: "Preço", valor: "segredo", escondido: true },
    ],
  };

  it("fora de mochila, cheios: é o item como a campanha o define", () => {
    expect(medidoresDoItem(varinha).map((medidor) => medidor.atual)).toEqual([5, 3]);
  });

  it("na mochila, o valor dela, preso entre zero e o máximo", () => {
    expect(
      medidoresDoItem(varinha, { cargas: 2, maldicao: 9 }).map((medidor) => medidor.atual),
    ).toEqual([2, 3]);
  });

  it("o cartão da mesa vai sem o que o jogador não vê", () => {
    const cartao = cartaoDoItem(varinha, { cargas: 2 });

    expect(cartao.atributos).toEqual([{ nome: "Dano", valor: "1d4 fogo" }]);
    expect(cartao.medidores?.map((medidor) => [medidor.id, medidor.atual])).toEqual([
      ["cargas", 2],
    ]);
  });

  it("item sem atributo nem medidor manda só nome e descrição", () => {
    const cartao = cartaoDoItem({ ...varinha, medidores: [], atributos: [] });

    expect(cartao).toEqual({ nome: "Varinha", descricao: "" });
  });
});
