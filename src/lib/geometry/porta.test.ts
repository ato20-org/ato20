import { describe, expect, it } from "vitest";

import {
  ABERTURA_PADRAO,
  aberturaAte,
  alternarPorta,
  caixaDaPorta,
  folhasNaCaixa,
  normalizarGraus,
  paredeDaPorta,
  paredesComPortas,
  patchDaAbertura,
  pegaDaAlca,
  pontaDaPorta,
  portaDoTraco,
  portaPelaAlca,
  segmentosDasPortas,
} from "@/lib/geometry/porta";
import { segmentosDaParede } from "@/lib/geometry/sombra";
import type { Parede, Porta } from "@/types/scene";

const porta: Porta = { id: "p", x: 100, y: 100, comprimento: 50, angulo: 0 };

function perto(a: { x: number; y: number }, b: { x: number; y: number }) {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
}

describe("normalizarGraus", () => {
  it("conta o giro pelo lado mais curto", () => {
    expect(normalizarGraus(0)).toBe(0);
    expect(normalizarGraus(190)).toBe(-170);
    expect(normalizarGraus(-190)).toBe(170);
    expect(normalizarGraus(540)).toBe(180);
    expect(normalizarGraus(-180)).toBe(180);
  });
});

describe("pontaDaPorta", () => {
  it("fechada aponta no ângulo, aberta gira em volta da dobradiça", () => {
    perto(pontaDaPorta(porta), { x: 150, y: 100 });
    perto(pontaDaPorta({ ...porta, abertura: 90 }), { x: 100, y: 150 });
    perto(pontaDaPorta({ ...porta, abertura: -90 }), { x: 100, y: 50 });
  });

  it("a ponta fechada não depende da abertura", () => {
    perto(pontaDaPorta({ ...porta, abertura: 90 }, true), { x: 150, y: 100 });
  });
});

describe("paredeDaPorta", () => {
  it("é a linha da dobradiça à ponta, nos quatro quadrantes", () => {
    for (const abertura of [30, 120, -30, -120]) {
      const aberta = { ...porta, abertura };
      const ponta = pontaDaPorta(aberta);
      const [segmento, ...resto] = segmentosDaParede(paredeDaPorta(aberta));

      expect(resto).toHaveLength(0);
      const pontas = [
        { x: segmento!.x1, y: segmento!.y1 },
        { x: segmento!.x2, y: segmento!.y2 },
      ];
      const comecaNaDobradica =
        Math.hypot(pontas[0]!.x - aberta.x, pontas[0]!.y - aberta.y) < 1e-6;
      perto(comecaNaDobradica ? pontas[0]! : pontas[1]!, aberta);
      perto(comecaNaDobradica ? pontas[1]! : pontas[0]!, ponta);
    }
  });

  it("leva o id da porta, para a cor da face ficar com ela", () => {
    expect(paredeDaPorta(porta).id).toBe("p");
  });
});

describe("paredesComPortas", () => {
  const paredes: Parede[] = [
    { id: "w", x: 0, y: 0, width: 10, height: 10, formato: "retangulo" },
  ];

  it("sem porta devolve a mesma lista", () => {
    expect(paredesComPortas(paredes, undefined)).toBe(paredes);
    expect(paredesComPortas(paredes, [])).toBe(paredes);
    expect(paredesComPortas(undefined, undefined)).toBeUndefined();
  });

  it("acrescenta cada porta como linha", () => {
    const juntas = paredesComPortas(paredes, [porta]);
    expect(juntas).toHaveLength(2);
    expect(juntas![1]!.formato).toBe("linha");
  });

  it("ignora a porta podre, como a parede", () => {
    const podre = { ...porta, comprimento: Number.NaN };
    expect(paredesComPortas(paredes, [podre])).toBe(paredes);
    expect(segmentosDasPortas([podre])).toHaveLength(0);
  });
});

describe("portaDoTraco", () => {
  it("mede o comprimento e o ângulo do traço", () => {
    expect(portaDoTraco({ x: 10, y: 10 }, { x: 10, y: 70 })).toEqual({
      x: 10,
      y: 10,
      comprimento: 60,
      angulo: 90,
    });
  });

  it("recusa o traço curto demais", () => {
    expect(portaDoTraco({ x: 10, y: 10 }, { x: 12, y: 13 })).toBeNull();
  });

  it("com Shift, cai no múltiplo de 45", () => {
    expect(portaDoTraco({ x: 0, y: 0 }, { x: 100, y: 12 }, true)!.angulo).toBe(0);
    expect(portaDoTraco({ x: 0, y: 0 }, { x: 100, y: 90 }, true)!.angulo).toBe(45);
  });
});

describe("aberturaAte", () => {
  it("é o ângulo do ponteiro visto da dobradiça, menos o da porta fechada", () => {
    expect(aberturaAte(porta, { x: 100, y: 200 })).toBe(90);
    expect(aberturaAte(porta, { x: 100, y: 0 })).toBe(-90);
    expect(aberturaAte({ ...porta, angulo: 90 }, { x: 0, y: 100 })).toBe(90);
  });

  it("perto do zero o ímã fecha", () => {
    expect(aberturaAte(porta, { x: 200, y: 105 })).toBeUndefined();
    expect(aberturaAte(porta, { x: 200, y: 95 })).toBeUndefined();
  });

  it("dá a volta pelo lado de trás sem pular", () => {
    expect(aberturaAte(porta, { x: 0, y: 99 })).toBe(-179);
    expect(aberturaAte(porta, { x: 0, y: 101 })).toBe(179);
  });

  it("com Shift, cai no múltiplo de 45", () => {
    expect(aberturaAte(porta, { x: 200, y: 180 }, true)).toBe(45);
    expect(aberturaAte(porta, { x: 200, y: 110 }, true)).toBeUndefined();
  });
});

describe("portaPelaAlca", () => {
  it("gira e estica em volta da dobradiça, sem pular na pega", () => {
    // A alça mora 20 além da ponta: a pega guarda essa folga.
    const pega = pegaDaAlca(porta, { x: 170, y: 100 });
    expect(pega.folga).toBeCloseTo(20);
    expect(pega.desvio).toBeCloseTo(0);

    expect(portaPelaAlca(porta, { x: 170, y: 100 }, pega)).toEqual({
      comprimento: 50,
      angulo: 0,
    });
    expect(portaPelaAlca(porta, { x: 100, y: 200 }, pega)).toEqual({
      comprimento: 80,
      angulo: 90,
    });
  });

  it("para no piso, e o Shift cai no múltiplo de 45", () => {
    const pega = pegaDaAlca(porta, { x: 170, y: 100 });
    expect(portaPelaAlca(porta, { x: 101, y: 100 }, pega).comprimento).toBe(8);
    expect(portaPelaAlca(porta, { x: 200, y: 190 }, pega, true).angulo).toBe(45);
  });
});

describe("alternarPorta", () => {
  it("aberta fecha e guarda a abertura", () => {
    expect(alternarPorta({ abertura: -70 })).toEqual({
      abertura: undefined,
      ultimaAbertura: -70,
    });
  });

  it("fechada volta à última abertura, ou ao ângulo reto", () => {
    expect(alternarPorta({ ultimaAbertura: -70 })).toEqual({ abertura: -70 });
    expect(alternarPorta({})).toEqual({ abertura: ABERTURA_PADRAO });
  });
});

describe("patchDaAbertura", () => {
  it("o ímã fechando guarda a última abertura da mão", () => {
    expect(patchDaAbertura(40, undefined)).toEqual({ abertura: 40 });
    expect(patchDaAbertura(undefined, 40)).toEqual({
      abertura: undefined,
      ultimaAbertura: 40,
    });
    expect(patchDaAbertura(undefined, undefined)).toEqual({
      abertura: undefined,
    });
  });
});

describe("paredeDaPorta com altura", () => {
  it("leva a altura para o 2.5D e o sol", () => {
    expect(paredeDaPorta({ ...porta, altura: 150 }).altura).toBe(150);
    expect(paredeDaPorta(porta).altura).toBeUndefined();
  });
});

describe("caixaDaPorta", () => {
  it("cobre a dobradiça, a ponta fechada e a de agora", () => {
    const caixa = caixaDaPorta({ ...porta, abertura: 90 });
    expect(caixa.x).toBeCloseTo(100);
    expect(caixa.y).toBeCloseTo(100);
    expect(caixa.width).toBeCloseTo(50);
    expect(caixa.height).toBeCloseTo(50);
  });
});

describe("folhasNaCaixa", () => {
  it("só as folhas que tocam a caixa da luz", () => {
    const perto = { x1: 0, y1: 0, x2: 20, y2: 20 };
    const longe = { x1: 500, y1: 500, x2: 520, y2: 520 };
    expect(
      folhasNaCaixa({ x: 10, y: 10, width: 100, height: 100 }, [perto, longe]),
    ).toEqual([perto]);
  });
});
