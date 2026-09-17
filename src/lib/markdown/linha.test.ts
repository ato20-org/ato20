import { describe, expect, it } from "vitest";

import { bloco, trechos } from "./linha";

describe("bloco", () => {
  it("reconhece títulos até o terceiro nível", () => {
    expect(bloco("# Um")).toEqual({ tipo: "titulo", nivel: 1, conteudo: "Um" });
    expect(bloco("### Três")).toEqual({ tipo: "titulo", nivel: 3, conteudo: "Três" });
    expect(bloco("#### Quatro").tipo).toBe("paragrafo");
    expect(bloco("#sem espaço").tipo).toBe("paragrafo");
  });

  it("lista, tarefa, número e citação", () => {
    expect(bloco("- item")).toEqual({ tipo: "item", conteudo: "item" });
    expect(bloco("* item")).toEqual({ tipo: "item", conteudo: "item" });
    expect(bloco("- [ ] fazer")).toEqual({ tipo: "tarefa", feita: false, conteudo: "fazer" });
    expect(bloco("- [x] feito")).toEqual({ tipo: "tarefa", feita: true, conteudo: "feito" });
    expect(bloco("3. terceiro")).toEqual({ tipo: "numero", numero: "3", conteudo: "terceiro" });
    expect(bloco("> fala")).toEqual({ tipo: "citacao", conteudo: "fala" });
  });

  it("régua e vazio", () => {
    expect(bloco("---")).toEqual({ tipo: "regua" });
    expect(bloco("   ")).toEqual({ tipo: "vazio" });
  });
});

describe("trechos", () => {
  it("negrito, itálico, código e link, com texto em volta", () => {
    expect(trechos("a **b** c *d* e `f` g [h](http://i)")).toEqual([
      { tipo: "texto", valor: "a " },
      { tipo: "negrito", valor: "b" },
      { tipo: "texto", valor: " c " },
      { tipo: "italico", valor: "d" },
      { tipo: "texto", valor: " e " },
      { tipo: "codigo", valor: "f" },
      { tipo: "texto", valor: " g " },
      { tipo: "link", valor: "h", url: "http://i" },
    ]);
  });

  it("asterisco solto e sublinhado dentro de palavra são texto", () => {
    expect(trechos("2 * 3 = 6")).toEqual([{ tipo: "texto", valor: "2 * 3 = 6" }]);
    expect(trechos("snake_case_nome")).toEqual([{ tipo: "texto", valor: "snake_case_nome" }]);
  });

  it("linha sem nada devolve um trecho só", () => {
    expect(trechos("simples")).toEqual([{ tipo: "texto", valor: "simples" }]);
    expect(trechos("")).toEqual([]);
  });
});
