import { describe, expect, it } from "vitest";

import type { Medidor } from "@/types/character";
import { SCENE_HEIGHT, SCENE_WIDTH, type CanvasItem } from "@/types/scene";

import { fichasDaCena, LARGURA_DA_INFO, lugarDaInfo } from "./fichas-da-cena";

function item(extra: Partial<CanvasItem> = {}): CanvasItem {
  return {
    id: "i1",
    assetId: "a1",
    x: 900,
    y: 500,
    width: 100,
    height: 100,
    z: 1,
    ...extra,
  } as CanvasItem;
}

function medidor(id: string, escondido = false): Medidor {
  return {
    id,
    nome: "Vida",
    cor: "#ef4444",
    estilo: "barra",
    atual: 7,
    maximo: 10,
    escondido,
  };
}

const ELENCO = [
  { id: "p1", nome: "Edgar", medidores: [medidor("m1"), medidor("m2", true)] },
  { id: "p2", nome: "Mira", medidores: [] },
];

describe("fichasDaCena", () => {
  it("desligado, a lista sai VAZIA", () => {
    // O nome de um PNJ que o mestre não apresentou não pode atravessar a rede
    // por causa de um interruptor desligado na tela. Filtrar no desenho
    // deixaria o nome no JSON que o navegador guardou.
    const fichas = fichasDaCena(false, [item({ personagemId: "p1" })], ELENCO);

    expect(fichas).toEqual([]);
  });

  it("ligado, traz quem tem token na cena", () => {
    const fichas = fichasDaCena(true, [item({ personagemId: "p1" })], ELENCO);

    expect(fichas.map((ficha) => ficha.nome)).toEqual(["Edgar"]);
  });

  it("esconde os medidores escondidos por padrão", () => {
    const [ficha] = fichasDaCena(true, [item({ personagemId: "p1" })], ELENCO);

    expect(ficha?.medidores.map((m) => m.id)).toEqual(["m1"]);
  });

  it("o palco do Mestre pede os escondidos", () => {
    const [ficha] = fichasDaCena(
      true,
      [item({ personagemId: "p1" })],
      ELENCO,
      true,
    );

    expect(ficha?.medidores.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("dois tokens do mesmo personagem dão uma ficha só", () => {
    const fichas = fichasDaCena(
      true,
      [
        item({ id: "i1", personagemId: "p1" }),
        item({ id: "i2", personagemId: "p1" }),
      ],
      ELENCO,
    );

    expect(fichas).toHaveLength(1);
  });

  it("token sem personagem e personagem apagado ficam de fora", () => {
    const fichas = fichasDaCena(
      true,
      [item({ id: "i1" }), item({ id: "i2", personagemId: "sumiu" })],
      ELENCO,
    );

    expect(fichas).toEqual([]);
  });
});

describe("lugarDaInfo", () => {
  it("fica acima do token e centrada nele", () => {
    const peca = item();
    const { x, y, largura } = lugarDaInfo(peca, 60);

    expect(largura).toBeCloseTo(100 * LARGURA_DA_INFO);
    expect(x + largura / 2).toBeCloseTo(peca.x + peca.width / 2);
    expect(y + 60).toBeLessThan(peca.y);
  });

  it("token no topo do mapa não joga a caixa para fora do plano", () => {
    // É o caso COMUM, não a exceção: a fila de inimigos entra pela borda de
    // cima. E filho que transborda a caixa de um plano derruba o palco no
    // WebKitGTK -- ver o cabeçalho de `lugarDaInfo`.
    const { y } = lugarDaInfo(item({ y: 5 }), 60);

    expect(y).toBeGreaterThanOrEqual(0);
  });

  it("token na borda esquerda não sai pela esquerda", () => {
    const { x } = lugarDaInfo(item({ x: 0 }), 60);

    expect(x).toBeGreaterThanOrEqual(0);
  });

  it("token na borda direita não sai pela direita", () => {
    const peca = item({ x: SCENE_WIDTH - 100 });
    const { x, largura } = lugarDaInfo(peca, 60);

    expect(x + largura).toBeLessThanOrEqual(SCENE_WIDTH);
  });

  it("caixa mais alta que o plano encosta no topo em vez de espalhar NaN", () => {
    const { y } = lugarDaInfo(item(), SCENE_HEIGHT * 2);

    expect(y).toBe(0);
  });
});
