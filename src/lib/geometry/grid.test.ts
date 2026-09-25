import { describe, expect, it } from "vitest";

import {
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
