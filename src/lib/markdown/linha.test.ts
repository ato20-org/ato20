import { describe, expect, it } from "vitest";

import { ajustesDe, bloco, comAjuste, comLargura, trechos, trechosComPosicao } from "./linha";

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

  it("o recuo vira nível, na lista e no texto", () => {
    expect(bloco("  - sub")).toEqual({ tipo: "item", conteudo: "sub", recuo: 1 });
    expect(bloco("\t\t- [ ] fundo")).toEqual({ tipo: "tarefa", feita: false, conteudo: "fundo", recuo: 2 });
    expect(bloco("    2. dois")).toEqual({ tipo: "numero", numero: "2", conteudo: "dois", recuo: 2 });
    expect(bloco("\tO texto recuado")).toEqual({ tipo: "paragrafo", conteudo: "O texto recuado", recuo: 1 });
    // Um espaço só não é recuo: é o que sobra de uma digitação.
    expect(bloco(" texto")).toEqual({ tipo: "paragrafo", conteudo: " texto" });
  });

  it("régua e vazio", () => {
    expect(bloco("---")).toEqual({ tipo: "regua" });
    expect(bloco("   ")).toEqual({ tipo: "vazio" });
  });
});

describe("prévia da menção sozinha", () => {
  it("a linha que é só uma menção vira prévia, dos três tipos", () => {
    expect(bloco("/porao.jpg")).toEqual({
      tipo: "embed",
      mencao: { tipo: "arquivo", valor: "porao.jpg", bruto: "/porao.jpg" },
      senao: { tipo: "paragrafo", conteudo: "/porao.jpg" },
    });
    expect(bloco("@Thalor").tipo).toBe("embed");
    expect(bloco('@"Thalor Pé-de-Ferro"')).toMatchObject({
      tipo: "embed",
      mencao: { tipo: "personagem", valor: "Thalor Pé-de-Ferro" },
    });
  });

  it("`>Porão` é prévia de cena, e cai na citação de antes", () => {
    expect(bloco(">Porão")).toEqual({
      tipo: "embed",
      mencao: { tipo: "cena", valor: "Porão", bruto: ">Porão" },
      senao: { tipo: "citacao", conteudo: "Porão" },
    });
    // Com espaço é citação, e não marcador: o parser das menções não abre.
    expect(bloco("> fala").tipo).toBe("citacao");
  });

  it("a largura do fim, que some do que a linha seria sem a prévia", () => {
    expect(bloco("/porao.jpg|320")).toEqual({
      tipo: "embed",
      mencao: { tipo: "arquivo", valor: "porao.jpg", bruto: "/porao.jpg" },
      largura: 320,
      senao: { tipo: "paragrafo", conteudo: "/porao.jpg" },
    });
    expect(bloco('/"mapa do porão.jpg"|200 ')).toMatchObject({
      mencao: { valor: "mapa do porão.jpg" },
      largura: 200,
    });
  });

  it("menção com mais coisa na linha continua o bloco de sempre", () => {
    expect(bloco("@Thalor sabe do alçapão").tipo).toBe("paragrafo");
    expect(bloco("- /porao.jpg").tipo).toBe("item");
    expect(bloco("# @Thalor").tipo).toBe("titulo");
    expect(bloco("**@Thalor**").tipo).toBe("paragrafo");
    expect(bloco("vai pro >Porão.").tipo).toBe("paragrafo");
  });

  it("`!rótulo` é página marcada, sozinha ou no meio da frase", () => {
    expect(bloco("!Agarrar")).toMatchObject({
      tipo: "embed",
      mencao: { tipo: "marcador", valor: "Agarrar", bruto: "!Agarrar" },
    });
    expect(bloco('!"Ataque de oportunidade"')).toMatchObject({
      mencao: { tipo: "marcador", valor: "Ataque de oportunidade" },
    });
    expect(trechos("ver !Agarrar antes")).toEqual([
      { tipo: "texto", valor: "ver " },
      {
        tipo: "mencao",
        token: { tipo: "marcador", valor: "Agarrar", bruto: "!Agarrar" },
      },
      { tipo: "texto", valor: " antes" },
    ]);
  });

  it("`!` que não abre nome continua texto", () => {
    expect(bloco("!!!").tipo).toBe("paragrafo");
    expect(bloco("Cuidado!").tipo).toBe("paragrafo");
    expect(trechos("Cuidado ! agora")).toEqual([{ tipo: "texto", valor: "Cuidado ! agora" }]);
    expect(trechos("e!x")).toEqual([{ tipo: "texto", valor: "e!x" }]);
  });

  it("o alinhamento do fim, com ou sem largura, em qualquer ordem", () => {
    expect(bloco("/foto.png|centro")).toEqual({
      tipo: "embed",
      mencao: { tipo: "arquivo", valor: "foto.png", bruto: "/foto.png" },
      alinhamento: "centro",
      senao: { tipo: "paragrafo", conteudo: "/foto.png" },
    });
    expect(bloco("/foto.png|320|direita")).toMatchObject({ largura: 320, alinhamento: "direita" });
    expect(bloco("/foto.png|direita|320")).toMatchObject({ largura: 320, alinhamento: "direita" });
    // Esquerda é o padrão: escrita, some.
    expect(bloco("/foto.png|esquerda")).not.toHaveProperty("alinhamento");
    expect(ajustesDe("/foto.png|320|centro").resto).toBe("/foto.png");
  });

  it("comAjuste troca um ajuste e guarda o outro, na mesma ordem sempre", () => {
    expect(comAjuste("/foto.png|320", { alinhamento: "centro" })).toBe("/foto.png|320|centro");
    expect(comAjuste("/foto.png|centro", { largura: 200 })).toBe("/foto.png|200|centro");
    expect(comAjuste("/foto.png|320|centro", { alinhamento: "esquerda" })).toBe("/foto.png|320");
    expect(comAjuste("/foto.png", { alinhamento: "direita" })).toBe("/foto.png|direita");
  });

  it("várias menções na linha viram fileira, cada uma com a largura dela", () => {
    expect(bloco("/mapa.png|240 /retrato.png")).toEqual({
      tipo: "galeria",
      itens: [
        { mencao: { tipo: "arquivo", valor: "mapa.png", bruto: "/mapa.png" }, largura: 240 },
        { mencao: { tipo: "arquivo", valor: "retrato.png", bruto: "/retrato.png" } },
      ],
      senao: { tipo: "paragrafo", conteudo: "/mapa.png|240 /retrato.png" },
    });
    expect(bloco('/"mapa do porão.png"|200 @Thalor|centro')).toMatchObject({
      tipo: "galeria",
      alinhamento: "centro",
      itens: [
        { mencao: { valor: "mapa do porão.png", bruto: '/"mapa do porão.png"' }, largura: 200 },
        { mencao: { tipo: "personagem", valor: "Thalor", bruto: "@Thalor" } },
      ],
    });
  });

  it("texto entre as menções é texto com chips, e não fileira", () => {
    expect(bloco("/mapa.png e /retrato.png").tipo).toBe("paragrafo");
    expect(bloco("- /mapa.png /retrato.png").tipo).toBe("item");
  });

  it("comAjuste na fileira: a largura de uma, o alinhamento da fileira", () => {
    const linha = "/mapa.png|240 /retrato.png";
    expect(comAjuste(linha, { largura: 180 }, 1)).toBe("/mapa.png|240 /retrato.png|180");
    expect(comAjuste(linha, { alinhamento: "centro" }, 0)).toBe("/mapa.png|240 /retrato.png|centro");
    expect(comAjuste("/a.png /b.png|100|direita", { largura: 50 }, 0)).toBe("/a.png|50 /b.png|100|direita");
  });

  it("comLargura troca o número que houver, ou põe um", () => {
    expect(comLargura("/porao.jpg", 320)).toBe("/porao.jpg|320");
    expect(comLargura("/porao.jpg|320", 241.6)).toBe("/porao.jpg|242");
    expect(comLargura('/"mapa do porão.jpg"|90  ', 400)).toBe('/"mapa do porão.jpg"|400');
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

describe("trechos com menção", () => {
  it("@personagem, /arquivo e >cena saem como menção, com o resto em volta", () => {
    const saida = trechos("fala com @Edgar sobre /mapa.jpg em >Porão, *rápido*");
    expect(saida.map((t) => t.tipo)).toEqual([
      "texto",
      "mencao",
      "texto",
      "mencao",
      "texto",
      "mencao",
      "texto",
      "italico",
    ]);
    const primeira = saida[1];
    expect(primeira.tipo === "mencao" && primeira.token.tipo).toBe("personagem");
  });

  it("negrito continua vindo do parser do postit", () => {
    expect(trechos("a **b** c")).toEqual([
      { tipo: "texto", valor: "a " },
      { tipo: "negrito", valor: "b" },
      { tipo: "texto", valor: " c" },
    ]);
  });
});

describe("trechosComPosicao", () => {
  const amostras = [
    "a **b** c *d* e `f` g [h](http://i) _j_",
    "@Thalor vê o /porao.jpg em >Porão, e !Agarrar.",
    '@"Pé-de-Ferro" e **negrito** colado',
    "só texto",
    "",
  ];

  it.each(amostras)("cobre o conteúdo inteiro, sem buraco: %s", (conteudo) => {
    let cursor = 0;
    for (const { inicio, fim } of trechosComPosicao(conteudo)) {
      expect(inicio).toBe(cursor);
      cursor = fim;
    }
    expect(cursor).toBe(conteudo.length);
  });

  it.each(amostras)("o que aparece é o cru entre `dentro` e `visivel`: %s", (conteudo) => {
    for (const { trecho, dentro, visivel } of trechosComPosicao(conteudo)) {
      if (visivel === null) {
        expect(trecho.tipo).toBe("mencao");
        continue;
      }
      expect("valor" in trecho ? trecho.valor : "").toBe(conteudo.slice(dentro, dentro + visivel));
    }
  });

  it("negrito: marcas por fora, texto por dentro", () => {
    expect(trechosComPosicao("o **altar**")[1]).toEqual({
      trecho: { tipo: "negrito", valor: "altar" },
      inicio: 2,
      fim: 11,
      dentro: 4,
      visivel: 5,
    });
  });
});
