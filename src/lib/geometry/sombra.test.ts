import { describe, expect, it } from "vitest";

import {
  ALTURA_DA_PAREDE,
  contornoDaParede,
  matrizDoVulto,
  peDaFigura,
  corpoDaParede,
  manchaDaFigura,
  segmentosDaParede,
  sombraDoSol,
  umbrasDoSol,
  vultoDaFigura,
} from "@/lib/geometry/sombra";
import type { CaixaDaFigura } from "@/lib/geometry/sombra";
import type { Parede, Sol } from "@/types/scene";

const FIGURA: CaixaDaFigura = {
  x: 500,
  y: 300,
  width: 100,
  height: 100,
  rotation: 0,
};

describe("sombraDoSol", () => {
  const sol: Sol = { angulo: 0, comprimento: 0.5, forca: 0.4 };

  it("empurra a figura no sentido do ângulo, e só nele", () => {
    const { dx, dy } = sombraDoSol(FIGURA, sol);
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeCloseTo(0, 1);
  });

  it("ângulo para baixo empurra para baixo", () => {
    const { dx, dy } = sombraDoSol(FIGURA, { ...sol, angulo: 90 });
    expect(dx).toBeCloseTo(0, 1);
    expect(dy).toBeGreaterThan(0);
  });

  it("alcança qualquer figura: o sol não tem raio", () => {
    expect(sombraDoSol({ ...FIGURA, x: 0, y: 0 }, sol).dx).toBeGreaterThan(0);
  });
});

describe("manchaDaFigura", () => {
  const sol: Sol = { angulo: 0, comprimento: 0.5, forca: 0.4 };

  it("sem sol, mancha nenhuma", () => {
    expect(manchaDaFigura(FIGURA, undefined)).toBeNull();
  });

  it("a mancha sai do CENTRO da figura, empurrada", () => {
    const mancha = manchaDaFigura(FIGURA, sol)!;
    // Centro da caixa em 550,350; o sol a 0° empurra para a direita.
    expect(mancha.x).toBeGreaterThan(550);
    expect(mancha.y).toBeCloseTo(350, 1);
  });

  it("é mais achatada e mais estreita que a caixa", () => {
    const mancha = manchaDaFigura(FIGURA, sol)!;
    expect(mancha.largura).toBeLessThan(FIGURA.width);
    expect(mancha.altura).toBeLessThan(mancha.largura);
  });

  it("girar o token não gira a sombra: ela cai para onde o sol manda", () => {
    const reto = manchaDaFigura(FIGURA, sol)!;
    const torto = manchaDaFigura({ ...FIGURA, rotation: 90 }, sol)!;
    expect(torto.x).toBeCloseTo(reto.x, 1);
    expect(torto.y).toBeCloseTo(reto.y, 1);
  });
});

describe("vultoDaFigura", () => {
  /** Sombra para a DIREITA, de meia altura. */
  const sol: Sol = { angulo: 0, comprimento: 0.5, forca: 0.4 };

  /** Onde um ponto vai parar depois da matriz. Ver `matrizDoVulto`. */
  function aplicar(
    matriz: string,
    ponto: { x: number; y: number },
  ): { x: number; y: number } {
    const [a, b, c, d, e, f] = matriz
      .slice("matrix(".length, -1)
      .split(",")
      .map(Number) as [number, number, number, number, number, number];

    return {
      x: a * ponto.x + c * ponto.y + e,
      y: b * ponto.x + d * ponto.y + f,
    };
  }

  it("sem sol, vulto nenhum", () => {
    expect(vultoDaFigura(FIGURA, undefined)).toBeNull();
  });

  it("nasce em cima da caixa da figura: é ela escorrendo, e não outra coisa", () => {
    const vulto = vultoDaFigura(FIGURA, sol)!;

    expect(vulto.x).toBe(FIGURA.x);
    expect(vulto.y).toBe(FIGURA.y);
    expect(vulto.largura).toBe(FIGURA.width);
    expect(vulto.altura).toBe(FIGURA.height);
  });

  it("corre na direção do sol, e na medida do comprimento dele", () => {
    // Para a direita: tudo no eixo X, nada no Y.
    expect(vultoDaFigura(FIGURA, sol)).toMatchObject({ kx: 0.5, ky: 0 });
    // E para baixo: o contrário.
    const baixo = vultoDaFigura(FIGURA, { ...sol, angulo: 90 })!;
    expect(baixo.kx).toBeCloseTo(0, 5);
    expect(baixo.ky).toBe(0.5);
  });

  it("o pé fica parado: o que já está no chão não se projeta", () => {
    const vulto = vultoDaFigura(FIGURA, sol)!;
    const pe = 380;

    expect(aplicar(matrizDoVulto(vulto, pe), { x: 100, y: pe })).toEqual({
      x: 100,
      y: pe,
    });
  });

  it("a cabeça corre o máximo, porque é o ponto mais alto", () => {
    const vulto = vultoDaFigura(FIGURA, { ...sol, angulo: 90 })!;
    const pe = 400;
    const matriz = matrizDoVulto(vulto, pe);

    // Do alto da caixa até o pé são 400 de altura, e o comprimento é meia
    // altura: a cabeça desce 200 -- para baixo, que é para onde o sol manda.
    expect(aplicar(matriz, { x: 50, y: 0 })).toEqual({ x: 50, y: 200 });
    // O meio do corpo corre metade disso: o escorrido é proporcional à altura.
    expect(aplicar(matriz, { x: 50, y: 200 })).toEqual({ x: 50, y: 300 });
  });

  it("a força é a mesma da mancha: as duas saem da mesma fonte", () => {
    const vulto = vultoDaFigura(FIGURA, sol)!;
    const mancha = manchaDaFigura(FIGURA, sol)!;

    expect(vulto.forca).toBe(mancha.forca);
  });
});

describe("peDaFigura", () => {
  /** Uma figura na metade de cima da caixa, e estreita: o giro tem o que mexer. */
  const recorte = { esquerda: 0.25, cima: 0, direita: 0.75, baixo: 0.5 };
  const largura = 200;
  const altura = 400;

  it("em pé, o chão é a linha de baixo do recorte", () => {
    expect(peDaFigura(recorte, largura, altura, 0)).toBe(200);
  });

  it("de cabeça para baixo, quem encosta no chão é o topo", () => {
    expect(peDaFigura(recorte, largura, altura, 180)).toBe(400);
  });

  it("deitado, é o canto lateral que manda", () => {
    // A um quarto de volta, o lado direito do recorte é o que desceu.
    expect(peDaFigura(recorte, largura, altura, 90)).toBe(250);
  });

  it("meia volta e meia volta de novo é a mesma figura", () => {
    expect(peDaFigura(recorte, largura, altura, 360)).toBeCloseTo(200, 1);
  });
});

describe("segmentosDaParede", () => {
  const caixa = { x: 100, y: 100, width: 200, height: 120 };

  it("a linha é a diagonal da caixa: um segmento", () => {
    const segmentos = segmentosDaParede({
      id: "p",
      ...caixa,
      formato: "linha",
    });
    expect(segmentos).toEqual([{ x1: 100, y1: 100, x2: 300, y2: 220 }]);
  });

  it("`secundaria` sobe em vez de descer", () => {
    const [segmento] = segmentosDaParede({
      id: "p",
      ...caixa,
      formato: "linha",
      diagonal: "secundaria",
    });
    expect(segmento.y1).toBe(220);
    expect(segmento.y2).toBe(100);
  });

  it("o retângulo fecha: quatro lados, e o último volta ao primeiro", () => {
    const segmentos = segmentosDaParede({
      id: "p",
      ...caixa,
      formato: "retangulo",
    });
    expect(segmentos).toHaveLength(4);
    expect(segmentos[3].x2).toBe(segmentos[0].x1);
    expect(segmentos[3].y2).toBe(segmentos[0].y1);
  });

  it("a elipse vira lados retos, porque a umbra é feita de retas", () => {
    const segmentos = segmentosDaParede({
      id: "p",
      ...caixa,
      formato: "elipse",
    });
    expect(segmentos.length).toBeGreaterThan(8);
    // Fechada: o fim do último é o começo do primeiro.
    expect(segmentos.at(-1)!.x2).toBeCloseTo(segmentos[0].x1, 5);
  });

  it("o giro entra nos segmentos, não no desenho", () => {
    const reto = segmentosDaParede({ id: "p", ...caixa, formato: "linha" })[0];
    const torto = segmentosDaParede({
      id: "p",
      ...caixa,
      formato: "linha",
      rotation: 90,
    })[0];

    // Girada 90°, a diagonal deixa de correr para a direita e para baixo.
    expect(torto.x2 - torto.x1).not.toBeCloseTo(reto.x2 - reto.x1, 1);
  });

  it("laço com menos de dois vértices não para luz nenhuma", () => {
    expect(
      segmentosDaParede({
        id: "p",
        ...caixa,
        formato: "poligono",
        pontos: [0, 0],
      }),
    ).toHaveLength(0);
  });
});

describe("corpoDaParede", () => {
  it("o fechado é a região INTEIRA, e não uma borda em volta dela", () => {
    const sala: Parede = {
      id: "p",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      formato: "retangulo",
    };

    // Um caminho só, com os quatro cantos: é a massa da parede. Uma borda em
    // volta do contorno daria quatro quadriláteros, um por lado.
    expect(corpoDaParede(sala)).toBe("M0,0L200,0L200,100L0,100Z");
    expect(corpoDaParede(sala)).toBe(contornoDaParede(sala));
  });

  it("o traço livre também é a região inteira", () => {
    const laco: Parede = {
      id: "p",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      formato: "poligono",
      pontos: [0, 0, 1, 0, 0.5, 1],
    };
    expect(corpoDaParede(laco).match(/M/g)).toHaveLength(1);
    expect(corpoDaParede(laco)).toMatch(/Z$/);
  });

  it("a linha é a exceção: sem interior, ela vira faixa", () => {
    const reta: Parede = {
      id: "p",
      x: 100,
      y: 100,
      width: 200,
      height: 0,
      formato: "linha",
    };

    // Quatro cantos em volta da reta, e não a reta: uma parede de espessura
    // zero não se vê. A ordem é a normalizada, porque o corpo vira máscara --
    // ver `pedraDasParedes`.
    expect(corpoDaParede(reta)).toBe("M100,89L300,89L300,111L100,111Z");
  });
});

describe("contornoDaParede", () => {
  it("o fechado fecha, a linha não", () => {
    const caixa = { x: 0, y: 0, width: 100, height: 100 };
    expect(
      contornoDaParede({ id: "p", ...caixa, formato: "retangulo" }),
    ).toMatch(/Z$/);
    expect(contornoDaParede({ id: "p", ...caixa, formato: "linha" })).not.toMatch(
      /Z$/,
    );
  });
});

/** Os pontos de um `M..L..Z`, para as contas de geometria do teste. */
function pontosDe(caminho: string): { x: number; y: number }[] {
  return caminho
    .replace(/^M/, "")
    .replace(/Z$/, "")
    .split("L")
    .map((par) => {
      const [x, y] = par.split(",").map(Number);
      return { x: x!, y: y! };
    });
}

/** Positiva = sentido horário na tela. Ver `poligonoOrientado`. */
function areaComSinal(pontos: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const atual = pontos[i]!;
    const proximo = pontos[(i + 1) % pontos.length]!;
    area += atual.x * proximo.y - proximo.x * atual.y;
  }
  return area / 2;
}

describe("umbrasDoSol", () => {
  const sol: Sol = { angulo: 90, comprimento: 0.5, forca: 0.4 };
  const parede: Parede = {
    id: "p1",
    x: 100,
    y: 100,
    width: 200,
    height: 0,
    formato: "linha",
  };

  it("copia a parede e a empurra no sentido do sol, sem abrir", () => {
    // Ângulo 90 = para baixo: as duas pontas descem o MESMO tanto, porque o
    // sol não tem posição de onde os raios se abram. A ordem dos pontos é a
    // normalizada -- ver `quadrilatero`.
    expect(umbrasDoSol([parede], sol)).toBe(
      "M300,100L300,155L100,155L100,100Z",
    );
  });

  it("todas saem no mesmo sentido", () => {
    const sala: Parede = {
      id: "p",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      formato: "retangulo",
    };

    const areas = umbrasDoSol([sala], sol)
      .split("M")
      .filter(Boolean)
      .map((pedaco) => areaComSinal(pontosDe(`M${pedaco}`)));

    // Uma faixa: dos quatro lados, dois jogariam para dentro da pedra e o
    // terceiro corre paralelo ao sol. Ver `segmentosQueProjetam`.
    expect(areas).toHaveLength(1);
    // Todas pintam: o lado paralelo ao sol não entra mais -- ele e a cópia
    // dele ficariam na mesma reta. Ver `segmentosQueProjetam`.
    for (const area of areas) expect(area).toBeGreaterThan(0);
  });

  it("sol rente ao chão não desenha faixa nenhuma", () => {
    expect(umbrasDoSol([parede], { ...sol, comprimento: 0 })).toBe("");
  });
});

describe("a altura da parede", () => {
  /** Para baixo, e do tamanho da altura: a sombra mede o que a parede tem. */
  const sol: Sol = { angulo: 90, comprimento: 1, forca: 0.4 };
  const muro: Parede = {
    id: "p",
    x: 100,
    y: 100,
    width: 200,
    height: 0,
    formato: "linha",
  };

  /** O ponto mais baixo do caminho: é até onde a sombra chegou. */
  function ateOndeDesce(caminho: string): number {
    return Math.max(...pontosDe(caminho).map((ponto) => ponto.y));
  }

  it("sem altura dita, a sombra é a da parede padrão", () => {
    expect(ateOndeDesce(umbrasDoSol([muro], sol))).toBe(100 + ALTURA_DA_PAREDE);
  });

  it("parede mais alta joga sombra mais longa, na mesma medida", () => {
    const torre: Parede = { ...muro, altura: ALTURA_DA_PAREDE * 3 };

    expect(ateOndeDesce(umbrasDoSol([torre], sol))).toBe(
      100 + ALTURA_DA_PAREDE * 3,
    );
  });

  it("mureta joga sombra curta", () => {
    const mureta: Parede = { ...muro, altura: 30 };

    expect(ateOndeDesce(umbrasDoSol([mureta], sol))).toBe(130);
  });
});

describe("o teto da parede", () => {
  /** Para baixo, e curto: o deslocamento não cobre o miolo da torre. */
  const sol: Sol = { angulo: 90, comprimento: 0.5, forca: 0.4 };
  const torre: Parede = {
    id: "p",
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    formato: "retangulo",
  };

  it("coberta, a sombra não entra no miolo: ele é pedra do mapa", () => {
    // Sol a prumo: dos quatro lados, só o de baixo joga para fora. Os outros
    // cairiam dentro da própria pedra. Ver `segmentosQueProjetam`.
    expect(umbrasDoSol([torre], sol).match(/M/g)).toHaveLength(1);
  });

  it("descoberta, o muro deita a sombra dentro do pátio também", () => {
    const patio: Parede = { ...torre, semTeto: true };

    // Ali o miolo é chão à vista, e todos os lados projetam -- é o desenho de
    // antes do teto existir.
    expect(umbrasDoSol([patio], sol).match(/M/g)).toHaveLength(4);
  });

  it("a sombra sai só das bordas que jogam para fora", () => {
    // Sol a prumo, para baixo: quem projeta é o lado de baixo da torre. Os
    // outros três jogariam para dentro da própria pedra.
    expect(umbrasDoSol([torre], sol).match(/M/g)).toHaveLength(1);
  });

  it("a linha projeta dos dois lados: uma reta não tem dentro", () => {
    const reta: Parede = {
      id: "p",
      x: 100,
      y: 100,
      width: 200,
      height: 0,
      formato: "linha",
    };

    expect(umbrasDoSol([reta], sol)).toBe(
      umbrasDoSol([{ ...reta, semTeto: true }], sol),
    );
  });
});
