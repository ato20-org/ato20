import { describe, expect, it } from "vitest";

import {
  ajusteDeImagemDe,
  ajusteNeutro,
  ajusteParaGuardar,
  compor,
  filtroDaImagem,
} from "@/lib/imagem-do-espectador";

const NEUTRO = { brilho: 100, contraste: 100, saturacao: 100, matiz: 0 };

describe("ajusteDeImagemDe", () => {
  it("o que falta ou não presta vira o neutro", () => {
    expect(ajusteDeImagemDe(undefined)).toEqual(NEUTRO);
    expect(ajusteDeImagemDe("claro")).toEqual(NEUTRO);
    expect(
      ajusteDeImagemDe({ brilho: "120", contraste: Number.NaN, matiz: null }),
    ).toEqual(NEUTRO);
  });

  it("corta na faixa da régua", () => {
    expect(ajusteDeImagemDe({ brilho: 900, saturacao: -5, matiz: 400 })).toEqual({
      ...NEUTRO,
      brilho: 200,
      saturacao: 0,
      matiz: 180,
    });
  });
});

describe("ajusteParaGuardar", () => {
  it("guarda só o que difere do neutro", () => {
    expect(ajusteParaGuardar({ ...NEUTRO, brilho: 130 })).toEqual({
      brilho: 130,
    });
  });

  it("tudo neutro não guarda nada", () => {
    expect(ajusteParaGuardar(NEUTRO)).toBeUndefined();
    expect(ajusteParaGuardar({})).toBeUndefined();
    expect(ajusteNeutro(undefined)).toBe(true);
    expect(ajusteNeutro({ matiz: 10 })).toBe(false);
  });
});

describe("compor", () => {
  it("sem cena, vale a campanha; sem campanha, vale a cena", () => {
    expect(compor({ brilho: 120 }, undefined)).toEqual({ ...NEUTRO, brilho: 120 });
    expect(compor(undefined, { saturacao: 0 })).toEqual({
      ...NEUTRO,
      saturacao: 0,
    });
  });

  it("multiplica brilho, contraste e saturação", () => {
    const composto = compor(
      { brilho: 120, contraste: 150, saturacao: 50 },
      { brilho: 70, contraste: 80, saturacao: 200 },
    );

    expect(composto.brilho).toBeCloseTo(84);
    expect(composto.contraste).toBeCloseTo(120);
    expect(composto.saturacao).toBeCloseTo(100);
  });

  it("não corta o que passa da régua", () => {
    expect(compor({ brilho: 200 }, { brilho: 200 }).brilho).toBe(400);
  });

  it("soma o matiz e dá a volta", () => {
    expect(compor({ matiz: 30 }, { matiz: -50 }).matiz).toBe(-20);
    expect(compor({ matiz: 170 }, { matiz: 20 }).matiz).toBe(-170);
    expect(compor({ matiz: 180 }, { matiz: 180 }).matiz).toBe(0);
    expect(compor({ matiz: -90 }, { matiz: -90 }).matiz).toBe(180);
  });
});

describe("filtroDaImagem", () => {
  it("neutro não tem filtro nenhum", () => {
    expect(filtroDaImagem(NEUTRO)).toBeUndefined();
  });

  it("só os canais mexidos, na ordem da régua", () => {
    expect(filtroDaImagem({ ...NEUTRO, matiz: -40, brilho: 125 })).toBe(
      "brightness(1.25) hue-rotate(-40deg)",
    );
    expect(
      filtroDaImagem({ brilho: 100, contraste: 80, saturacao: 0, matiz: 0 }),
    ).toBe("contrast(0.8) saturate(0)");
  });
});
