import { describe, expect, it } from "vitest";

import {
  camadasDaFigura,
  definicaoDoEfeito,
  EFEITOS_DE_FABRICA,
  efeitoValido,
} from "./efeitos";

describe("EFEITOS_DE_FABRICA", () => {
  it("mantém os ids de antes do catálogo", () => {
    // Uma campanha gravada antes dele abre com os mesmos efeitos.
    for (const id of ["aura", "tingido", "translucido", "tremendo", "apagado"]) {
      expect(definicaoDoEfeito(id)?.id).toBe(id);
    }
  });

  it("tem ids únicos e com a forma que o Rust aceita", () => {
    const ids = EFEITOS_DE_FABRICA.map((efeito) => efeito.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(efeitoValido)).toBe(true);
  });
});

describe("efeitoValido", () => {
  it("aceita um slug ou dois, como `efeito_valido`", () => {
    expect(efeitoValido("aura")).toBe(true);
    expect(efeitoValido("ordem-paranormal/sangue")).toBe(true);

    expect(efeitoValido("")).toBe(false);
    expect(efeitoValido("Aura")).toBe(false);
    expect(efeitoValido("/aura")).toBe(false);
    expect(efeitoValido("a/b/c")).toBe(false);
    expect(efeitoValido(7)).toBe(false);
  });
});

describe("camadasDaFigura", () => {
  it("o tingido é tinta na cor da condição, na força de fábrica", () => {
    expect(camadasDaFigura([{ efeito: "tingido", cor: "#22c55e" }])).toEqual({
      tinta: { cor: "#22c55e", forca: 0.5 },
      cinza: false,
      translucido: false,
      tremor: false,
    });
  });

  it("a primeira que pede uma camada fica com ela", () => {
    // Hoje chega um pedido só; isto é o que deixa voltar a compor.
    const camadas = camadasDaFigura([
      { efeito: "aura", cor: "#f59e0b" },
      { efeito: "aura", cor: "#a855f7" },
      { efeito: "apagado", cor: "#ef4444" },
    ]);

    expect(camadas.halo).toBe("#f59e0b");
    expect(camadas.cinza).toBe(true);
  });

  it("acha o efeito de plugin no que veio de fora", () => {
    const deFora = {
      "ordem/sangrando": { id: "ordem/sangrando", titulo: "Sangrando", figura: { tinta: 0.8, tremor: true } },
    };

    expect(camadasDaFigura([{ efeito: "ordem/sangrando", cor: "#ef4444" }], deFora)).toEqual({
      tinta: { cor: "#ef4444", forca: 0.8 },
      cinza: false,
      translucido: false,
      tremor: true,
    });
  });

  it("o que veio de fora não toma o lugar da fábrica, nem acha herança de objeto", () => {
    const deFora = { aura: { id: "aura", titulo: "Falsa", figura: { cinza: true } } };

    expect(definicaoDoEfeito("aura", deFora)?.titulo).toBe("Aura");
    expect(definicaoDoEfeito("toString", {})).toBeUndefined();
  });

  it("id que o catálogo não conhece não ocupa camada", () => {
    expect(camadasDaFigura([{ efeito: "plugin/nada", cor: "#fff" }])).toEqual({
      cinza: false,
      translucido: false,
      tremor: false,
    });
  });
});
