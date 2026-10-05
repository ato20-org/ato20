import { describe, expect, it } from "vitest";

import { topicosAchados } from "@/lib/mestre/topicos-da-campanha";

describe("topicosAchados", () => {
  it("termo vazio acha todos, na ordem da barra", () => {
    expect(topicosAchados("  ", {})).toEqual([
      "quadro",
      "medidores",
      "condicoes",
      "efeitos",
      "layout",
      "posicao",
      "ajustes",
    ]);
  });

  it("acha os efeitos pelo que se procura neles, e pelo nome do que se criou", () => {
    expect(topicosAchados("fagulha", {})).toContain("efeitos");
    expect(topicosAchados("brasa azul", { efeitos: ["Brasa azul"] })).toEqual(["efeitos"]);
  });

  it("acha pelo título sem ligar para acento nem caixa", () => {
    expect(topicosAchados("CONDICOES", {})).toEqual(["condicoes"]);
  });

  it("acha pela palavra de quem não sabe o nome do tópico", () => {
    expect(topicosAchados("vida", {})).toEqual(["medidores"]);
  });

  it("acha pelo que o mestre criou dentro do tópico", () => {
    expect(
      topicosAchados("envenen", { condicoes: ["Envenenado", "Caído"] }),
    ).toEqual(["condicoes"]);
  });

  it("um termo pode achar mais de um tópico", () => {
    expect(topicosAchados("retrato", {})).toEqual(["layout", "posicao"]);
  });

  it("o plugin se acha pelo nome do tópico que o guarda", () => {
    expect(topicosAchados("plugin", {})).toEqual(["ajustes"]);
  });

  it("o canto arredondado se acha pela palavra de quem procura", () => {
    expect(topicosAchados("borda", {})).toEqual(["quadro"]);
  });

  it("nada bate, nada volta", () => {
    expect(topicosAchados("xyzzy", {})).toEqual([]);
  });
});
