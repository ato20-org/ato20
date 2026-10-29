import { describe, expect, it } from "vitest";

import {
  contornoDoRastro,
  laserDaMesa,
  laserParaMesa,
  podarRastro,
  proximoDeslocamento,
  rastroApagado,
  rastroMacio,
  rastroNoInstante,
  VIDA_DO_LASER_MS,
  type PontoDoLaser,
  type RastroDoLaser,
} from "@/lib/laser";

const VIDA = VIDA_DO_LASER_MS;

/** Um risco em linha reta, um ponto a cada 100 ms, andando 10 unidades em x. */
function reta(inicio: number, quantos: number): PontoDoLaser[] {
  return Array.from({ length: quantos }, (_, i) => ({
    x: i * 10,
    y: 0,
    t: inicio + i * 100,
  }));
}

describe("podarRastro", () => {
  it("tira o que apagou e deixa um ponto morto antes do primeiro vivo", () => {
    const rastro: RastroDoLaser = { riscos: [reta(0, 10)], aceso: false };

    // Em 2000, morre tudo até t = 500; o primeiro vivo é o de t = 600.
    const podado = podarRastro(rastro, 2_000);

    expect(podado.riscos[0]!.map((ponto) => ponto.t)).toEqual([
      500, 600, 700, 800, 900,
    ]);
  });

  it("tira o risco que apagou inteiro", () => {
    const rastro: RastroDoLaser = {
      riscos: [reta(0, 3), reta(5_000, 3)],
      aceso: false,
    };

    expect(podarRastro(rastro, 5_300).riscos).toHaveLength(1);
  });

  it("com o botão apertado, a ponta do último risco não morre", () => {
    const rastro: RastroDoLaser = { riscos: [reta(0, 3)], aceso: true };

    const podado = podarRastro(rastro, 60_000);

    expect(podado.riscos).toEqual([[{ x: 20, y: 0, t: 200 }]]);
  });
});

describe("o rastro na mesa", () => {
  it("viaja com a idade de cada ponto e volta no relógio de quem recebe", () => {
    const rastro: RastroDoLaser = { riscos: [reta(1_000, 3)], aceso: true };

    const laser = laserParaMesa(rastro, "cena", 1_250);

    expect(laser).toEqual({
      cenaId: "cena",
      agora: 1_250,
      riscos: [[0, 0, 250, 10, 0, 150, 20, 0, 50]],
      aceso: true,
    });

    // O celular está 10 s à frente: os pontos chegam com a hora dele.
    const recebido = laserDaMesa(laser, 10_000);

    expect(recebido.riscos[0]!.map((ponto) => ponto.t)).toEqual([
      11_000, 11_100, 11_200,
    ]);
    expect(recebido.aceso).toBe(true);
  });

  it("arredonda a posição, e o quadro não leva dígito à toa", () => {
    const rastro: RastroDoLaser = {
      riscos: [[{ x: 10.46, y: 3.51, t: 100 }]],
      aceso: true,
    };

    expect(laserParaMesa(rastro, "cena", 100).riscos).toEqual([[10, 4, 0]]);
  });

  it("número que não é número não entra no rastro", () => {
    const recebido = laserDaMesa(
      {
        cenaId: "cena",
        agora: 0,
        riscos: [[0, 0, 0, Number.NaN, 5, 0], [Number.POSITIVE_INFINITY, 0, 0]],
        aceso: false,
      },
      0,
    );

    expect(recebido.riscos).toEqual([[{ x: 0, y: 0, t: 0 }]]);
  });
});

describe("proximoDeslocamento", () => {
  it("a primeira amostra vale como veio", () => {
    expect(proximoDeslocamento(null, 320)).toBe(320);
  });

  it("fica com a viagem mais curta", () => {
    expect(proximoDeslocamento(320, 250)).toBe(250);
  });

  it("sobe devagar quando a viagem demora", () => {
    const depois = proximoDeslocamento(250, 350);

    expect(depois).toBeGreaterThan(250);
    expect(depois).toBeLessThan(260);
  });

  it("recomeça num salto grande do relógio", () => {
    expect(proximoDeslocamento(250, 250 + 5_000)).toBe(5_250);
  });
});

describe("rastroNoInstante", () => {
  it("a ponta corre por dentro do segmento que ainda não chegou", () => {
    const rastro: RastroDoLaser = { riscos: [reta(0, 3)], aceso: false };

    // Em 150, já passaram os pontos de 0 e 100; o de 200 está a meio caminho.
    const [risco] = rastroNoInstante(rastro, 150);

    expect(risco!.map((ponto) => ponto.x)).toEqual([0, 10, 15]);
    expect(risco![2]!.vida).toBe(1);
  });

  it("a cauda é cortada onde a vida acaba, com vida zero", () => {
    const rastro: RastroDoLaser = { riscos: [reta(0, 10)], aceso: false };

    // Em VIDA + 250, o limite é 250: entre o ponto de 200 e o de 300.
    const [risco] = rastroNoInstante(rastro, VIDA + 250);

    expect(risco![0]).toEqual({ x: 25, y: 0, vida: 0 });
    expect(risco![risco!.length - 1]!.x).toBe(90);
  });

  it("com o botão apertado e parado, a ponta fica acesa onde o mestre aponta", () => {
    const rastro: RastroDoLaser = { riscos: [reta(0, 3)], aceso: true };

    const [risco] = rastroNoInstante(rastro, 60_000);

    expect(risco).toBeDefined();
    expect(risco!.every((ponto) => ponto.x === 20 && ponto.y === 0)).toBe(true);
    expect(risco![risco!.length - 1]!.vida).toBe(1);
  });

  it("o que apagou não se desenha", () => {
    const rastro: RastroDoLaser = { riscos: [reta(0, 3)], aceso: false };

    expect(rastroNoInstante(rastro, 200 + VIDA + 1)).toEqual([]);
  });

  it("o risco que ainda não chegou não se desenha", () => {
    const rastro: RastroDoLaser = { riscos: [reta(1_000, 3)], aceso: false };

    expect(rastroNoInstante(rastro, 500)).toEqual([]);
  });
});

describe("rastroApagado", () => {
  it("apaga quando o último ponto passa da vida", () => {
    const rastro: RastroDoLaser = { riscos: [reta(0, 3)], aceso: false };

    expect(rastroApagado(rastro, 200 + VIDA - 1)).toBe(false);
    expect(rastroApagado(rastro, 200 + VIDA)).toBe(true);
  });

  it("não apaga com o botão apertado", () => {
    const rastro: RastroDoLaser = { riscos: [reta(0, 3)], aceso: true };

    expect(rastroApagado(rastro, 60_000)).toBe(false);
  });

  it("sem risco nenhum, já está apagado", () => {
    expect(rastroApagado({ riscos: [], aceso: true }, 0)).toBe(true);
  });
});

describe("contornoDoRastro", () => {
  it("sem ponto, sem caminho", () => {
    expect(contornoDoRastro([], 10)).toBe("");
  });

  it("um ponto só é um disco do tamanho da ponta", () => {
    const d = contornoDoRastro([{ x: 50, y: 50, vida: 1 }], 10);

    expect(d.startsWith("M55 50A5 5")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("afina até zero na cauda e fecha redondo na ponta", () => {
    const d = contornoDoRastro(
      [
        { x: 0, y: 0, vida: 0 },
        { x: 10, y: 0, vida: 0.5 },
        { x: 20, y: 0, vida: 1 },
      ],
      10,
    );

    // Andando para a direita, o lado direito de quem anda é o de baixo (y
    // cresce para baixo): sobe por ele, contorna a ponta e volta por cima.
    expect(d).toBe("M0 0L10 2.5L20 5A5 5 0 0 0 20 -5L10 -2.5L0 0Z");
  });

  it("ponto repetido herda a direção do vizinho", () => {
    const d = contornoDoRastro(
      [
        { x: 0, y: 0, vida: 1 },
        { x: 0, y: 0, vida: 1 },
        { x: 10, y: 0, vida: 1 },
      ],
      10,
    );

    expect(d).not.toContain("NaN");
    expect(d.startsWith("M0 5L0 5L10 5")).toBe(true);
  });
});

describe("rastroMacio", () => {
  it("passa por todas as amostras e põe pontos entre elas", () => {
    const amostras = [
      { x: 0, y: 0, vida: 0 },
      { x: 40, y: 0, vida: 0.5 },
      { x: 40, y: 40, vida: 1 },
    ];

    const macio = rastroMacio(amostras, 4);

    expect(macio.length).toBeGreaterThan(amostras.length);
    for (const amostra of amostras) expect(macio).toContainEqual(amostra);
  });

  it("a vida dos pontos novos fica entre a das amostras do trecho", () => {
    const macio = rastroMacio(
      [
        { x: 0, y: 0, vida: 0 },
        { x: 40, y: 0, vida: 0.5 },
        { x: 80, y: 0, vida: 1 },
      ],
      4,
    );

    const vidas = macio.map((ponto) => ponto.vida);
    expect(vidas).toEqual([...vidas].sort((a, b) => a - b));
  });

  it("não dá laço quando uma amostra está perto e a seguinte longe", () => {
    const macio = rastroMacio(
      [
        { x: 0, y: 0, vida: 1 },
        { x: 1, y: 0, vida: 1 },
        { x: 100, y: 0, vida: 1 },
        { x: 100, y: 100, vida: 1 },
      ],
      4,
    );

    // Num trecho reto da esquerda para a direita, a curva não volta para trás
    // nem passa da quina.
    const reto = macio.filter((ponto) => ponto.y === 0 || ponto.x <= 100);
    expect(reto.every((ponto) => ponto.x >= 0 && ponto.x <= 100)).toBe(true);
  });

  it("ponto repetido não vira NaN", () => {
    const macio = rastroMacio(
      [
        { x: 10, y: 10, vida: 1 },
        { x: 10, y: 10, vida: 1 },
        { x: 50, y: 10, vida: 1 },
      ],
      4,
    );

    expect(macio.every((ponto) => Number.isFinite(ponto.x + ponto.y))).toBe(true);
  });

  it("com menos de três pontos, devolve o que veio", () => {
    const dois = [
      { x: 0, y: 0, vida: 0 },
      { x: 40, y: 0, vida: 1 },
    ];

    expect(rastroMacio(dois, 4)).toEqual(dois);
  });
});
