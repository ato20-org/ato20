import { describe, expect, it } from "vitest";

import { decidir, doSistema, normalizar, resolverEscolha, telaDe } from "@/lib/i18n/idioma";

describe("normalizar", () => {
  it("aceita as variantes de cada idioma", () => {
    expect(normalizar("pt")).toBe("pt-BR");
    expect(normalizar("pt-PT")).toBe("pt-BR");
    expect(normalizar("PT-br")).toBe("pt-BR");
    expect(normalizar("en-GB")).toBe("en");
  });

  it("recusa o que não fala", () => {
    expect(normalizar("es")).toBeNull();
    expect(normalizar("")).toBeNull();
    expect(normalizar(null)).toBeNull();
    expect(normalizar(42)).toBeNull();
  });
});

describe("doSistema", () => {
  it("o primeiro da lista que o aplicativo fala", () => {
    expect(doSistema(["es-ES", "pt-BR", "en"])).toBe("pt-BR");
  });

  it("inglês quando ninguém da lista é falado", () => {
    expect(doSistema(["de-DE", "fr"])).toBe("en");
    expect(doSistema([])).toBe("en");
  });
});

describe("resolverEscolha", () => {
  it("sistema pergunta ao sistema", () => {
    expect(resolverEscolha("sistema", ["en-US"])).toBe("en");
    expect(resolverEscolha("pt-BR", ["en-US"])).toBe("pt-BR");
  });
});

describe("telaDe", () => {
  it("pelo caminho", () => {
    expect(telaDe("/jogador")).toBe("jogador");
    expect(telaDe("/jogador.html")).toBe("jogador");
    expect(telaDe("/espectador/")).toBe("espectador");
    expect(telaDe("/")).toBe("mestre");
    expect(telaDe("/kit/dados")).toBe("mestre");
  });
});

describe("decidir", () => {
  const sistemaEn = ["en-US"];

  it("espectador: a URL sempre vence", () => {
    expect(decidir({ tela: "espectador", daUrl: "pt-BR", salvo: "en", linguas: sistemaEn })).toBe("pt-BR");
    expect(decidir({ tela: "espectador", daUrl: null, salvo: "pt-BR", linguas: sistemaEn })).toBe("en");
  });

  it("jogador: a escolha do celular vence a URL do convite", () => {
    expect(decidir({ tela: "jogador", daUrl: "pt-BR", salvo: "en", linguas: [] })).toBe("en");
    expect(decidir({ tela: "jogador", daUrl: "pt-BR", salvo: null, linguas: sistemaEn })).toBe("pt-BR");
    expect(decidir({ tela: "jogador", daUrl: null, salvo: null, linguas: sistemaEn })).toBe("en");
  });

  it("mestre: o espelho, e o sistema sem ele", () => {
    expect(decidir({ tela: "mestre", daUrl: "en", salvo: "pt-BR", linguas: sistemaEn })).toBe("pt-BR");
    expect(decidir({ tela: "mestre", daUrl: null, salvo: "sistema", linguas: sistemaEn })).toBe("en");
    expect(decidir({ tela: "mestre", daUrl: null, salvo: "lixo", linguas: ["pt-BR"] })).toBe("pt-BR");
  });
});
