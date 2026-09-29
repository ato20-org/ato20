import { describe, expect, it } from "vitest";

import { lerSecaoPublica, MAX_BLOCOS } from "./secao-publica";

describe("lerSecaoPublica", () => {
  it("lê os três blocos e ignora o que não serve", () => {
    const secao = lerSecaoPublica({
      outra: 1,
      secao: {
        titulo: "Habilidades",
        blocos: [
          { tipo: "texto", texto: "Guerreiro nível 3" },
          { tipo: "valor", rotulo: "PA", valor: 3 },
          { tipo: "botao", rotulo: "Atacar", acao: "atacar", icone: "espadas" },
          { tipo: "botao", rotulo: "Sem ação" },
          { tipo: "botao", rotulo: "Ação suja", acao: "../x" },
          { tipo: "imagem", src: "x" },
          "solto",
        ],
      },
    });

    expect(secao).toEqual({
      titulo: "Habilidades",
      blocos: [
        { tipo: "texto", texto: "Guerreiro nível 3" },
        { tipo: "valor", rotulo: "PA", valor: "3" },
        { tipo: "botao", rotulo: "Atacar", acao: "atacar", icone: "espadas" },
      ],
    });
  });

  it("nada que sirva é null, e não uma seção vazia", () => {
    expect(lerSecaoPublica(null)).toBeNull();
    expect(lerSecaoPublica({ secao: { blocos: [] } })).toBeNull();
    expect(lerSecaoPublica({ secao: { blocos: [{ tipo: "texto", texto: "  " }] } })).toBeNull();
    expect(lerSecaoPublica({ secao: "texto" })).toBeNull();
  });

  it("corta o que passa do teto", () => {
    const blocos = Array.from({ length: MAX_BLOCOS + 5 }, (_, i) => ({ tipo: "texto", texto: `b${i}` }));
    expect(lerSecaoPublica({ secao: { blocos } })?.blocos).toHaveLength(MAX_BLOCOS);

    const longo = lerSecaoPublica({ secao: { blocos: [{ tipo: "texto", texto: "x".repeat(1000) }] } });
    expect(longo?.blocos[0]).toMatchObject({ tipo: "texto" });
    expect((longo?.blocos[0] as { texto: string }).texto.length).toBe(400);
  });
});
