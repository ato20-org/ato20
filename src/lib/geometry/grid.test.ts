import { describe, expect, it } from "vitest";

import {
  casaDoItem,
  encaixarNaGrade,
  gradeDoEncaixe,
  passoDaGrade,
} from "@/lib/geometry/grid";
import { DEFAULT_GRID, type SceneGrid } from "@/types/scene";

function grade(parcial: Partial<SceneGrid> = {}): SceneGrid {
  return { ...DEFAULT_GRID, ...parcial };
}

/** Um token de 80, na grade padrão de 96. */
const token = { width: 80, height: 80 };

describe("gradeDoEncaixe", () => {
  it("nada sem grade nenhuma", () => {
    expect(gradeDoEncaixe({ grid: undefined })).toBeUndefined();
  });

  it("nada com a grade desenhada mas o ímã desligado", () => {
    expect(gradeDoEncaixe({ grid: grade() })).toBeUndefined();
  });

  it("a grade quando o mestre ligou o ímã", () => {
    const grid = grade({ snap: true });
    expect(gradeDoEncaixe({ grid })).toBe(grid);
  });
});

describe("encaixarNaGrade", () => {
  it("põe o CENTRO do token no meio do quadrado, não o canto", () => {
    // Centro em 50: cai na primeira casa, cujo meio é 48. O canto sai 40 atrás.
    expect(encaixarNaGrade(token, 10, 10, grade())).toEqual({ x: 8, y: 8 });
  });

  it("token do tamanho do quadrado cai sobre a linha desenhada", () => {
    const quadrado = { width: 96, height: 96 };
    expect(encaixarNaGrade(quadrado, 100, 40, grade())).toEqual({
      x: 96,
      y: 0,
    });
  });

  it("vai para a casa mais próxima, para trás inclusive", () => {
    const g = grade({ size: 100 });
    const cem = { width: 100, height: 100 };

    expect(encaixarNaGrade(cem, 149, 151, g)).toEqual({ x: 100, y: 200 });
  });

  it("segue o deslocamento da grade", () => {
    const g = grade({ size: 100, offsetX: 20, offsetY: 35 });
    const cem = { width: 100, height: 100 };

    expect(encaixarNaGrade(cem, 0, 0, g)).toEqual({ x: 20, y: 35 });
  });

  it("é idempotente: encaixar o que já está encaixado não move nada", () => {
    const g = grade({ snap: true });
    const uma = encaixarNaGrade(token, 137, 42, g);

    expect(encaixarNaGrade(token, uma.x, uma.y, g)).toEqual(uma);
  });

  it("casa negativa: o token à esquerda da origem também tem casa", () => {
    const g = grade({ size: 100 });
    const cem = { width: 100, height: 100 };

    expect(encaixarNaGrade(cem, -90, -110, g)).toEqual({ x: -100, y: -100 });
  });

  it("usa o mesmo mínimo de 8 com que a grade é desenhada", () => {
    expect(passoDaGrade(grade({ size: 0 }))).toBe(8);
    // Sem o mínimo, a conta dividiria por zero e o token sumiria do mapa.
    expect(encaixarNaGrade({ width: 8, height: 8 }, 3, 3, grade({ size: 0 })))
      .toEqual({ x: 0, y: 0 });
  });
});

describe("casaDoItem", () => {
  it("a casa é a que contém o CENTRO do token", () => {
    // Token de 80 largado em 10: o centro cai em 50, dentro da primeira casa.
    expect(casaDoItem({ ...token, x: 10, y: 10 }, grade())).toEqual({
      x: 0,
      y: 0,
      lado: 96,
    });
  });

  it("token maior que o quadrado ocupa a casa em que está plantado", () => {
    const gigante = { width: 300, height: 300, x: 0, y: 0 };
    // Centro em 150: a segunda casa da grade de 96, que vai de 96 a 192.
    expect(casaDoItem(gigante, grade())).toEqual({ x: 96, y: 96, lado: 96 });
  });

  it("segue o deslocamento da grade, como o encaixe", () => {
    const g = grade({ size: 100, offsetX: 20, offsetY: 35 });
    expect(casaDoItem({ width: 100, height: 100, x: 0, y: 0 }, g)).toEqual({
      x: 20,
      y: 35,
      lado: 100,
    });
  });

  it("a casa do que foi encaixado é a casa em que ele pousou", () => {
    const g = grade({ snap: true });
    const pousado = encaixarNaGrade(token, 137, 42, g);
    const casa = casaDoItem({ ...token, ...pousado }, g);

    // O centro do token pousado é o centro da casa.
    expect(pousado.x + token.width / 2).toBe(casa.x + casa.lado / 2);
    expect(pousado.y + token.height / 2).toBe(casa.y + casa.lado / 2);
  });
});
