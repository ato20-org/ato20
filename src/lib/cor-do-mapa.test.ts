import { describe, expect, it } from "vitest";

import {
  corDominante,
  corNoPonto,
  paletaDaArea,
  type AmostraDoMapa,
} from "@/lib/cor-do-mapa";

/** Um mapa 4:3 de quatro colunas: a primeira vermelha, o resto azul. */
function mapa4por3(): AmostraDoMapa {
  const largura = 4;
  const altura = 3;
  const dados = new Uint8ClampedArray(largura * altura * 4);

  for (let y = 0; y < altura; y += 1) {
    for (let x = 0; x < largura; x += 1) {
      const i = (y * largura + x) * 4;
      dados[i] = x === 0 ? 255 : 0;
      dados[i + 2] = x === 0 ? 0 : 255;
      dados[i + 3] = 255;
    }
  }

  return { largura, altura, dados };
}

describe("corDominante", () => {
  // Encaixado em 1920x1080, o 4:3 ocupa 1440 de largura a partir de x = 240,
  // e cada coluna vale 360 unidades: a vermelha vai de 240 a 600.
  it("lê o mapa no lugar em que ele CABE, e não esticado no plano", () => {
    // Esticado, x = 500 caía na segunda coluna e a parede saía azul.
    expect(corDominante(mapa4por3(), [{ x: 500, y: 540 }])).toBe("#ff0000");
    expect(corDominante(mapa4por3(), [{ x: 700, y: 540 }])).toBe("#0000ff");
  });

  it("não lê nada na faixa vazia ao lado do mapa", () => {
    expect(corDominante(mapa4por3(), [{ x: 100, y: 540 }])).toBeNull();
    expect(corDominante(mapa4por3(), [{ x: 1800, y: 540 }])).toBeNull();
  });
});

/** Um mapa 16:9 de 16x9 pixels: metade esquerda vermelha, a direita azul. */
function metadeEMetade(): AmostraDoMapa {
  const largura = 16;
  const altura = 9;
  const dados = new Uint8ClampedArray(largura * altura * 4);

  for (let y = 0; y < altura; y += 1) {
    for (let x = 0; x < largura; x += 1) {
      const i = (y * largura + x) * 4;
      dados[i] = x < 8 ? 255 : 0;
      dados[i + 2] = x < 8 ? 0 : 255;
      dados[i + 3] = 255;
    }
  }

  return { largura, altura, dados };
}

describe("paletaDaArea", () => {
  it("põe as cores da área da mais presente para a menos", () => {
    // Um ponto no vermelho, três no azul.
    const pontos = [
      { x: 100, y: 540 },
      { x: 1100, y: 540 },
      { x: 1300, y: 540 },
      { x: 1500, y: 540 },
    ];

    expect(paletaDaArea(metadeEMetade(), pontos, 4)).toEqual([
      "#0000ff",
      "#ff0000",
    ]);
  });

  it("para no tanto pedido", () => {
    const pontos = [
      { x: 100, y: 540 },
      { x: 1500, y: 540 },
    ];

    expect(paletaDaArea(metadeEMetade(), pontos, 1)).toHaveLength(1);
  });
});

describe("corNoPonto", () => {
  it("dá a cor do mapa sob o ponto", () => {
    expect(corNoPonto(metadeEMetade(), { x: 300, y: 540 })).toBe("#ff0000");
    expect(corNoPonto(metadeEMetade(), { x: 1600, y: 540 })).toBe("#0000ff");
  });

  it("na divisa, a média dos vizinhos: o tom que o olho vê ali", () => {
    // O pixel 7 é vermelho e o 8 azul; em volta do 7, dois vermelhos e um azul
    // por linha.
    const cor = corNoPonto(metadeEMetade(), { x: 7.5 * 120, y: 540 })!;
    expect(cor).toBe("#aa0055");
  });

  it("fora do mapa não há cor", () => {
    expect(corNoPonto(mapa4por3(), { x: 100, y: 540 })).toBeNull();
  });
});
