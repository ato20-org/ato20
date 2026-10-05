import { describe, expect, it } from "vitest";

import {
  extensaoDasTrajetorias,
  extensaoNoPlano,
  planoDaFolha,
  quadroDasFagulhas,
  quadroDoSprite,
  trajetorias,
  varianteDaFigura,
  VARIANTES_DE_PARTICULAS,
  type ParticulasResolvidas,
} from "./particulas";

const fagulhas: ParticulasResolvidas = {
  quantidade: 10,
  pintar: false,
  giro: 0,
  cor: "#f59e0b",
  tamanho: 0.05,
  variacao: 0.5,
  direcao: 270,
  abertura: 0,
  velocidade: 1,
  vida: 1.5,
  emissor: { largura: 0.8, altura: 0.3, ancora: "base" },
};

describe("trajetorias", () => {
  it("é a mesma para a mesma figura, e outra para outra figura", () => {
    // A TV e o Mestre veem a mesma fagulha; a horda não solta em uníssono.
    expect(trajetorias("goblin-1", fagulhas, 5)).toEqual(trajetorias("goblin-1", fagulhas, 5));
    expect(trajetorias("goblin-1", fagulhas, 5)).not.toEqual(trajetorias("goblin-2", fagulhas, 5));
  });

  it("nascem na faixa do emissor, sobem com 270 graus e entram no meio do caminho", () => {
    for (const caminho of trajetorias("goblin", fagulhas, 20)) {
      expect(caminho.x).toBeGreaterThanOrEqual(0.1);
      expect(caminho.x).toBeLessThanOrEqual(0.9);
      expect(caminho.y).toBeGreaterThanOrEqual(0.7);
      expect(Math.abs(caminho.dx)).toBeLessThan(1e-9);
      expect(caminho.dy).toBeLessThan(0);
      expect(caminho.atraso).toBeLessThanOrEqual(0);
      expect(caminho.atraso).toBeGreaterThanOrEqual(-caminho.duracao);
    }
  });

  it("o alcance encolhe o caminho, e a figura alta não sobe menos", () => {
    const [inteiro] = trajetorias("goblin", fagulhas, 1);
    const [metade] = trajetorias("goblin", fagulhas, 1, 1, 0.5);
    const [alta] = trajetorias("goblin", fagulhas, 1, 2);

    expect(metade!.dy).toBeCloseTo(inteiro!.dy / 2);
    // Em fração da ALTURA: a figura duas vezes mais alta anda metade dela.
    expect(alta!.dy).toBeCloseTo(inteiro!.dy / 2);
  });
});

describe("a folha das partículas", () => {
  const caminhos = trajetorias("goblin", { ...fagulhas, abertura: 40 }, 10);
  const folha = planoDaFolha(caminhos, 1.5);

  it("varre a figura e o caminho das fagulhas, acima dela", () => {
    expect(folha.regiao.x).toBeLessThanOrEqual(0);
    expect(folha.regiao.y).toBeLessThan(0);
    expect(folha.regiao.x + folha.regiao.largura).toBeGreaterThanOrEqual(1);
    expect(folha.regiao.y + folha.regiao.altura).toBeGreaterThanOrEqual(1);
  });

  it("tem quadros para o laço inteiro, numa grade cheia", () => {
    expect(folha.total % folha.colunas).toBe(0);
    expect(folha.total / folha.fps).toBeCloseTo(1.5);
  });

  it("o laço fecha: o fim é o começo", () => {
    expect(quadroDasFagulhas(caminhos, folha.regiao, 1)).toEqual(
      quadroDasFagulhas(caminhos, folha.regiao, 0),
    );
  });

  it("cada fagulha fica dentro da célula", () => {
    for (let t = 0; t < 1; t += 0.05) {
      for (const fagulha of quadroDasFagulhas(caminhos, folha.regiao, t)) {
        expect(fagulha.x).toBeGreaterThanOrEqual(0);
        expect(fagulha.x).toBeLessThanOrEqual(1);
        expect(fagulha.y).toBeGreaterThanOrEqual(0);
        expect(fagulha.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("a figura cai numa das variantes, sempre a mesma", () => {
    expect(varianteDaFigura("goblin-1")).toBe(varianteDaFigura("goblin-1"));
    expect(varianteDaFigura("goblin-1")).toBeLessThan(VARIANTES_DE_PARTICULAS);
  });
});

describe("extensaoNoPlano", () => {
  const caixa = { x: 900, y: 500, width: 100, height: 100, rotation: 0 };
  const subida = { esquerda: 0, direita: 0, cima: 1.2, baixo: 0 };

  it("no meio do mapa, o caminho inteiro", () => {
    expect(extensaoNoPlano(caixa, subida)).toBe(1);
  });

  it("encostado no topo, o caminho encolhe até a borda", () => {
    // 60 até o topo, e o caminho pedia 120 acima da figura.
    expect(extensaoNoPlano({ ...caixa, y: 60 }, subida)).toBeCloseTo(0.5);
  });

  it("fora do plano não solta nada", () => {
    expect(extensaoNoPlano({ ...caixa, x: -50 }, subida)).toBe(0);
  });

  it("mede o quanto os caminhos passam da caixa", () => {
    const extensao = extensaoDasTrajetorias([
      {
        x: 0.5,
        y: 0.9,
        dx: 0,
        dy: -1.5,
        tamanho: 0.05,
        duracao: 1,
        atraso: 0,
        angulo: 0,
        giro: 0,
        quadroInicial: 0,
      },
    ]);

    expect(extensao.cima).toBeCloseTo(0.6);
    expect(extensao.baixo).toBe(0);
  });
});

describe("quadroDoSprite", () => {
  it("sem fps, toca uma vez ao longo da vida", () => {
    const sprite = { total: 8, vida: 2 };

    expect(quadroDoSprite(sprite, 0, 0.3)).toBe(0);
    expect(quadroDoSprite(sprite, 0.5, 0.3)).toBe(4);
    expect(quadroDoSprite(sprite, 1, 0.3)).toBe(7);
  });

  it("com fps, em laço, de onde a partícula começou", () => {
    const sprite = { total: 4, fps: 8, vida: 1 };

    // Começa no quadro 2; meio segundo depois andou quatro quadros: de volta ao 2.
    expect(quadroDoSprite(sprite, 0, 0.5)).toBe(2);
    expect(quadroDoSprite(sprite, 0.5, 0.5)).toBe(2);
    expect(quadroDoSprite(sprite, 0.125, 0.5)).toBe(3);
  });

  it("imagem de um quadro só é sempre o quadro zero", () => {
    expect(quadroDoSprite(undefined, 0.7, 0.4)).toBe(0);
  });
});

describe("giro", () => {
  it("só gira quem pediu, e os caminhos de antes não mudam", () => {
    const parado = trajetorias("goblin", fagulhas, 3);
    const girando = trajetorias("goblin", { ...fagulhas, giro: 90 }, 3);

    expect(parado.every((c) => c.giro === 0 && c.angulo === 0)).toBe(true);
    expect(girando.map((c) => Math.abs(c.giro))).toEqual([Math.PI / 2, Math.PI / 2, Math.PI / 2]);
    expect(girando.map((c) => [c.x, c.y, c.dy])).toEqual(parado.map((c) => [c.x, c.y, c.dy]));
  });
});
