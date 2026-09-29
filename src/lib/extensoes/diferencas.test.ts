import { describe, expect, it } from "vitest";

import type { Condicao, Medidor, Personagem } from "@/types/character";

import { diferencasDeCondicoes, diferencasDeMedidores } from "./diferencas";

const medidor = (id: string, atual: number): Medidor => ({
  id,
  nome: "Vida",
  cor: "#f00",
  estilo: "barra",
  atual,
  maximo: 10,
  escondido: false,
});

const condicao = (id: string): Condicao => ({
  id,
  nome: "Envenenado",
  cor: "#0f0",
  icone: "veneno",
  escondido: false,
});

const personagem = (id: string, medidores: Medidor[], condicoes: Condicao[] = []): Personagem => ({
  id,
  nome: id,
  criadoEm: 0,
  medidores,
  condicoes,
});

describe("diferencasDeMedidores", () => {
  it("a primeira leitura não é mudança", () => {
    expect(diferencasDeMedidores(null, [personagem("p", [medidor("m", 5)])])).toEqual([]);
  });

  it("só o medidor que mudou, com o de antes ao lado", () => {
    const antes = [personagem("p", [medidor("m", 10), medidor("n", 3)])];
    const depois = [personagem("p", [medidor("m", 7), medidor("n", 3)])];

    expect(diferencasDeMedidores(antes, depois)).toEqual([
      { personagemId: "p", medidor: medidor("m", 7), antes: medidor("m", 10) },
    ]);
  });

  it("medidor novo chega com `antes` nulo", () => {
    const antes = [personagem("p", [])];
    const depois = [personagem("p", [medidor("m", 4)])];

    expect(diferencasDeMedidores(antes, depois)).toEqual([
      { personagemId: "p", medidor: medidor("m", 4), antes: null },
    ]);
  });
});

describe("diferencasDeCondicoes", () => {
  it("diz o que entrou e o que saiu", () => {
    const antes = [personagem("p", [], [condicao("a")])];
    const depois = [personagem("p", [], [condicao("b")])];

    expect(diferencasDeCondicoes(antes, depois)).toEqual([
      { personagemId: "p", condicao: condicao("b"), ligada: true },
      { personagemId: "p", condicao: condicao("a"), ligada: false },
    ]);
  });

  it("nada mudou, nada sai", () => {
    const lista = [personagem("p", [medidor("m", 1)], [condicao("a")])];

    expect(diferencasDeCondicoes(lista, lista)).toEqual([]);
    expect(diferencasDeMedidores(lista, lista)).toEqual([]);
  });
});
