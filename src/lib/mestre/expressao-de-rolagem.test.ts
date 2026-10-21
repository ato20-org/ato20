import { describe, expect, it } from "vitest";

import {
  lerExpressaoDeRolagem,
  textoDaExpressao,
  textoDoModificador,
  type ExpressaoDeRolagem,
} from "@/lib/mestre/expressao-de-rolagem";

import casos from "./expressao-de-rolagem.casos.json";

function lida(texto: string): ExpressaoDeRolagem {
  const leitura = lerExpressaoDeRolagem(texto);
  if (!leitura.ok) throw new Error(`${texto}: ${leitura.erro}`);
  return leitura.expressao;
}

// Os casos moram num JSON que o `cargo test` também lê: o daemon tem o
// próprio leitor, para rolar o detalhe que o celular pede, e os dois têm de
// aceitar e recusar as mesmas coisas. Ver `serve/expressao.rs`.
describe("lerExpressaoDeRolagem", () => {
  it.each(casos.aceitas.map((caso) => [caso.texto, caso.dados, caso.modificador] as const))(
    "%j",
    (texto, dados, modificador) => {
      expect(lida(texto)).toEqual({
        // O terceiro, quando há, é o que fica do termo: `>` o maior, `<` o menor.
        dados: dados.map(([quantidade, faces, manter]) => ({
          quantidade,
          faces,
          ...(manter && { manter: manter === ">" ? "maior" : "menor" }),
        })),
        modificador,
      });
    },
  );

  it.each(casos.recusadas.map((caso) => [caso.texto, caso.erro] as const))(
    "%j é recusada por %s",
    (texto, erro) => {
      expect(lerExpressaoDeRolagem(texto)).toEqual({ ok: false, erro });
    },
  );
});

describe("textoDaExpressao", () => {
  it("escreve a forma curta", () => {
    expect(textoDaExpressao(lida("1d20+5-2*5/2"))).toBe("1d20");
    expect(textoDaExpressao(lida("2d6 + 1d4 + 3"))).toBe("2d6+1d4+3");
    expect(textoDaExpressao(lida("d20-2"))).toBe("1d20-2");
  });

  it("o modificador zero some", () => {
    expect(textoDoModificador(0)).toBe("");
    expect(textoDoModificador(5)).toBe("+5");
    expect(textoDoModificador(-2)).toBe("-2");
  });
});

describe("as siglas dos atributos dentro da conta", () => {
  const ficha = [
    { sigla: "FOR", valor: 4 },
    { sigla: "AGI", valor: 3 },
    { sigla: "AG", valor: 9 },
    { sigla: "DES", valor: -2 },
    { sigla: "VIG", valor: 0 },
  ];
  const comFicha = (texto: string) => lerExpressaoDeRolagem(texto, ficha);

  it("vale o número dela como parcela", () => {
    expect(comFicha("1d20+FOR")).toEqual({
      ok: true,
      expressao: { dados: [{ quantidade: 1, faces: 20 }], modificador: 4 },
      siglas: [{ sigla: "FOR", valor: 4 }],
    });
    expect(comFicha("2d6+FOR*2")).toMatchObject({ expressao: { modificador: 8 } });
    expect(comFicha("1d4+(FOR+AGI)/2")).toMatchObject({ expressao: { modificador: 3 } });
  });

  it("colada no dado, é a quantidade: o teste do Ordem", () => {
    expect(comFicha("AGId20>+5")).toEqual({
      ok: true,
      expressao: { dados: [{ quantidade: 3, faces: 20, manter: "maior" }], modificador: 5 },
      siglas: [{ sigla: "AGI", valor: 3 }],
    });
    expect(comFicha("AGI d20 >")).toMatchObject({ expressao: { dados: [{ quantidade: 3, faces: 20, manter: "maior" }] } });
  });

  it("sem diferenciar maiúscula, e a sigla mais comprida primeiro", () => {
    expect(comFicha("1d20+for")).toMatchObject({ expressao: { modificador: 4 } });
    expect(comFicha("1d20+AGI")).toMatchObject({ expressao: { modificador: 3 } });
    expect(comFicha("1d20+AG")).toMatchObject({ expressao: { modificador: 9 } });
  });

  it("a sigla que começa com D não vira dado, e o valor negativo entra na conta", () => {
    expect(comFicha("1d20+DES")).toMatchObject({ expressao: { modificador: -2 } });
    expect(comFicha("1d20-DES")).toMatchObject({ expressao: { modificador: 2 } });
  });

  it("cada sigla aparece uma vez, na ordem em que a conta a leu", () => {
    const leitura = comFicha("AGId20+FOR+FOR");
    expect(leitura.ok && leitura.siglas).toEqual([
      { sigla: "AGI", valor: 3 },
      { sigla: "FOR", valor: 4 },
    ]);
  });

  it("quantidade zero ou negativa não rola", () => {
    expect(comFicha("VIGd20>")).toEqual({ ok: false, erro: "sintaxe" });
    expect(comFicha("DESd20")).toEqual({ ok: false, erro: "sintaxe" });
  });

  it("a sigla que a ficha não tem é recusada, e sem ficha nenhuma também", () => {
    expect(comFicha("1d20+INT")).toEqual({ ok: false, erro: "sintaxe" });
    expect(lerExpressaoDeRolagem("1d20+FOR")).toEqual({ ok: false, erro: "sintaxe" });
  });

  it("onde as duas leituras servem, o dado vence", () => {
    expect(lerExpressaoDeRolagem("d20", [{ sigla: "D", valor: 5 }])).toEqual({
      ok: true,
      expressao: { dados: [{ quantidade: 1, faces: 20 }], modificador: 0 },
    });
    expect(lerExpressaoDeRolagem("Dd6", [{ sigla: "D", valor: 2 }])).toMatchObject({
      expressao: { dados: [{ quantidade: 2, faces: 6 }] },
    });
  });

  it("sem sigla, a conta lê igual com ou sem a ficha", () => {
    expect(comFicha("6d20>+45")).toEqual(lerExpressaoDeRolagem("6d20>+45"));
  });
});

describe("a sigla do atributo que é um dado", () => {
  const ficha = [
    { sigla: "AGI", valor: 0, rolagem: "1d8" },
    { sigla: "FOR", valor: 2 },
  ];

  it("sozinha, rola o dado dela", () => {
    expect(lerExpressaoDeRolagem("AGI", ficha)).toMatchObject({
      ok: true,
      expressao: { dados: [{ quantidade: 1, faces: 8 }], modificador: 0 },
    });
  });

  it("na conta, entra como os outros termos", () => {
    expect(lerExpressaoDeRolagem("AGI+2", ficha)).toMatchObject({
      expressao: { dados: [{ quantidade: 1, faces: 8 }], modificador: 2 },
    });
    expect(lerExpressaoDeRolagem("1d20+AGI+FOR", ficha)).toMatchObject({
      expressao: {
        dados: [
          { quantidade: 1, faces: 20 },
          { quantidade: 1, faces: 8 },
        ],
        modificador: 2,
      },
    });
  });

  it("dado não conta dados, nem se multiplica", () => {
    expect(lerExpressaoDeRolagem("AGId20", ficha)).toEqual({ ok: false, erro: "sintaxe" });
    expect(lerExpressaoDeRolagem("AGI*2", ficha)).toEqual({ ok: false, erro: "dado-fora-da-soma" });
  });
});
