import { describe, expect, it } from "vitest";

import { esticar } from "@/lib/store/use-window-store";

const inicio = { x: 200, y: 100, largura: 400, altura: 300 };
const limites = { largura: 1200, altura: 800 };
const atual = { largura: 400, altura: 300 };

describe("esticar", () => {
  it("pela direita e por baixo só muda o tamanho", () => {
    expect(esticar(inicio, { x: 50, y: 20 }, "sl", limites, atual)).toEqual({
      x: 200,
      y: 100,
      largura: 450,
      altura: 320,
    });
  });

  it("pela esquerda move o canto e deixa a borda direita parada", () => {
    const geometria = esticar(inicio, { x: -50, y: 0 }, "o", limites, atual);

    expect(geometria).toEqual({ x: 150, y: 100, largura: 450, altura: 300 });
    expect(geometria.x + geometria.largura!).toBe(inicio.x + inicio.largura);
  });

  it("por cima move o canto e deixa a borda de baixo parada", () => {
    const geometria = esticar(inicio, { x: 0, y: 40 }, "n", limites, atual);

    expect(geometria).toEqual({ x: 200, y: 140, largura: 400, altura: 260 });
    expect(geometria.y + geometria.altura!).toBe(inicio.y + inicio.altura);
  });

  it("pelo canto de cima e à esquerda mexe nos dois eixos", () => {
    expect(esticar(inicio, { x: -20, y: -30 }, "no", limites, atual)).toEqual({
      x: 180,
      y: 70,
      largura: 420,
      altura: 330,
    });
  });

  it("no mínimo a borda oposta não escorrega junto com o ponteiro", () => {
    const geometria = esticar(inicio, { x: 1000, y: 1000 }, "no", limites, atual);

    expect(geometria.largura).toBe(224);
    expect(geometria.altura).toBe(140);
    expect(geometria.x + geometria.largura!).toBe(600);
    expect(geometria.y + geometria.altura!).toBe(400);
  });

  it("pela esquerda e por cima para no zero da camada", () => {
    const geometria = esticar(inicio, { x: -1000, y: -1000 }, "no", limites, atual);

    expect(geometria).toEqual({ x: 0, y: 0, largura: 600, altura: 400 });
  });

  it("não passa do que o CSS deixa aparecer", () => {
    const geometria = esticar(inicio, { x: 5000, y: 5000 }, "sl", limites, atual);

    expect(geometria.largura).toBe(1184);
    expect(geometria.altura).toBe(784);
  });

  it("o eixo que a borda não toca sai como entrou, mesmo ausente", () => {
    expect(
      esticar(inicio, { x: 30, y: 999 }, "l", limites, { largura: undefined, altura: undefined }),
    ).toEqual({ x: 200, y: 100, largura: 430, altura: undefined });

    expect(
      esticar(inicio, { x: 999, y: 30 }, "s", limites, { largura: undefined, altura: undefined }),
    ).toEqual({ x: 200, y: 100, largura: undefined, altura: 330 });
  });
});
