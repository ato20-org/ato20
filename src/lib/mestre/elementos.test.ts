import { describe, expect, it } from "vitest";

import { camposDaParedeNova } from "@/lib/mestre/elementos";
import {
  METROS_DA_PAREDE_PADRAO,
  UNIDADES_POR_METRO,
} from "@/lib/geometry/sombra";

describe("camposDaParedeNova", () => {
  it("a parede de sempre não grava campo nenhum", () => {
    expect(
      camposDaParedeNova(
        { metros: METROS_DA_PAREDE_PADRAO, comTeto: true },
        "retangulo",
      ),
    ).toEqual({});
  });

  it("altura em metros vira unidade de cena; sem teto e cor gravam", () => {
    expect(
      camposDaParedeNova(
        { metros: 4, comTeto: false, cor: "#78716c" },
        "poligono",
      ),
    ).toEqual({ altura: 4 * UNIDADES_POR_METRO, semTeto: true, cor: "#78716c" });
  });

  it("a linha não tem miolo: nasce sem o campo do teto", () => {
    expect(
      camposDaParedeNova(
        { metros: METROS_DA_PAREDE_PADRAO, comTeto: false },
        "linha",
      ),
    ).toEqual({});
  });
});
