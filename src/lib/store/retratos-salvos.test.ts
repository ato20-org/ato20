import { describe, expect, it } from "vitest";

import { lerRetratosSalvos } from "./use-portrait-store";

/**
 * O arquivo COMO ELE ESTÁ NO DISCO, copiado de uma campanha de verdade.
 *
 * Copiado e não montado à mão: o defeito que este teste persegue era "reiniciei
 * e perdi tudo", e um objeto montado aqui provaria só que a função concorda com
 * o que eu imagino que o disco tem. Ver `retratos.json` em `floresta-brutal`.
 */
const DO_DISCO = {
  ancoraPadrao: "cima-esquerda",
  layout: { dados: true, medidores: true, retrato: true },
  retratos: [
    {
      assetId: "2501c59b-4844-4876-81cd-a7dd54207b1e",
      height: 0.34,
      id: "30ee7a4f-75e5-4455-85ea-12d2008ca7d6",
      personagemId: "30ee7a4f-75e5-4455-85ea-12d2008ca7d6",
      visible: true,
      width: 0.19125,
      x: 0.03,
      y: 0.03,
    },
    {
      assetId: "cd722c5c-e0c6-4f76-99f1-c5c498d6e210",
      height: 0.34,
      id: "9a7a616c-579a-4f06-b28b-029b21f0a0a2",
      personagemId: "9a7a616c-579a-4f06-b28b-029b21f0a0a2",
      visible: true,
      width: 0.19125,
      x: 0.389,
      y: 0.03,
    },
  ],
  unioes: [
    {
      ancora: "cima-esquerda",
      cor: "#ef4444",
      folga: 0.015,
      id: "40a618de-9bd8-4d23-b54e-e313fa916744",
      nome: "União 1",
      retratos: [
        "30ee7a4f-75e5-4455-85ea-12d2008ca7d6",
        "9a7a616c-579a-4f06-b28b-029b21f0a0a2",
      ],
    },
  ],
};

describe("lerRetratosSalvos", () => {
  it("devolve os retratos do disco, no ar", () => {
    const lido = lerRetratosSalvos(DO_DISCO);

    expect(lido.portraits).toHaveLength(2);
    expect(lido.portraits.every((retrato) => retrato.visible)).toBe(true);
  });

  it("devolve a união com os dois membros", () => {
    const lido = lerRetratosSalvos(DO_DISCO);

    expect(lido.unioes).toHaveLength(1);
    expect(lido.unioes[0]?.retratos).toHaveLength(2);
  });

  it("devolve o layout e a área que o mestre escolheu", () => {
    const lido = lerRetratosSalvos(DO_DISCO);

    expect(lido.layout).toEqual({
      retrato: true,
      medidores: true,
      dados: true,
      escalaMedidores: 1,
      escalaDados: 1,
    });
    expect(lido.ancoraPadrao).toBe("cima-esquerda");
  });

  it("campanha sem arquivo abre vazia e no padrão", () => {
    const lido = lerRetratosSalvos(null);

    expect(lido.portraits).toEqual([]);
    expect(lido.ancoraPadrao).toBe("baixo-esquerda");
  });

  it("arquivo sem layout nenhum abre mostrando tudo", () => {
    // A campanha gravada antes desta feature. Ela não pode reabrir com peça
    // desligada, que seria uma tela diferente sem ninguém ter pedido.
    const lido = lerRetratosSalvos({ retratos: DO_DISCO.retratos, unioes: [] });

    expect(lido.layout).toEqual({
      retrato: true,
      medidores: true,
      dados: true,
      escalaMedidores: 1,
      escalaDados: 1,
    });
  });

  it("layout parcial no disco completa com o padrão", () => {
    const lido = lerRetratosSalvos({
      retratos: [],
      unioes: [],
      layout: { retrato: false },
    });

    expect(lido.layout).toEqual({
      retrato: false,
      medidores: true,
      dados: true,
      escalaMedidores: 1,
      escalaDados: 1,
    });
  });
});
