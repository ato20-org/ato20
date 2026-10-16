import { describe, expect, it } from "vitest";

import {
  aceita,
  assetIdDoArrasto,
  chaveDoAlvo,
  type DestinoDoArrasto,
  type FonteDoArrasto,
} from "@/lib/store/use-token-drag-store";

const emChamas = { nome: "Em chamas", cor: "#f59e0b", icone: "chama", efeito: "chamas" };

const condicao: FonteDoArrasto = { tipo: "condicao", condicaoId: "c1", condicao: emChamas };
const efeito: FonteDoArrasto = { tipo: "efeito", efeitoId: "campanha/fogo", condicao: emChamas };
const area: FonteDoArrasto = { tipo: "area", efeitoId: "campanha/chao", cor: "#f59e0b" };
const personagem: FonteDoArrasto = { tipo: "personagem", personagemId: "p1", assetId: "a1" };
const acervo: FonteDoArrasto = { tipo: "acervo", assetId: "a2" };

const peca: DestinoDoArrasto = { tipo: "peca", itemId: "i1" };

describe("a condição arrastada até uma peça", () => {
  it("cai na peça, a condição e o efeito", () => {
    expect(aceita(condicao, peca)).toBe(true);
    expect(aceita(efeito, peca)).toBe(true);
  });

  it("não cai no chão do mapa: não há imagem a pôr lá", () => {
    expect(aceita(condicao, { tipo: "palco" })).toBe(false);
    expect(aceita(efeito, { tipo: "palco" })).toBe(false);
  });

  it("para o token e a imagem, a peça não é alvo", () => {
    expect(aceita(personagem, peca)).toBe(false);
    expect(aceita(acervo, peca)).toBe(false);
    // E o chão continua recebendo os dois.
    expect(aceita(personagem, { tipo: "palco" })).toBe(true);
    expect(aceita(acervo, { tipo: "palco" })).toBe(true);
  });

  it("não cai em nenhum outro lugar", () => {
    const outros: DestinoDoArrasto[] = [
      { tipo: "inventario", personagemId: "p1" },
      { tipo: "personagem", personagemId: "p1" },
      { tipo: "pasta-itens", pastaId: undefined },
      { tipo: "handout" },
      { tipo: "ponto", pinId: "x" },
      { tipo: "pasta-arquivos", pastaId: undefined },
      { tipo: "nota" },
      { tipo: "split", painel: "x", zona: "centro" },
    ];

    for (const destino of outros) {
      expect(aceita(condicao, destino)).toBe(false);
      expect(aceita(efeito, destino)).toBe(false);
    }
  });

  it("não leva arquivo do acervo, e todas as peças têm um alvo só", () => {
    expect(assetIdDoArrasto(condicao)).toBeUndefined();
    expect(assetIdDoArrasto(efeito)).toBeUndefined();
    expect(chaveDoAlvo(peca)).toBe(chaveDoAlvo({ tipo: "peca", itemId: "outra" }));
  });
});

describe("o efeito de área arrastado até o mapa", () => {
  it("cai no chão, e não numa peça", () => {
    expect(aceita(area, { tipo: "palco" })).toBe(true);
    expect(aceita(area, peca)).toBe(false);
  });

  it("não cai em lista nenhuma", () => {
    expect(aceita(area, { tipo: "nota" })).toBe(false);
    expect(aceita(area, { tipo: "pasta-arquivos", pastaId: undefined })).toBe(false);
    expect(aceita(area, { tipo: "handout" })).toBe(false);
  });

  it("não leva arquivo do acervo: a sombra é o círculo", () => {
    expect(assetIdDoArrasto(area)).toBeUndefined();
  });
});

