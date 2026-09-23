import { describe, expect, it } from "vitest";

import {
  contornoDaParede,
  corpoDaParede,
  manchasDaFigura,
  segmentosDaParede,
  sombraDaLuz,
  sombraDoSol,
  umbraDoSegmento,
  umbrasDaLuz,
  umbrasDoSol,
} from "@/lib/geometry/sombra";
import type { CaixaDaFigura } from "@/lib/geometry/sombra";
import type { Luz, Parede, Sol } from "@/types/scene";

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

describe("sombraDaLuz", () => {
  const luz: Luz = { id: "l1", x: 550, y: 350, raio: 400 };

  it("aponta para longe da luz", () => {
    // Luz à esquerda da figura: a sombra tem de ir para a direita.
    const sombra = sombraDaLuz(FIGURA, { ...luz, x: 250, y: 350 });
    expect(sombra).not.toBeNull();
    expect(sombra!.dx).toBeGreaterThan(0);
  });

  it("dois lados da mesma luz dão sentidos opostos", () => {
    const esquerda = sombraDaLuz({ ...FIGURA, x: 300 }, luz);
    const direita = sombraDaLuz({ ...FIGURA, x: 800 }, luz);

    expect(esquerda!.dx).toBeLessThan(0);
    expect(direita!.dx).toBeGreaterThan(0);
  });

  it("figura fora do alcance não tem sombra nenhuma", () => {
    expect(sombraDaLuz({ ...FIGURA, x: 5000 }, luz)).toBeNull();
  });

  it("mais longe da luz é mais comprida e mais fraca", () => {
    const luzNoCanto: Luz = { ...luz, x: 0, y: 350, raio: 2000 };
    const perto = sombraDaLuz({ ...FIGURA, x: 200 }, luzNoCanto)!;
    const longe = sombraDaLuz({ ...FIGURA, x: 1200 }, luzNoCanto)!;

    expect(longe.dx).toBeGreaterThan(perto.dx);
    expect(longe.forca).toBeLessThan(perto.forca);
  });
});

describe("manchasDaFigura", () => {
  const sol: Sol = { angulo: 0, comprimento: 0.5, forca: 0.4 };
  const luz: Luz = { id: "l1", x: 250, y: 350, raio: 400, forca: 0.5 };

  it("sem sol e sem luz, mancha nenhuma", () => {
    expect(manchasDaFigura(FIGURA, undefined, [])).toEqual([]);
  });

  it("a mancha sai do CENTRO da figura, empurrada", () => {
    const [mancha] = manchasDaFigura(FIGURA, sol, []);
    // Centro da caixa em 550,350; o sol a 0° empurra para a direita.
    expect(mancha.x).toBeGreaterThan(550);
    expect(mancha.y).toBeCloseTo(350, 1);
  });

  it("é mais achatada e mais estreita que a caixa", () => {
    const [mancha] = manchasDaFigura(FIGURA, sol, []);
    expect(mancha.largura).toBeLessThan(FIGURA.width);
    expect(mancha.altura).toBeLessThan(mancha.largura);
  });

  it("com sol e luz fica só a MAIS FORTE", () => {
    const manchas = manchasDaFigura(FIGURA, sol, [luz]);
    expect(manchas).toHaveLength(1);
    // A luz aqui é mais forte que o sol, e é a que sobra: a sombra sai para a
    // direita da figura, que é o lado oposto ao dela.
    expect(manchas[0].x).toBeGreaterThan(550);
  });

  it("uma por figura, haja uma tocha ou cinco", () => {
    const outras: Luz[] = [
      { ...luz, id: "l2", forca: 0.45 },
      { ...luz, id: "l3", forca: 0.3 },
      { ...luz, id: "l4", forca: 0.2 },
    ];
    expect(manchasDaFigura(FIGURA, sol, outras)).toHaveLength(1);
  });

  it("luz fora do alcance não entra", () => {
    const distante: Luz = { ...luz, x: 5000, y: 5000 };
    expect(manchasDaFigura(FIGURA, undefined, [distante])).toEqual([]);
  });

  it("girar o token não gira a sombra: ela cai para onde a luz manda", () => {
    const reto = manchasDaFigura(FIGURA, sol, [])[0];
    const torto = manchasDaFigura({ ...FIGURA, rotation: 90 }, sol, [])[0];
    expect(torto.x).toBeCloseTo(reto.x, 1);
    expect(torto.y).toBeCloseTo(reto.y, 1);
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
    // zero não se vê.
    expect(corpoDaParede(reta)).toBe("M100,111L300,111L300,89L100,89Z");
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

/** Positiva = sentido horário na tela. Ver `umbraDoSegmento`. */
function areaComSinal(pontos: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const atual = pontos[i]!;
    const proximo = pontos[(i + 1) % pontos.length]!;
    area += atual.x * proximo.y - proximo.x * atual.y;
  }
  return area / 2;
}

describe("umbraDoSegmento", () => {
  const luz: Luz = { id: "l1", x: 0, y: 0, raio: 500 };
  const segmento = { x1: 100, y1: 100, x2: 200, y2: 100 };

  it("fecha um quadrilátero: as duas pontas e as duas projeções", () => {
    const pontos = pontosDe(umbraDoSegmento(segmento, luz)!);
    expect(pontos).toHaveLength(4);
  });

  it("projeta as pontas para LONGE da luz", () => {
    const pontos = pontosDe(umbraDoSegmento(segmento, luz)!);
    const distancias = pontos
      .map((ponto) => Math.hypot(ponto.x, ponto.y))
      .sort((a, b) => a - b);

    // Duas pontas perto (as da parede) e duas longe (as projeções).
    expect(distancias[0]).toBeCloseTo(Math.hypot(100, 100), 0);
    expect(distancias[3]).toBeGreaterThan(luz.raio);
  });

  it("a borda longe fica FORA do alcance inteira, e não só nas pontas", () => {
    // Um segmento largo visto de perto: é o caso em que a borda afundava no
    // meio e comia a sombra bem no centro dela.
    const largo = { x1: -200, y1: 60, x2: 200, y2: 60 };
    const pontos = pontosDe(umbraDoSegmento(largo, luz)!);
    const longe = pontos
      .filter((ponto) => Math.hypot(ponto.x, ponto.y) > luz.raio)
      .sort((a, b) => a.x - b.x);

    expect(longe).toHaveLength(2);

    // O meio da corda entre as duas projeções também tem de passar do raio.
    const meio = {
      x: (longe[0]!.x + longe[1]!.x) / 2,
      y: (longe[0]!.y + longe[1]!.y) / 2,
    };
    expect(Math.hypot(meio.x, meio.y)).toBeGreaterThan(luz.raio);
  });

  it("segmento fora do alcance não faz sombra", () => {
    expect(
      umbraDoSegmento({ x1: 900, y1: 900, x2: 950, y2: 900 }, luz),
    ).toBeNull();
  });

  it("uma ponta dentro e outra fora: recorta no círculo e projeta as duas", () => {
    const atravessa = { x1: 100, y1: 100, x2: 900, y2: 900 };
    const pontos = pontosDe(umbraDoSegmento(atravessa, luz)!);

    // Quadrilátero, e não o triângulo torto que a versão anterior desenhava.
    expect(pontos).toHaveLength(4);

    // Nenhuma ponta da parede passa do alcance: o que estava fora foi cortado.
    const perto = pontos
      .map((ponto) => Math.hypot(ponto.x, ponto.y))
      .filter((distancia) => distancia <= luz.raio + 1);
    expect(perto).toHaveLength(2);
  });

  it("todas saem no MESMO sentido, senão duas que se cruzam viram buraco", () => {
    const sala: Parede = {
      id: "p",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      formato: "retangulo",
    };

    const areas = segmentosDaParede(sala)
      .map((segmento) => umbraDoSegmento(segmento, luz))
      .filter((caminho) => caminho !== null)
      .map((caminho) => areaComSinal(pontosDe(caminho)));

    expect(areas).toHaveLength(4);
    // Nenhuma negativa. Zero é legítimo e é geometria: o lado PARALELO ao sol
    // não joga sombra nenhuma -- ele e a cópia dele ficam na mesma reta.
    for (const area of areas) expect(area).toBeGreaterThanOrEqual(0);
    expect(areas.filter((area) => area > 0).length).toBeGreaterThanOrEqual(2);
  });
});

describe("umbrasDaLuz", () => {
  const luz: Luz = { id: "l1", x: 0, y: 0, raio: 500 };

  it("junta tudo num caminho só, para o cruzamento não escurecer duas vezes", () => {
    const paredes: Parede[] = [
      { id: "p1", x: 100, y: 100, width: 100, height: 0, formato: "linha" },
      { id: "p2", x: 100, y: 100, width: 0, height: 100, formato: "linha" },
    ];
    const caminho = umbrasDaLuz(paredes, luz);
    expect(caminho.match(/M/g)).toHaveLength(2);
    expect(caminho.match(/Z/g)).toHaveLength(2);
  });

  it("um retângulo dá quatro umbras, uma por lado", () => {
    const sala: Parede = {
      id: "p",
      x: 100,
      y: 100,
      width: 120,
      height: 120,
      formato: "retangulo",
    };
    expect(umbrasDaLuz([sala], luz).match(/M/g)).toHaveLength(4);
  });

  it("sem parede alcançada, caminho vazio", () => {
    const longe: Parede = {
      id: "p",
      x: 800,
      y: 800,
      width: 100,
      height: 100,
      formato: "linha",
    };
    expect(umbrasDaLuz([longe], luz)).toBe("");
  });
});

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
    expect(umbrasDoSol([parede], sol)).toBe("M300,100L300,155L100,155L100,100Z");
  });

  it("todas saem no mesmo sentido, como as da luz", () => {
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

    expect(areas).toHaveLength(4);
    // Nenhuma negativa. Zero é legítimo e é geometria: o lado PARALELO ao sol
    // não joga sombra nenhuma -- ele e a cópia dele ficam na mesma reta.
    for (const area of areas) expect(area).toBeGreaterThanOrEqual(0);
    expect(areas.filter((area) => area > 0)).toHaveLength(2);
  });

  it("sol rente ao chão não desenha faixa nenhuma", () => {
    expect(umbrasDoSol([parede], { ...sol, comprimento: 0 })).toBe("");
  });
});
