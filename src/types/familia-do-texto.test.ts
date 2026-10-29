import { describe, expect, it } from "vitest";

import {
  familiaDoTexto,
  patchDaFamilia,
  semIdDoTexto,
  type Texto,
} from "@/types/scene";

describe("familiaDoTexto", () => {
  it("o texto antigo com `aMao` é de mão, sem migração", () => {
    expect(familiaDoTexto({ aMao: true })).toBe("mao");
  });

  it("sem nenhum dos dois, a da interface", () => {
    expect(familiaDoTexto({})).toBe("interface");
  });

  it("a família gravada manda", () => {
    expect(familiaDoTexto({ familia: "codigo" })).toBe("codigo");
  });
});

describe("patchDaFamilia", () => {
  it("só o código grava o campo novo", () => {
    expect(patchDaFamilia("codigo")).toEqual({ familia: "codigo", aMao: undefined });
  });

  it("a mão continua sendo o `aMao` de sempre", () => {
    expect(patchDaFamilia("mao")).toEqual({ familia: undefined, aMao: true });
  });

  it("a interface é a ausência dos dois", () => {
    expect(patchDaFamilia("interface")).toEqual({
      familia: undefined,
      aMao: undefined,
    });
  });

  it("ida e volta: o patch lido dá a família pedida", () => {
    for (const familia of ["interface", "mao", "codigo"] as const) {
      expect(familiaDoTexto(patchDaFamilia(familia))).toBe(familia);
    }
  });
});

describe("semIdDoTexto", () => {
  it("a cópia leva a família, o alinhamento e a opacidade", () => {
    const texto: Texto = {
      id: "t",
      x: 0,
      y: 0,
      texto: "Taverna",
      tamanho: 40,
      familia: "codigo",
      alinhamento: "centro",
      opacidade: 0.5,
    };

    expect(semIdDoTexto(texto)).toMatchObject({
      familia: "codigo",
      alinhamento: "centro",
      opacidade: 0.5,
    });
  });
});
