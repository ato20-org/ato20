import { describe, expect, it } from "vitest";

import { comBloco, comLink, comMarca, comRecuo, cursorDepoisDoBloco, prefixoDe } from "./formatar";

describe("comBloco", () => {
  it("põe o prefixo no parágrafo", () => {
    expect(comBloco("Porão", "h2")).toEqual({ linha: "## Porão", antes: 0, depois: 3 });
    expect(comBloco("comprar", "tarefa").linha).toBe("- [ ] comprar");
    expect(comBloco("fala", "citacao").linha).toBe("> fala");
  });

  it("o mesmo botão tira o que pôs", () => {
    expect(comBloco("## Porão", "h2")).toEqual({ linha: "Porão", antes: 3, depois: 0 });
    expect(comBloco("- [x] feito", "tarefa").linha).toBe("feito");
    expect(comBloco("> fala", "citacao").linha).toBe("fala");
  });

  it("troca um bloco pelo outro, sem empilhar", () => {
    expect(comBloco("# Porão", "h3").linha).toBe("### Porão");
    expect(comBloco("- item", "numero").linha).toBe("1. item");
    expect(comBloco("- [ ] item", "item").linha).toBe("- item");
    expect(comBloco("3. item", "citacao").linha).toBe("> item");
  });

  it("a numerada continua a conta de cima, e a lista guarda o recuo", () => {
    expect(comBloco("terceiro", "numero", "2. segundo").linha).toBe("3. terceiro");
    expect(comBloco("primeiro", "numero", "texto").linha).toBe("1. primeiro");
    expect(comBloco("  - dentro", "numero").linha).toBe("  1. dentro");
  });

  it("`>Porão` é menção de cena, e não citação", () => {
    expect(prefixoDe(">Porão").tipo).toBe("paragrafo");
    expect(comBloco(">Porão", "h1").linha).toBe("# >Porão");
  });

  it("o cursor anda com o prefixo", () => {
    expect(cursorDepoisDoBloco(5, 0, 3)).toBe(8);
    expect(cursorDepoisDoBloco(1, 3, 0)).toBe(0);
    expect(cursorDepoisDoBloco(6, 2, 3)).toBe(7);
  });
});

describe("comMarca", () => {
  it("envolve a seleção", () => {
    expect(comMarca("o altar ao fundo", 2, 7, "negrito")).toEqual({
      linha: "o **altar** ao fundo",
      inicio: 4,
      fim: 9,
    });
    expect(comMarca("o altar", 2, 7, "codigo").linha).toBe("o `altar`");
  });

  it("sem seleção, marca a palavra sob o cursor", () => {
    expect(comMarca("o altar ao fundo", 4, 4, "italico")).toEqual({
      linha: "o *altar* ao fundo",
      inicio: 3,
      fim: 8,
    });
    expect(comMarca("Pé-de-Ferro chega", 3, 3, "negrito").linha).toBe("**Pé-de-Ferro** chega");
  });

  it("sem palavra, entra o par com o cursor no meio", () => {
    expect(comMarca("fim ", 4, 4, "negrito")).toEqual({ linha: "fim ****", inicio: 6, fim: 6 });
    // Só espaço selecionado: o par entra onde o espaço acaba.
    expect(comMarca("a   b", 1, 4, "negrito")).toEqual({ linha: "a   ****b", inicio: 6, fim: 6 });
  });

  it("o espaço das pontas fica fora da marca", () => {
    expect(comMarca("o altar ao", 1, 8, "negrito").linha).toBe("o **altar** ao");
  });

  it("marca que já está lá sai, por fora ou por dentro da seleção", () => {
    expect(comMarca("o **altar** ao", 4, 9, "negrito")).toEqual({
      linha: "o altar ao",
      inicio: 2,
      fim: 7,
    });
    expect(comMarca("o **altar** ao", 2, 11, "negrito")).toEqual({
      linha: "o altar ao",
      inicio: 2,
      fim: 7,
    });
    expect(comMarca("o *altar* ao", 5, 5, "italico").linha).toBe("o altar ao");
  });

  it("itálico dentro de negrito não desfaz o negrito pela metade", () => {
    expect(comMarca("o **altar** ao", 4, 9, "italico").linha).toBe("o ***altar*** ao");
  });
});

describe("comLink", () => {
  it("com texto, seleciona o endereço para colar", () => {
    const feito = comLink("ver o mapa", 6, 10);
    expect(feito.linha).toBe("ver o [mapa](https://)");
    expect(feito.linha.slice(feito.inicio, feito.fim)).toBe("https://");
  });

  it("sem texto, seleciona o que falta escrever", () => {
    const feito = comLink("ver ", 4, 4);
    expect(feito.linha).toBe("ver [link](https://)");
    expect(feito.linha.slice(feito.inicio, feito.fim)).toBe("link");
  });
});

describe("comRecuo", () => {
  it("Tab num item aninha, com o cursor junto", () => {
    expect(comRecuo("- item", 4, 4, 1)).toEqual({ texto: "  - item", inicio: 6, fim: 6 });
    expect(comRecuo("1. um", 0, 0, 1).texto).toBe("  1. um");
    expect(comRecuo("- [ ] fazer", 8, 8, 1).texto).toBe("  - [ ] fazer");
  });

  it("Shift+Tab desaninha, e sem recuo não mexe", () => {
    expect(comRecuo("  - item", 6, 6, -1)).toEqual({ texto: "- item", inicio: 4, fim: 4 });
    expect(comRecuo("\ttexto", 3, 3, -1)).toEqual({ texto: "texto", inicio: 2, fim: 2 });
    expect(comRecuo("texto", 2, 2, -1)).toEqual({ texto: "texto", inicio: 2, fim: 2 });
    // O cursor no recuo não cai para antes da linha.
    expect(comRecuo("  - item", 1, 1, -1).inicio).toBe(0);
  });

  it("Tab em texto recua a linha inteira, com o cursor onde estiver", () => {
    expect(comRecuo("nome valor", 4, 4, 1)).toEqual({ texto: "\tnome valor", inicio: 5, fim: 5 });
    expect(comRecuo("nome valor", 4, 5, 1)).toEqual({ texto: "\tnome valor", inicio: 5, fim: 6 });
    expect(comRecuo("\tnome", 0, 0, 1).texto).toBe("\t\tnome");
  });

  it("título não recua", () => {
    expect(comRecuo("# Porão", 3, 3, 1)).toEqual({ texto: "# Porão", inicio: 3, fim: 3 });
  });

  it("seleção em várias linhas recua todas, cada uma pela sua regra", () => {
    const texto = "- a\n- b\ntexto\nfim";
    const feito = comRecuo(texto, 2, 10, 1);
    expect(feito.texto).toBe("  - a\n  - b\n\ttexto\nfim");
    expect(feito.texto.slice(feito.inicio, feito.fim)).toBe("a\n  - b\n\tte");
  });

  it("seleção até o começo da linha de baixo não a leva junto", () => {
    expect(comRecuo("- a\n- b\n- c", 0, 8, 1).texto).toBe("  - a\n  - b\n- c");
  });

  it("Shift+Tab em várias linhas desrecua todas", () => {
    expect(comRecuo("  - a\n\tb\nc", 0, 9, -1).texto).toBe("- a\nb\nc");
  });
});
