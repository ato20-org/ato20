import { describe, expect, it } from "vitest";

import type { Dado, RolagemDaMesa } from "@/types/dado";

import {
  assinaturaDaMesa,
  canalValido,
  criarPublicador,
  dadosNaMesa,
  montarLinkDaPagina,
} from "./mesa";

const doMestre: Dado = {
  id: "m1",
  faces: 10,
  mesa: "quadro",
  x: 10,
  y: 10,
  raio: 46,
  valor: 0,
  impulso: { x: 300, y: 0 },
  semente: 9,
  lancadoEm: 0,
};

const doJogador: RolagemDaMesa = {
  id: "r1",
  faces: 6,
  valor: 4,
  quando: 0,
  jogadorId: "ana",
  jogador: "Ana",
};

describe("dadosNaMesa", () => {
  it("lê os dois lados da mesa, com a face gravada e o valor da soma", () => {
    const [mestre, jogador] = dadosNaMesa([doMestre], [doJogador]);

    // O zero do d10 vale dez na soma, e continua zero na face.
    expect(mestre).toMatchObject({ origem: "mestre", mesa: "quadro", face: 0, valor: 10, impulso: { x: 300, y: 0 } });
    expect(jogador).toMatchObject({ origem: "jogador", mesa: "mapa", jogadorId: "ana", impulso: null });
  });

  it("a assinatura não muda quando o dado só anda pela mesa", () => {
    const parado = assinaturaDaMesa(dadosNaMesa([doMestre], []));
    const arrastado = assinaturaDaMesa(dadosNaMesa([{ ...doMestre, x: 500, y: 300 }], []));

    expect(arrastado).toBe(parado);
    expect(assinaturaDaMesa(dadosNaMesa([doMestre], [doJogador]))).not.toBe(parado);
  });
});

describe("criarPublicador", () => {
  it("o mais novo vence, e igual ao último não sai", async () => {
    const enviados: string[] = [];
    let soltar: () => void = () => {};
    const publicar = criarPublicador(
      (_rota, corpo) =>
        new Promise<void>((resolve) => {
          enviados.push(corpo);
          soltar = resolve;
        }),
    );

    publicar("obs", "dados", { n: 1 });
    publicar("obs", "dados", { n: 2 });
    publicar("obs", "dados", { n: 3 });
    expect(enviados).toEqual(['{"n":1}']);

    soltar();
    await Promise.resolve();
    await Promise.resolve();
    // O 2 foi trocado pelo 3 enquanto o 1 ia.
    expect(enviados).toEqual(['{"n":1}', '{"n":3}']);

    soltar();
    await Promise.resolve();
    await Promise.resolve();
    publicar("obs", "dados", { n: 3 });
    expect(enviados).toHaveLength(2);
  });

  it("recusa canal com nome torto", () => {
    expect(canalValido("dados")).toBe(true);
    expect(canalValido("../live")).toBe(false);
    expect(criarPublicador(async () => {})("obs", "Dados!", {})).toBe(false);
  });
});

describe("montarLinkDaPagina", () => {
  const extensao = {
    id: "obs",
    contribui: {
      paineis: [],
      comandos: [],
      ferramentas: [],
      camadas: [],
      paginas: [{ id: "camera", titulo: "Câmera", arquivo: "web/camera.html" }],
    },
  };

  it("leva o código e o que o plugin pediu na busca", () => {
    expect(
      montarLinkDaPagina({
        extensao,
        paginaId: "camera",
        codigo: "ABCDEF",
        base: "http://192.168.0.5:20200",
        busca: { quem: "ana" },
      }),
    ).toBe("http://192.168.0.5:20200/plugin/obs/web/camera.html?quem=ana&code=ABCDEF");
  });

  it("sem campanha, sem rede ou sem a página, não há link", () => {
    const base = { extensao, paginaId: "camera", codigo: "ABCDEF", base: "http://x" };

    expect(montarLinkDaPagina({ ...base, codigo: null })).toBeNull();
    expect(montarLinkDaPagina({ ...base, base: null })).toBeNull();
    expect(montarLinkDaPagina({ ...base, paginaId: "outra" })).toBeNull();
  });
});
