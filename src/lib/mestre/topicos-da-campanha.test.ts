import { describe, expect, it } from "vitest";

import { topicosAchados } from "@/lib/mestre/topicos-da-campanha";

describe("topicosAchados", () => {
  it("termo vazio acha todos, na ordem da barra", () => {
    expect(topicosAchados("  ", {})).toEqual([
      "medidores",
      "atributos",
      "efeitos",
      "espectador",
      "ajustes",
    ]);
  });

  it("quem procura o fogo acha os efeitos: o da condição e o da área moram lá", () => {
    expect(topicosAchados("fagulha", {})).toEqual(["efeitos"]);
    expect(topicosAchados("área", {})).toEqual(["efeitos"]);
  });

  it("acha pelo nome da aba sem ligar para acento nem caixa", () => {
    expect(topicosAchados("CONDICOES", {})).toEqual(["efeitos"]);
  });

  it("acha pela palavra de quem não sabe o nome do tópico", () => {
    expect(topicosAchados("vida", {})).toEqual(["medidores"]);
  });

  it("acha os atributos pela sigla que o mestre criou", () => {
    expect(topicosAchados("vig", { atributos: ["VIG"] })).toEqual(["atributos"]);
  });

  it("acha pelo que o mestre criou dentro do tópico", () => {
    expect(
      topicosAchados("envenen", { efeitos: ["Envenenado", "Caído"] }),
    ).toEqual(["efeitos"]);
  });

  it("um termo pode achar mais de um tópico", () => {
    expect(
      topicosAchados("fogo", { medidores: ["Fogo interior"] }),
    ).toEqual(["medidores", "efeitos"]);
  });

  it("o retrato não mora mais aqui: layout e posição são da janela Retratos", () => {
    expect(topicosAchados("retrato", {})).toEqual([]);
  });

  it("o plugin se acha pelo nome do tópico que o guarda", () => {
    expect(topicosAchados("plugin", {})).toEqual(["ajustes"]);
  });

  it("quem procura a TV ou o projetor acha a imagem do espectador", () => {
    expect(topicosAchados("projetor", {})).toEqual(["espectador"]);
    expect(topicosAchados("SÉPIA", {})).toEqual(["espectador"]);
  });

  it("o brilho mora nos dois: o da fagulha e o da TV", () => {
    expect(topicosAchados("brilho", {})).toEqual(["efeitos", "espectador"]);
  });

  it("nada bate, nada volta", () => {
    expect(topicosAchados("xyzzy", {})).toEqual([]);
  });
});
