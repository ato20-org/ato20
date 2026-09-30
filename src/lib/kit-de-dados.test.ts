import { describe, expect, it } from "vitest";

import { lancamentoNoKit, lerPedido } from "./kit-de-dados";

describe("lerPedido", () => {
  it("ignora o que não é do kit", () => {
    expect(lerPedido(null)).toBeNull();
    expect(lerPedido({ lancar: [] })).toBeNull();
    expect(lerPedido({ ato20: "outro", lancar: [] })).toBeNull();
  });

  it("some com o dado malformado e deixa os outros caírem", () => {
    const pedido = lerPedido({
      ato20: "dados",
      lancar: [
        { id: "ok", faces: 20, face: 17, rotulo: "Ana", prazo: 10 },
        { id: "face-que-nao-existe", faces: 6, face: 9 },
        { id: "faces-que-nao-existem", faces: 7, face: 1 },
        { faces: 20, face: 1 },
        { id: "d10-zero", faces: 10, face: 0, impulso: { x: 100, y: 0 }, semente: 42 },
      ],
    });

    expect(pedido?.tipo).toBe("lancar");
    if (pedido?.tipo !== "lancar") return;
    expect(pedido.dados.map((dado) => dado.id)).toEqual(["ok", "d10-zero"]);
    expect(pedido.dados[0]).toMatchObject({ rotulo: "Ana", prazo: 10, impulso: null });
    expect(pedido.dados[1]).toMatchObject({ semente: 42, impulso: { x: 100, y: 0 }, prazo: null });
  });

  it("semente ausente sai do id: o mesmo dado gira igual em toda página", () => {
    const a = lerPedido({ ato20: "dados", lancar: [{ id: "x", faces: 6, face: 3 }] });
    const b = lerPedido({ ato20: "dados", lancar: [{ id: "x", faces: 6, face: 3 }] });

    expect(a).toEqual(b);
  });

  it("prazo fica entre meio segundo e dez minutos", () => {
    const pedido = lerPedido({
      ato20: "dados",
      lancar: [
        { id: "a", faces: 4, face: 1, prazo: 0 },
        { id: "b", faces: 4, face: 1, prazo: 99999 },
      ],
    });

    expect(pedido?.tipo === "lancar" && pedido.dados.map((dado) => dado.prazo)).toEqual([0.5, 600]);
  });

  it("tirar e limpar", () => {
    expect(lerPedido({ ato20: "dados", tirar: ["a", 1, "b"] })).toEqual({
      tipo: "tirar",
      ids: ["a", "b"],
    });
    expect(lerPedido({ ato20: "dados", limpar: true })).toEqual({ tipo: "limpar" });
  });
});

describe("lancamentoNoKit", () => {
  const tela = { largura: 900, altura: 506 };

  it("é o mesmo para o mesmo dado: recarregar não o manda para outro lugar", () => {
    const dado = { semente: 123456, impulso: null };

    expect(lancamentoNoKit(dado, tela)).toEqual(lancamentoNoKit(dado, tela));
  });

  it("leva o gesto quando a página o manda", () => {
    expect(lancamentoNoKit({ semente: 1, impulso: { x: 400, y: 0 } }, tela).impulso).toEqual({
      x: 400,
      y: 0,
    });
  });

  it("dados do mesmo lote pousam em faixas diferentes, na ordem do lote", () => {
    const chegadas = [0, 1, 2].map((indice) => {
      const { x, impulso } = lancamentoNoKit({ semente: 5, impulso: null }, tela, {
        indice,
        total: 3,
      });
      return x + impulso.x * 0.3;
    });

    expect(chegadas[0]).toBeLessThan(chegadas[1]);
    expect(chegadas[1]).toBeLessThan(chegadas[2]);
  });

  it("a chegada cai no miolo da tela, qualquer que seja a força", () => {
    for (const semente of [0, 7, 99, 4242, 0xffffffff]) {
      const { x, y, impulso } = lancamentoNoKit({ semente, impulso: null }, tela);
      // O alcance é `impulso × 0,3`; a chegada é partida + alcance.
      const cx = x + impulso.x * 0.3;
      const cy = y + impulso.y * 0.3;

      expect(cx).toBeGreaterThanOrEqual(tela.largura * 0.3 - 1e-6);
      expect(cx).toBeLessThanOrEqual(tela.largura * 0.7 + 1e-6);
      expect(cy).toBeGreaterThanOrEqual(tela.altura * 0.3 - 1e-6);
      expect(cy).toBeLessThanOrEqual(tela.altura * 0.7 + 1e-6);
    }
  });
});
