import { describe, expect, it } from "vitest";

import {
  escopoPadrao,
  escoposDe,
  linhaDoErro,
  resolver,
  valido,
  type Definicao,
} from "./valor";

const base = { titulo: "X", dono: "plug", escopo: "ambos" as const };

describe("valido", () => {
  it("exige o tipo declarado", () => {
    const booleano: Definicao = { ...base, chave: "plug.b", tipo: "booleano", padrao: true };
    const texto: Definicao = { ...base, chave: "plug.t", tipo: "texto", padrao: "" };

    expect(valido(booleano, false)).toBe(true);
    expect(valido(booleano, "true")).toBe(false);
    expect(valido(texto, "oi")).toBe(true);
    expect(valido(texto, 1)).toBe(false);
  });

  it("a escolha só aceita o que está nas opções", () => {
    const escolha: Definicao = {
      ...base,
      chave: "plug.e",
      tipo: "escolha",
      padrao: "a",
      opcoes: ["a", "b"],
    };

    expect(valido(escolha, "b")).toBe(true);
    expect(valido(escolha, "c")).toBe(false);
  });

  it("o número respeita o intervalo e recusa o que não é finito", () => {
    const numero: Definicao = {
      ...base,
      chave: "plug.n",
      tipo: "numero",
      padrao: 5,
      minimo: 0,
      maximo: 10,
    };

    expect(valido(numero, 0)).toBe(true);
    expect(valido(numero, 10)).toBe(true);
    expect(valido(numero, 11)).toBe(false);
    expect(valido(numero, -1)).toBe(false);
    expect(valido(numero, Number.NaN)).toBe(false);
    expect(valido(numero, "5")).toBe(false);
  });
});

describe("resolver", () => {
  const def: Definicao = { ...base, chave: "plug.n", tipo: "numero", padrao: 1 };

  it("a campanha vence a máquina, e a máquina vence o padrão", () => {
    expect(resolver(def, { maquina: {}, campanha: {} })).toEqual({
      valor: 1,
      origem: "padrao",
    });
    expect(resolver(def, { maquina: { "plug.n": 2 }, campanha: {} })).toEqual({
      valor: 2,
      origem: "maquina",
    });
    expect(
      resolver(def, { maquina: { "plug.n": 2 }, campanha: { "plug.n": 3 } }),
    ).toEqual({ valor: 3, origem: "campanha" });
  });

  it("um valor gravado inválido é pulado, não devolvido", () => {
    // Editado à mão, ou gravado por uma versão que aceitava outro tipo. A
    // tela tem de abrir de todo jeito, e o próximo escopo válido vale.
    expect(
      resolver(def, { maquina: { "plug.n": 2 }, campanha: { "plug.n": "três" } }),
    ).toEqual({ valor: 2, origem: "maquina" });
  });

  it("configuração só da máquina ignora o que a campanha diz", () => {
    const daMaquina: Definicao = { ...def, escopo: "maquina" };

    expect(
      resolver(daMaquina, { maquina: {}, campanha: { "plug.n": 3 } }),
    ).toEqual({ valor: 1, origem: "padrao" });
    expect(escoposDe(daMaquina)).toEqual(["maquina"]);
  });

  it("o escopo padrão de gravação é o mais largo", () => {
    expect(escopoPadrao(def)).toBe("maquina");
    expect(escopoPadrao({ ...def, escopo: "campanha" })).toBe("campanha");
    expect(escoposDe(def)).toEqual(["campanha", "maquina"]);
  });
});

describe("linhaDoErro", () => {
  it("conta a linha a partir da posição, quando o motor a dá", () => {
    const texto = '{\n  "a": 1,\n  "b": \n}';
    expect(linhaDoErro(texto, new Error("Unexpected token } in JSON at position 20"))).toBe(4);
  });

  it("prefere a linha dita pelo motor", () => {
    expect(linhaDoErro("", new Error("Expected ',' (line 7 column 2)"))).toBe(7);
  });

  it("devolve null quando não há como saber", () => {
    expect(linhaDoErro("{", new Error("JSON Parse error: Unexpected EOF"))).toBeNull();
  });
});
