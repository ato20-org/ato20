import { describe, expect, it } from "vitest";

import { encaixarRetratos, lerPedidoDeRetratos, type RetratoParaKit } from "./kit-de-retratos";

const retrato = {
  id: "ana",
  personagemId: "ana",
  assetId: "abc",
  x: 0.02,
  y: 0.6,
  width: 0.14,
  height: 0.34,
  visible: true,
  medidores: [],
  nome: "Ana",
};

describe("lerPedidoDeRetratos", () => {
  it("ignora o que não é do kit", () => {
    expect(lerPedidoDeRetratos({ mostrar: [] })).toBeNull();
    expect(lerPedidoDeRetratos({ ato20: "dados", mostrar: [] })).toBeNull();
  });

  it("some com o retrato de casca torta e deixa os outros", () => {
    const pedido = lerPedidoDeRetratos({
      ato20: "retratos",
      mostrar: [
        retrato,
        { ...retrato, id: "sem-geometria", x: undefined },
        { ...retrato, id: "largura-zero", width: 0 },
        { ...retrato, id: "pagina-http", url: "http://exemplo.com" },
        { ...retrato, id: "medidores-errados", medidores: "cheio" },
      ],
    });

    expect(pedido?.tipo === "mostrar" && pedido.retratos.map((r) => r.id)).toEqual(["ana"]);
  });

  it("todo retrato pedido aparece, e só efeito com forma de id e cor de verdade", () => {
    const pedido = lerPedidoDeRetratos({
      ato20: "retratos",
      mostrar: [
        {
          ...retrato,
          visible: false,
          efeitos: [
            { efeito: "aura", cor: "#22c55e" },
            { efeito: "../explodir", cor: "#fff" },
            // Forma certa, efeito que o kit não desenha: passa, e cai no selo
            // lá dentro, como em qualquer tela.
            { efeito: "ordem-paranormal/sangue", cor: "#ef4444" },
            { efeito: "tingido", cor: "red; background:url(x)" },
          ],
        },
      ],
    });

    if (pedido?.tipo !== "mostrar") throw new Error("devia mostrar");
    expect(pedido.retratos[0].visible).toBe(true);
    expect(pedido.retratos[0].efeitos).toEqual([
      { efeito: "aura", cor: "#22c55e" },
      { efeito: "ordem-paranormal/sangue", cor: "#ef4444" },
    ]);
  });

  it("rolagem sem personagem ou com face que o dado não tem some", () => {
    const pedido = lerPedidoDeRetratos({
      ato20: "retratos",
      rolagens: [
        { id: "r1", faces: 20, valor: 17, personagemId: "ana", jogador: "Ana" },
        { id: "r2", faces: 20, valor: 17 },
        { id: "r3", faces: 6, valor: 9, personagemId: "ana" },
      ],
    });

    expect(pedido?.tipo === "rolagens" && pedido.rolagens.map((r) => r.id)).toEqual(["r1"]);
  });
});

describe("encaixarRetratos", () => {
  const umRetrato = retrato as RetratoParaKit;

  it("guarda a proporção da mesa numa tela de outra proporção", () => {
    const [largo] = encaixarRetratos([umRetrato], 16 / 9);
    const [quadrado] = encaixarRetratos([umRetrato], 1);

    // Na mesma altura em fração, a figura na tela quadrada ocupa mais largura
    // em fração -- é a mesma figura em pixel, numa tela mais estreita.
    const emPixel = (r: RetratoParaKit, aspecto: number) => (r.width * aspecto) / r.height;
    expect(emPixel(largo, 16 / 9)).toBeCloseTo(emPixel(quadrado, 1));
  });

  it("a composição inteira cabe na tela, medida como o desenho mede: em pixel", () => {
    const comBarras = {
      ...umRetrato,
      medidores: [{ id: "vida", nome: "Vida", cor: "#ef4444", estilo: "barra" as const, atual: 7, maximo: 10, escondido: false }],
    };

    // O desenho mede a coluna em pixel: `0,8 × 9/16 × altura`. Em fração da
    // largura de uma caixa 3:4, isso é a mesma conta dividida pelo aspecto.
    const aspecto = 3 / 4;
    const [card] = encaixarRetratos([comBarras], aspecto);
    const colunaEmFracao = (card.height * 0.8 * (9 / 16)) / aspecto;

    expect(card.x).toBeGreaterThan(0);
    expect(card.x + card.width + colunaEmFracao).toBeLessThanOrEqual(1);
  });

  it("cada retrato numa coluna, dentro dela", () => {
    const tres = encaixarRetratos(
      [umRetrato, { ...umRetrato, id: "bia" }, { ...umRetrato, id: "caio" }],
      16 / 9,
    );

    tres.forEach((r, indice) => {
      expect(r.x).toBeGreaterThanOrEqual(indice / 3);
      expect(r.x + r.width).toBeLessThanOrEqual((indice + 1) / 3);
      expect(r.y + r.height).toBeLessThan(0.7);
    });
  });
});
