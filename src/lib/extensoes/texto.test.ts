import { describe, expect, it } from "vitest";

import { resolverTexto } from "@/lib/extensoes/texto";

describe("resolverTexto", () => {
  it("string vale para todos os idiomas", () => {
    expect(resolverTexto("Iniciativa", "en")).toBe("Iniciativa");
  });

  it("a chave exata vence", () => {
    expect(resolverTexto({ "pt-BR": "Iniciativa", en: "Initiative" }, "en")).toBe("Initiative");
    expect(resolverTexto({ "pt-BR": "Iniciativa", en: "Initiative" }, "pt-BR")).toBe("Iniciativa");
  });

  it("aceita outra variante da mesma língua", () => {
    expect(resolverTexto({ pt: "Iniciativa", "en-US": "Initiative" }, "en")).toBe("Initiative");
    expect(resolverTexto({ pt: "Iniciativa", "en-US": "Initiative" }, "pt-BR")).toBe("Iniciativa");
  });

  it("sem o idioma da tela, português, inglês e então o que houver", () => {
    expect(resolverTexto({ "pt-BR": "Iniciativa" }, "en")).toBe("Iniciativa");
    expect(resolverTexto({ en: "Initiative" }, "pt-BR")).toBe("Initiative");
    expect(resolverTexto({ es: "Iniciativa española" }, "en")).toBe("Iniciativa española");
  });

  it("valor em branco não conta", () => {
    expect(resolverTexto({ en: " ", "pt-BR": "Iniciativa" }, "en")).toBe("Iniciativa");
  });

  it("lixo vira vazio, e não exceção", () => {
    expect(resolverTexto(null)).toBe("");
    expect(resolverTexto(42)).toBe("");
    expect(resolverTexto({})).toBe("");
  });
});
