import { describe, expect, it } from "vitest";

import { topicosAchados } from "@/lib/mestre/topicos-da-campanha";

describe("topicosAchados", () => {
  it("termo vazio acha todos, na ordem da barra", () => {
    expect(topicosAchados("  ", {})).toEqual([
      "quadro",
      "medidores",
      "efeitos",
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

  it("o canto arredondado se acha pela palavra de quem procura", () => {
    expect(topicosAchados("borda", {})).toEqual(["quadro"]);
  });

  it("nada bate, nada volta", () => {
    expect(topicosAchados("xyzzy", {})).toEqual([]);
  });
});
