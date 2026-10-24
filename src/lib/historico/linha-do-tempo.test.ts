import { describe, expect, it } from "vitest";

import type { LinhaDoFio } from "@/types/fio";
import type { RegistroDoHistorico } from "@/types/historico";

import {
  emSessoes,
  filtrar,
  linhaDoTempo,
  PAUSA_ENTRE_SESSOES,
  resolver,
  type Entrada,
} from "./linha-do-tempo";

const marco = (id: string, quando: number, texto: string): RegistroDoHistorico => ({
  tipo: "marco",
  id,
  quando,
  texto,
});

const vida = (id: string, quando: number, personagemId = "e"): RegistroDoHistorico => ({
  tipo: "medidor",
  id,
  quando,
  personagemId,
  personagem: "Edgar",
  medidor: "Vida",
  cor: "#f00",
  antes: 10,
  depois: 4,
  maximo: 20,
});

const fala = (id: string, quando: number, texto: string): LinhaDoFio => ({
  id,
  quando,
  autor: { tipo: "mestre" },
  texto,
});

const ids = (entradas: readonly Entrada[]) => entradas.map((entrada) => entrada.id);

describe("resolver", () => {
  it("aplica a última edição e tira o apagado, sem mover o marco de hora", () => {
    const resolvidos = resolver([
      marco("a", 10, "Chegaram"),
      marco("b", 20, "Errado"),
      { tipo: "editado", id: "e1", quando: 30, alvo: "a", texto: "Chegaram a Valkaria" },
      { tipo: "editado", id: "e2", quando: 40, alvo: "a", texto: "Chegaram a Valkaria, à noite" },
      { tipo: "apagado", id: "x", quando: 50, alvo: "b" },
    ]);

    expect(resolvidos).toEqual([
      {
        tipo: "marco",
        id: "a",
        quando: 10,
        texto: "Chegaram a Valkaria, à noite",
        editadoEm: 40,
      },
    ]);
  });
});

describe("linhaDoTempo", () => {
  it("intercala pela hora, e na mesma hora o acontecimento vem antes da fala", () => {
    const entradas = linhaDoTempo(
      [vida("golpe", 20), marco("m", 5, "Emboscada")],
      [fala("f1", 10, "rolem"), fala("f2", 20, "acertei!")],
    );

    expect(ids(entradas)).toEqual(["m", "f1", "golpe", "f2"]);
  });
});

describe("emSessoes", () => {
  it("corta na pausa longa, e não no intervalo da pizza", () => {
    const hora = 60 * 60 * 1000;
    const entradas = linhaDoTempo(
      [marco("a", 0, "1"), marco("b", 2 * hora, "2"), marco("c", 2 * hora + PAUSA_ENTRE_SESSOES, "3")],
      [],
    );

    const sessoes = emSessoes(entradas);
    expect(sessoes.map((sessao) => ids(sessao.entradas))).toEqual([["a", "b"], ["c"]]);
    expect(sessoes[0]).toMatchObject({ id: "a", inicio: 0, fim: 2 * hora });
  });
});

describe("filtrar", () => {
  const entradas = linhaDoTempo(
    [marco("m", 1, "Chegaram à vila"), vida("v1", 2), vida("v2", 3, "mira")],
    [fala("f", 4, "Olha a porta")],
  );
  const texto = (entrada: Entrada) =>
    entrada.tipo === "fio"
      ? (entrada.linha.texto ?? "")
      : entrada.registro.tipo === "marco"
        ? entrada.registro.texto
        : "Vida";

  it("pela categoria", () => {
    const so = filtrar(
      entradas,
      { categorias: new Set(["marcos", "chat"]), personagemId: null, busca: "" },
      texto,
    );
    expect(ids(so)).toEqual(["m", "f"]);
  });

  it("pelo personagem, pelo id", () => {
    const so = filtrar(entradas, { categorias: new Set(), personagemId: "mira", busca: "" }, texto);
    expect(ids(so)).toEqual(["v2"]);
  });

  it("pela frase, sem acento nem caixa", () => {
    const so = filtrar(entradas, { categorias: new Set(), personagemId: null, busca: "VILA" }, texto);
    expect(ids(so)).toEqual(["m"]);

    const comAcento = filtrar(
      entradas,
      { categorias: new Set(), personagemId: null, busca: "a vila" },
      () => "Chegaram à vila",
    );
    expect(comAcento).toHaveLength(entradas.length);
  });
});
