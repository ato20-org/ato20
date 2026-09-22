import { describe, expect, it } from "vitest";

import { caixaDoTraco } from "@/lib/geometry/limites";
import {
  caixaDoPapel,
  deslocamentoPreso,
  empurrarDocumentos,
  empurrarPostits,
  empurrarTracos,
} from "@/lib/mestre/grupo-sem-alca";
import { SCENE_WIDTH, type Documento, type Postit, type Traco } from "@/types/scene";

const postit = (x: number, y: number): Postit => ({
  id: `p${x}-${y}`,
  x,
  y,
  largura: 260,
  altura: 180,
  texto: "",
  cor: "amarelo",
});

const cartao = (x: number, y: number): Documento =>
  ({
    id: `d${x}-${y}`,
    x,
    y,
    largura: 420,
    altura: 320,
    arquivo: "nota.md",
    titulo: "Nota",
  }) as Documento;

const risco = (pontos: number[]): Traco => ({
  id: "r1",
  pontos,
  cor: "#fff",
  espessura: 6,
});

describe("empurrar o que só anda", () => {
  it("o papel e o cartão andam pelo mesmo deslocamento", () => {
    expect(empurrarPostits([postit(10, 20)], 5, -7)[0]!.patch).toEqual({
      x: 15,
      y: 13,
    });
    expect(empurrarDocumentos([cartao(0, 0)], 30, 40)[0]!.patch).toEqual({
      x: 30,
      y: 40,
    });
  });

  it("o risco desloca x nos pares e y nos ímpares", () => {
    const [patch] = empurrarTracos([risco([0, 0, 10, 20])], 3, -4);

    expect(patch!.patch.pontos).toEqual([3, -4, 13, 16]);
  });

  it("o risco empurrado nasce numa lista nova, sem mexer na de origem", () => {
    const original = risco([1, 2, 3, 4]);
    empurrarTracos([original], 100, 100);

    expect(original.pontos).toEqual([1, 2, 3, 4]);
  });
});

describe("caixaDoTraco", () => {
  it("cerca os pontos, e não o plano", () => {
    expect(caixaDoTraco(risco([10, 40, 30, 5]))).toEqual({
      minX: 10,
      minY: 5,
      maxX: 30,
      maxY: 40,
    });
  });

  it("risco sem ponto nenhum não tem caixa", () => {
    expect(caixaDoTraco(risco([]))).toBeNull();
  });
});

describe("deslocamentoPreso", () => {
  it("sem papel na mão, o passo é o que veio", () => {
    expect(deslocamentoPreso([], 999, -999)).toEqual({ dx: 999, dy: -999 });
  });

  it("o papel mais perto da borda encurta o passo do grupo inteiro", () => {
    // A área de trabalho vai até SCENE_WIDTH + FOLGA_X, e a folga é um plano
    // inteiro: o papel colado na beirada direita só tem 10 unidades de sobra.
    const naBeirada = postit(2 * SCENE_WIDTH - 260 - 10, 0);
    const passo = deslocamentoPreso([postit(0, 0), naBeirada], 500, 0);

    expect(passo).toEqual({ dx: 10, dy: 0 });
  });

  it("a cerca encurta o passo, nunca inverte o sentido", () => {
    // Papel gravado fora da área -- arquivo antigo. Empurrar para longe não
    // pode virar um salto para trás.
    const foraDaArea = postit(5 * SCENE_WIDTH, 0);
    const passo = deslocamentoPreso([foraDaArea], 100, 0);

    expect(passo.dx).toBe(0);
  });

  it("a caixa do papel é a que a área de seleção mira", () => {
    expect(caixaDoPapel(postit(10, 20))).toEqual({
      minX: 10,
      minY: 20,
      maxX: 270,
      maxY: 200,
    });
  });
});
