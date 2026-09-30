import { describe, expect, it } from "vitest";

import { acomodarPainel } from "@/lib/geometry/painel-na-tela";

const tela = { left: 0, top: 0, right: 1000, bottom: 800 };

/** A caixa do elemento com a fileira de botões, no meio da tela. */
const caixa = { left: 400, top: 300, right: 600, bottom: 450 };

describe("acomodarPainel embaixo", () => {
  it("cabe embaixo: fica onde nasceu", () => {
    const painel = { left: 420, top: 458, right: 580, bottom: 700 };
    expect(acomodarPainel({ painel, tela, obstaculo: caixa, lado: "baixo" })).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it("não cabe embaixo: pula para cima da caixa, acima da fileira", () => {
    const rodape = { left: 400, top: 600, right: 600, bottom: 750 };
    const painel = { left: 420, top: 758, right: 580, bottom: 1000 };
    const { dy } = acomodarPainel({ painel, tela, obstaculo: rodape, lado: "baixo" });
    // O fundo do painel encosta 8px acima do topo do obstáculo.
    expect(painel.bottom + dy).toBe(rodape.top - 8);
  });

  it("não cabe em lado nenhum: encosta dentro da tela", () => {
    const alta = { left: 400, top: 100, right: 600, bottom: 700 };
    const painel = { left: 420, top: 708, right: 580, bottom: 900 };
    const { dy } = acomodarPainel({ painel, tela, obstaculo: alta, lado: "baixo" });
    expect(painel.bottom + dy).toBe(tela.bottom - 8);
  });

  it("passa da borda direita: é empurrado para dentro, sem pular", () => {
    const painel = { left: 900, top: 458, right: 1060, bottom: 700 };
    const { dx, dy } = acomodarPainel({ painel, tela, obstaculo: caixa, lado: "baixo" });
    expect(painel.right + dx).toBe(tela.right - 8);
    expect(dy).toBe(0);
  });

  it("passa da borda esquerda: é empurrado para dentro", () => {
    const painel = { left: -40, top: 458, right: 120, bottom: 700 };
    expect(acomodarPainel({ painel, tela, obstaculo: caixa, lado: "baixo" }).dx).toBe(48);
  });
});

describe("acomodarPainel à direita", () => {
  it("não cabe à direita: pula para a esquerda da caixa", () => {
    const borda = { left: 800, top: 300, right: 950, bottom: 450 };
    const painel = { left: 958, top: 280, right: 1010, bottom: 470 };
    const { dx } = acomodarPainel({ painel, tela, obstaculo: borda, lado: "direita" });
    expect(painel.right + dx).toBe(borda.left - 8);
  });

  it("passa do rodapé: sobe para dentro, sem pular de lado", () => {
    const painel = { left: 608, top: 700, right: 660, bottom: 890 };
    const { dx, dy } = acomodarPainel({ painel, tela, obstaculo: caixa, lado: "direita" });
    expect(dx).toBe(0);
    expect(painel.bottom + dy).toBe(tela.bottom - 8);
  });
});

describe("acomodarPainel em cima", () => {
  it("não cabe em cima: desce para baixo do ponto", () => {
    const ponto = { left: 500, top: 30, right: 500, bottom: 30 };
    const painel = { left: 400, top: -200, right: 600, bottom: 12 };
    const { dy } = acomodarPainel({ painel, tela, obstaculo: ponto, lado: "cima", vao: 18 });
    expect(painel.top + dy).toBe(ponto.bottom + 18);
  });

  it("cabe em cima: fica", () => {
    const ponto = { left: 500, top: 400, right: 500, bottom: 400 };
    const painel = { left: 400, top: 170, right: 600, bottom: 382 };
    expect(
      acomodarPainel({ painel, tela, obstaculo: ponto, lado: "cima", vao: 18 }).dy,
    ).toBe(0);
  });
});

describe("acomodarPainel livre", () => {
  it("não pula de lado: só volta para dentro, nos dois eixos", () => {
    const painel = { left: 900, top: 700, right: 1180, bottom: 950 };
    const { dx, dy } = acomodarPainel({ painel, tela, obstaculo: painel, lado: "livre" });
    expect(painel.right + dx).toBe(tela.right - 8);
    expect(painel.bottom + dy).toBe(tela.bottom - 8);
  });

  it("dentro da tela, fica onde a mão deixou", () => {
    const painel = { left: 100, top: 100, right: 380, bottom: 350 };
    expect(
      acomodarPainel({ painel, tela, obstaculo: painel, lado: "livre" }),
    ).toEqual({ dx: 0, dy: 0 });
  });
});
