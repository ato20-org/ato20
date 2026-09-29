import { describe, expect, it } from "vitest";

import { juntar } from "./lote-de-medidores";

describe("juntar", () => {
  it("duas mudanças no mesmo medidor viram uma, com a de depois vencendo", () => {
    const lote = juntar([
      { personagemId: "p", medidorId: "m", patch: { atual: 5, nome: "Vida" } },
      { personagemId: "p", medidorId: "m", patch: { atual: 3 } },
    ]);

    expect(lote).toEqual([
      { personagemId: "p", medidorId: "m", patch: { atual: 3, nome: "Vida" } },
    ]);
  });

  it("medidores diferentes ficam separados, na ordem de chegada", () => {
    const lote = juntar([
      { personagemId: "a", medidorId: "m", patch: { atual: 1 } },
      { personagemId: "b", medidorId: "m", patch: { atual: 2 } },
      { personagemId: "a", medidorId: "n", patch: { atual: 3 } },
    ]);

    expect(lote.map((m) => `${m.personagemId}/${m.medidorId}`)).toEqual([
      "a/m",
      "b/m",
      "a/n",
    ]);
  });

  it("um patch vazio de depois não apaga o de antes", () => {
    // `undefined` explícito não é valor: espalhar `{atual: undefined}` por
    // cima apagaria o 5, e o Rust leria "não mexe" onde o plugin quis 5.
    const lote = juntar([
      { personagemId: "p", medidorId: "m", patch: { atual: 5 } },
      { personagemId: "p", medidorId: "m", patch: {} },
    ]);

    expect(lote[0].patch).toEqual({ atual: 5 });
  });
});
