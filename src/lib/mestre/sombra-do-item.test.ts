import { describe, expect, it } from "vitest";

import { patchDaSombra } from "@/lib/mestre/item-actions";

describe("patchDaSombra", () => {
  it("vista de cima grava o modo, e nada mais", () => {
    expect(patchDaSombra({}, { modo: "inteira" })).toEqual({
      sombra: { modo: "inteira" },
      semSombra: undefined,
    });
  });

  it("voltar a ficar em pé sem linha apaga o campo: é o padrão", () => {
    expect(
      patchDaSombra({ sombra: { modo: "inteira" } }, { modo: "base" }).sombra,
    ).toBeUndefined();
  });

  it("Nenhuma liga o interruptor sem esquecer o jeito de deitar", () => {
    expect(
      patchDaSombra(
        { sombra: { modo: "base", base: 0.8 } },
        { modo: "nenhuma" },
      ),
    ).toEqual({ sombra: { modo: "base", base: 0.8 }, semSombra: true });
  });

  it("escolher um jeito de novo desliga o interruptor", () => {
    expect(
      patchDaSombra(
        { sombra: { modo: "base", base: 0.8 }, semSombra: true },
        { modo: "base" },
      ),
    ).toEqual({ sombra: { modo: "base", base: 0.8 }, semSombra: undefined });
  });

  it("mexer na linha não mexe no interruptor nem no modo", () => {
    expect(
      patchDaSombra({ semSombra: true }, { base: 0.7 }),
    ).toEqual({ sombra: { modo: "base", base: 0.7 }, semSombra: true });
  });

  it("`null` devolve a linha ao forno", () => {
    expect(
      patchDaSombra({ sombra: { modo: "base", base: 0.7 } }, { base: null })
        .sombra,
    ).toBeUndefined();
  });

  it("a altura fica guardada quando o item volta a ficar em pé", () => {
    expect(
      patchDaSombra(
        { sombra: { modo: "inteira", altura: 2 } },
        { modo: "base" },
      ).sombra,
    ).toEqual({ modo: "base", altura: 2 });
  });
});
