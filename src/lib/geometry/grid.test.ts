import { describe, expect, it } from "vitest";

import {
  casaDoItem,
  centroDaCasa,
  encaixarNaGrade,
  gradeDoEncaixe,
  ladrilhoHex,
  passoDaGrade,
  periodoDaGrade,
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
    const casa = casaDoItem({ ...token, x: 10, y: 10 }, grade());

    expect(casa.centro).toEqual({ x: 48, y: 48 });
    expect(casa.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 96, y: 0 },
      { x: 96, y: 96 },
      { x: 0, y: 96 },
    ]);
  });

  it("token maior que o quadrado ocupa a casa em que está plantado", () => {
    const gigante = { width: 300, height: 300, x: 0, y: 0 };
    // Centro em 150: a segunda casa da grade de 96, que vai de 96 a 192.
    expect(casaDoItem(gigante, grade()).vertices[0]).toEqual({ x: 96, y: 96 });
  });

  it("segue o deslocamento da grade, como o encaixe", () => {
    const g = grade({ size: 100, offsetX: 20, offsetY: 35 });
    const casa = casaDoItem({ width: 100, height: 100, x: 0, y: 0 }, g);

    expect(casa.vertices[0]).toEqual({ x: 20, y: 35 });
  });

  it("a casa do que foi encaixado é a casa em que ele pousou", () => {
    const g = grade({ snap: true });
    const pousado = encaixarNaGrade(token, 137, 42, g);
    const casa = casaDoItem({ ...token, ...pousado }, g);

    // O centro do token pousado é o centro da casa.
    expect(pousado.x + token.width / 2).toBe(casa.centro.x);
    expect(pousado.y + token.height / 2).toBe(casa.centro.y);
  });
});

/** Distância de centro a centro de 100: o raio do vértice é 100 / √3. */
const RAIO = 100 / Math.sqrt(3);

function perto(ponto: { x: number; y: number }, x: number, y: number) {
  expect(ponto.x).toBeCloseTo(x, 6);
  expect(ponto.y).toBeCloseTo(y, 6);
}

describe("grade de hexágonos", () => {
  const ponta = grade({ size: 100, forma: "hex-ponta" });
  const lado = grade({ size: 100, forma: "hex-lado" });

  it("a casa zero encosta a caixa no canto, como o quadrado zero", () => {
    // Ponta para cima: meia largura para o lado e um raio para baixo.
    perto(centroDaCasa({ x: 50, y: 50 }, ponta), 50, RAIO);
    // Deitado: os eixos trocados.
    perto(centroDaCasa({ x: 50, y: 50 }, lado), RAIO, 50);
  });

  it("a fileira de baixo nasce meia casa para o lado", () => {
    // Uma fileira abaixo são 1,5 raio; meia largura à direita da casa zero.
    perto(centroDaCasa({ x: 100, y: 150 }, ponta), 100, 2.5 * RAIO);
    perto(centroDaCasa({ x: 150, y: 100 }, lado), 2.5 * RAIO, 100);
  });

  it("vai sempre para o hexágono mais próximo, perto dos cantos inclusive", () => {
    // Onde três casas se encontram é que arredondar cada eixo sozinho erra.
    // Nenhum dos seis vizinhos da casa escolhida pode estar mais perto.
    const vizinhos = [
      [100, 0],
      [-100, 0],
      [50, 1.5 * RAIO],
      [-50, 1.5 * RAIO],
      [50, -1.5 * RAIO],
      [-50, -1.5 * RAIO],
    ];

    for (let x = -120; x <= 320; x += 7.3) {
      for (let y = -120; y <= 320; y += 7.3) {
        const centro = centroDaCasa({ x, y }, ponta);
        const ate = Math.hypot(x - centro.x, y - centro.y);

        for (const [dx, dy] of vizinhos) {
          const outro = Math.hypot(x - centro.x - dx!, y - centro.y - dy!);
          expect(ate).toBeLessThanOrEqual(outro + 1e-9);
        }
      }
    }
  });

  it("põe o CENTRO do token no meio do hexágono", () => {
    const cabe = { width: 40, height: 40 };

    perto(encaixarNaGrade(cabe, 20, 20, ponta), 30, RAIO - 20);
  });

  it("é idempotente nas duas orientações", () => {
    for (const g of [ponta, lado]) {
      const uma = encaixarNaGrade(token, 137, 242, g);
      expect(encaixarNaGrade(token, uma.x, uma.y, g)).toEqual(uma);
    }
  });

  it("casa negativa: o token acima e à esquerda da origem também tem casa", () => {
    // Uma fileira acima da casa zero, meia largura para a esquerda.
    perto(centroDaCasa({ x: 0, y: -30 }, ponta), 0, -0.5 * RAIO);
  });

  it("segue o deslocamento da grade", () => {
    const g = grade({ size: 100, offsetX: 20, offsetY: 35, forma: "hex-ponta" });
    perto(centroDaCasa({ x: 70, y: 90 }, g), 70, 35 + RAIO);
  });

  it("o realce tem seis vértices, a um raio do centro", () => {
    for (const g of [ponta, lado]) {
      const casa = casaDoItem({ ...token, x: 137, y: 242 }, g);

      expect(casa.vertices).toHaveLength(6);
      for (const v of casa.vertices) {
        expect(Math.hypot(v.x - casa.centro.x, v.y - casa.centro.y))
          .toBeCloseTo(RAIO, 6);
      }
    }

    // Ponta para cima: o primeiro vértice é a ponta. Deitado: o da esquerda.
    const emPe = casaDoItem({ ...token, x: 10, y: 10 }, ponta);
    perto(emPe.vertices[0]!, emPe.centro.x, emPe.centro.y - RAIO);
    const deitado = casaDoItem({ ...token, x: 10, y: 10 }, lado);
    perto(deitado.vertices[0]!, deitado.centro.x - RAIO, deitado.centro.y);
  });
});

describe("periodoDaGrade", () => {
  it("o lado, no quadrado", () => {
    expect(periodoDaGrade(grade())).toEqual({ x: 96, y: 96 });
  });

  it("duas fileiras na vertical, com a ponta para cima", () => {
    const p = periodoDaGrade(grade({ size: 100, forma: "hex-ponta" }));
    expect(p.x).toBe(100);
    expect(p.y).toBeCloseTo(100 * Math.sqrt(3), 9);
  });

  it("os eixos trocados, deitado", () => {
    const p = periodoDaGrade(grade({ size: 100, forma: "hex-lado" }));
    expect(p.x).toBeCloseTo(100 * Math.sqrt(3), 9);
    expect(p.y).toBe(100);
  });
});

describe("ladrilhoHex", () => {
  it("nada no quadrado, que se desenha com retângulos", () => {
    expect(ladrilhoHex(grade())).toBeNull();
  });

  it("um período de cada lado, com o canto no resto do deslocamento", () => {
    const g = grade({ size: 100, offsetX: 130, offsetY: -10, forma: "hex-ponta" });
    const ladrilho = ladrilhoHex(g)!;
    const periodo = periodoDaGrade(g);

    expect(ladrilho.width).toBe(periodo.x);
    expect(ladrilho.height).toBe(periodo.y);
    expect(ladrilho.x).toBeCloseTo(30, 9);
    // Negativo vira positivo: o padrão do SVG não aceita origem negativa.
    expect(ladrilho.y).toBeCloseTo(periodo.y - 10, 9);
  });

  it("desenha as seis casas que tocam o ladrilho", () => {
    const ladrilho = ladrilhoHex(grade({ forma: "hex-lado" }))!;
    expect(ladrilho.caminho.match(/M/g)).toHaveLength(6);
  });
});
