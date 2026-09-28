import { describe, expect, it } from "vitest";

import {
  caixaDaFonte,
  chaveDasFontes,
  fontesDaCena,
  aplicarAfim,
  caixaDaMatriz,
  chaveDosOclusores,
  cisalhamentoDaLuz,
  limitarEscuridao,
  matrizDaFigura,
  retanguloDaSilhueta,
  oclusoresDosItens,
  paradasDaLuz,
  sombraDoToken,
  recortarNoCirculo,
  segmentosDasParedes,
  umbraDoSegmento,
  umbrasDaLuz,
  type Oclusor,
  type Ponto,
} from "@/lib/geometry/luz";
import { segmentosDaParede } from "@/lib/geometry/sombra";
import type { CanvasItem, Luz, Parede } from "@/types/scene";

function item(id: string, extra: Partial<CanvasItem> = {}): CanvasItem {
  return {
    id,
    assetId: "a",
    x: 100,
    y: 200,
    width: 60,
    height: 40,
    rotation: 0,
    z: 1,
    ...extra,
  } as CanvasItem;
}

/** Um token que tapa luz: o pé no centro de uma caixa quadrada de lado 2,5·raio. */
function corpo(id: string, x: number, y: number, raio: number): Oclusor {
  const lado = raio / 0.35;
  return {
    id,
    x,
    y,
    raio,
    caixa: {
      x: x - lado / 2,
      y: y - lado / 2,
      width: lado,
      height: lado,
      rotation: 0,
    },
    assetId: `asset-${id}`,
  };
}

/** Positiva num sentido de giro, negativa no outro. */
function areaComSinal(pontos: Ponto[]): number {
  let area = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const atual = pontos[i]!;
    const proximo = pontos[(i + 1) % pontos.length]!;
    area += atual.x * proximo.y - proximo.x * atual.y;
  }
  return area / 2;
}

/** O ponto está dentro do polígono? Raio para a direita, contando cruzamentos. */
function dentro(ponto: Ponto, poligono: Ponto[]): boolean {
  let cruza = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i]!;
    const b = poligono[j]!;
    if (
      a.y > ponto.y !== b.y > ponto.y &&
      ponto.x < ((b.x - a.x) * (ponto.y - a.y)) / (b.y - a.y) + a.x
    ) {
      cruza = !cruza;
    }
  }
  return cruza;
}

describe("fontesDaCena", () => {
  const solta: Luz = { id: "l1", x: 50, y: 60, raio: 200, cor: "#fb923c" };

  it("junta a luz solta e a do token numa lista só", () => {
    const fontes = fontesDaCena(
      [solta],
      [item("t1", { luz: { raio: 150, cor: "#93c5fd" } })],
    );

    expect(fontes.map((fonte) => fonte.id)).toEqual(["l1", "t1"]);
  });

  it("a luz carregada acende do CENTRO do token, e não do canto", () => {
    const [fonte] = fontesDaCena(
      [],
      [item("t1", { luz: { raio: 150, cor: "#93c5fd" } })],
    );

    expect(fonte).toMatchObject({ x: 130, y: 220, raio: 150 });
  });

  it("a luz sem intensidade acende inteira, e a podre também", () => {
    // Ausente é a luz de antes de a intensidade existir.
    const fontes = fontesDaCena(
      [solta, { ...solta, id: "l2", intensidade: Number.NaN }],
      [],
    );

    expect(fontes.map((fonte) => fonte.intensidade)).toEqual([1, 1]);
  });

  it("a intensidade fica presa entre 0 e 1", () => {
    const [fonte] = fontesDaCena([{ ...solta, intensidade: 3 }], []);

    expect(fonte?.intensidade).toBe(1);
  });

  it("sem raio forte, ele é a metade da área", () => {
    // É a luz de antes dos dois raios: forte até o meio.
    const [fonte] = fontesDaCena([solta], []);

    expect(fonte?.raioIntenso).toBe(100);
  });

  it("o raio forte não passa da área nem fica negativo", () => {
    const [maior, menor] = fontesDaCena(
      [
        { ...solta, raioIntenso: 900 },
        { ...solta, id: "l2", raioIntenso: -5 },
      ],
      [],
    );

    expect(maior?.raioIntenso).toBe(200);
    expect(menor?.raioIntenso).toBe(0);
  });

  it("token sem lanterna não acende nada", () => {
    expect(fontesDaCena(undefined, [item("t1")])).toEqual([]);
  });

  it("fonte com número podre some, e não derruba as outras", () => {
    // `createRadialGradient` joga exceção com NaN, e o mapa inteiro apagaria.
    const fontes = fontesDaCena(
      [solta, { ...solta, id: "podre", x: Number.NaN }],
      [item("t1", { luz: { raio: 0, cor: "#fff" } })],
    );

    expect(fontes.map((fonte) => fonte.id)).toEqual(["l1"]);
  });
});

describe("paradasDaLuz", () => {
  const fonte = { raio: 200, raioIntenso: 100, intensidade: 1 };

  it("começa inteira no centro e acaba em zero na borda da área", () => {
    const paradas = paradasDaLuz(fonte);

    expect(paradas[0]).toEqual([0, 1]);
    expect(paradas.at(-1)?.[0]).toBeCloseTo(1);
    expect(paradas.at(-1)?.[1]).toBeCloseTo(0);
  });

  it("mais forte quanto mais perto do centro, sem platô", () => {
    const paradas = paradasDaLuz(fonte);

    for (let i = 1; i < paradas.length; i += 1) {
      // O `addColorStop` exige posição crescente, e a força só pode cair.
      expect(paradas[i]![0]).toBeGreaterThan(paradas[i - 1]![0]);
      expect(paradas[i]![1]).toBeLessThan(paradas[i - 1]![1]);
    }
  });

  it("na borda do raio forte ainda sobra a maior parte da luz", () => {
    const naBorda = paradasDaLuz(fonte).find(([onde]) => onde === 0.5);

    expect(naBorda?.[1]).toBeCloseTo(0.8);
  });

  it("a intensidade multiplica tudo", () => {
    const metade = paradasDaLuz({ ...fonte, intensidade: 0.5 });

    expect(metade[0]).toEqual([0, 0.5]);
    expect(metade.find(([onde]) => onde === 0.5)?.[1]).toBeCloseTo(0.4);
  });

  it("sem raio forte, cai desde o centro", () => {
    const paradas = paradasDaLuz({ ...fonte, raioIntenso: 0 });

    expect(paradas[0]).toEqual([0, 1]);
    expect(paradas[1]![1]).toBeLessThan(1);
  });

  it("raio forte do tamanho da área ainda deixa uma borda macia", () => {
    const paradas = paradasDaLuz({ ...fonte, raioIntenso: 200 });

    expect(paradas.at(-1)?.[1]).toBeCloseTo(0);
    expect(paradas.at(-2)![0]).toBeLessThan(1);
  });
});

describe("chaveDasFontes", () => {
  const luz = {
    id: "t1",
    x: 10,
    y: 20,
    raio: 100,
    raioIntenso: 50,
    cor: "#fb923c",
    intensidade: 1,
  };

  it("os mesmos números dão a mesma chave, em listas novas", () => {
    // O caso do arrasto de um token SEM lanterna: a lista muda, a luz não.
    expect(chaveDasFontes([{ ...luz }])).toBe(chaveDasFontes([{ ...luz }]));
  });

  it("mover a luz muda a chave", () => {
    expect(chaveDasFontes([luz])).not.toBe(chaveDasFontes([{ ...luz, x: 11 }]));
  });

  it("mudar o raio forte muda a chave", () => {
    expect(chaveDasFontes([luz])).not.toBe(
      chaveDasFontes([{ ...luz, raioIntenso: 70 }]),
    );
  });

  it("mudar a intensidade muda a chave", () => {
    expect(chaveDasFontes([luz])).not.toBe(
      chaveDasFontes([{ ...luz, intensidade: 0.5 }]),
    );
  });

  it("trocar a cor muda a chave", () => {
    expect(chaveDasFontes([luz])).not.toBe(
      chaveDasFontes([{ ...luz, cor: "#93c5fd" }]),
    );
  });
});

describe("segmentosDasParedes", () => {
  it("parede sem caixa é ignorada, e não apaga a luz das outras", () => {
    const boa: Parede = {
      id: "p1",
      x: 100,
      y: 100,
      width: 100,
      height: 0,
      formato: "linha",
    };
    const podre = { ...boa, id: "p2", width: Number.NaN } as Parede;

    expect(segmentosDasParedes([boa, podre])).toHaveLength(1);
  });
});

describe("recortarNoCirculo", () => {
  const fonte = { x: 0, y: 0, raio: 100 };

  it("segmento todo dentro fica como está", () => {
    expect(recortarNoCirculo({ x1: 10, y1: 0, x2: 20, y2: 0 }, fonte)).toEqual({
      x1: 10,
      y1: 0,
      x2: 20,
      y2: 0,
    });
  });

  it("segmento que atravessa é cortado na borda", () => {
    const cortado = recortarNoCirculo({ x1: 0, y1: 0, x2: 300, y2: 0 }, fonte);

    expect(cortado?.x2).toBeCloseTo(100);
  });

  it("segmento todo fora não sobra nada", () => {
    expect(
      recortarNoCirculo({ x1: 200, y1: 200, x2: 300, y2: 200 }, fonte),
    ).toBeNull();
  });
});

describe("umbraDoSegmento", () => {
  const luz = { x: 0, y: 0, raio: 500 };
  const segmento = { x1: 100, y1: 100, x2: 200, y2: 100 };

  it("fecha um quadrilátero: as duas pontas e as duas projeções", () => {
    expect(umbraDoSegmento(segmento, luz)).toHaveLength(4);
  });

  it("projeta as pontas para LONGE da luz", () => {
    const distancias = umbraDoSegmento(segmento, luz)!
      .map((ponto) => Math.hypot(ponto.x, ponto.y))
      .sort((a, b) => a - b);

    // Duas pontas perto (as da parede) e duas longe (as projeções).
    expect(distancias[0]).toBeCloseTo(Math.hypot(100, 100), 0);
    expect(distancias[3]).toBeGreaterThan(luz.raio);
  });

  it("atrás da parede é sombra; na frente, não", () => {
    const umbra = umbraDoSegmento(segmento, luz)!;

    // Logo depois da parede, na linha que sai da luz: escuro.
    expect(dentro({ x: 160, y: 140 }, umbra)).toBe(true);
    // Entre a luz e a parede: aceso.
    expect(dentro({ x: 80, y: 50 }, umbra)).toBe(false);
  });

  it("a borda longe fica FORA do alcance inteira, e não só nas pontas", () => {
    // Um segmento largo visto de perto: é o caso em que a borda afundava no
    // meio e comia a sombra bem no centro dela.
    const largo = { x1: -200, y1: 60, x2: 200, y2: 60 };
    const longe = umbraDoSegmento(largo, luz)!
      .filter((ponto) => Math.hypot(ponto.x, ponto.y) > luz.raio)
      .sort((a, b) => a.x - b.x);

    expect(longe).toHaveLength(2);

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
    const pontos = umbraDoSegmento(
      { x1: 100, y1: 100, x2: 900, y2: 900 },
      luz,
    )!;

    // Quadrilátero, e não o triângulo torto de quando a ponta de fora ficava.
    expect(pontos).toHaveLength(4);

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
      .map((pedaco) => umbraDoSegmento(pedaco, luz))
      .filter((umbra) => umbra !== null)
      .map(areaComSinal);

    expect(areas).toHaveLength(4);
    // Zero é legítimo: o lado que aponta para a luz não joga área nenhuma.
    for (const area of areas) expect(area).toBeGreaterThanOrEqual(0);
    expect(areas.filter((area) => area > 0).length).toBeGreaterThanOrEqual(2);
  });
});

describe("umbrasDaLuz", () => {
  const luz = { x: 0, y: 0, raio: 500 };

  it("uma sombra por segmento alcançado", () => {
    const paredes: Parede[] = [
      { id: "p1", x: 100, y: 100, width: 100, height: 0, formato: "linha" },
      { id: "p2", x: 100, y: 100, width: 0, height: 100, formato: "linha" },
    ];

    expect(umbrasDaLuz(segmentosDasParedes(paredes), luz)).toHaveLength(2);
  });

  it("sem parede alcançada, nenhuma sombra", () => {
    const longe: Parede = {
      id: "p",
      x: 800,
      y: 800,
      width: 100,
      height: 100,
      formato: "linha",
    };

    expect(umbrasDaLuz(segmentosDasParedes([longe]), luz)).toEqual([]);
  });

  it("luz DENTRO de uma sala fechada: fora dela é escuro", () => {
    // O caso da tocha na parede de uma sala desenhada como retângulo. Com só
    // as faces que olham para fora, a sala ficaria acesa pelos dois lados.
    const sala: Parede = {
      id: "p",
      x: -100,
      y: -100,
      width: 200,
      height: 200,
      formato: "retangulo",
    };
    const umbras = umbrasDaLuz(segmentosDasParedes([sala]), luz);

    expect(umbras.some((umbra) => dentro({ x: 300, y: 0 }, umbra))).toBe(true);
    expect(umbras.some((umbra) => dentro({ x: 50, y: 0 }, umbra))).toBe(false);
  });
});

describe("a sombra do token", () => {
  const luz = { x: 0, y: 0, raio: 500 };
  const goblin = corpo("g", 200, 0, 20);

  it("fica ATRÁS do token, do lado oposto ao da luz", () => {
    const sombra = sombraDoToken(goblin, luz)!;

    // Logo atrás do pé: escuro. Na frente, entre a luz e o token: aceso.
    expect(dentro({ x: 240, y: 0 }, sombra.pontos)).toBe(true);
    expect(dentro({ x: 160, y: 0 }, sombra.pontos)).toBe(false);
  });

  it("é curta: não vai até a borda da luz como a da parede", () => {
    const sombra = sombraDoToken(goblin, luz)!;

    // 2,5 pés depois das costas do token, e nada além.
    expect(sombra.ate.x).toBeCloseTo(200 + 20 + 50);
    expect(dentro({ x: 400, y: 0 }, sombra.pontos)).toBe(false);
  });

  it("a metade de trás do próprio token fica na sombra, a da frente não", () => {
    const sombra = sombraDoToken(goblin, luz)!;

    expect(dentro({ x: 210, y: 0 }, sombra.pontos)).toBe(true);
    expect(dentro({ x: 190, y: 0 }, sombra.pontos)).toBe(false);
  });

  it("a luz dentro do pé -- a lanterna na mão -- não faz sombra", () => {
    expect(sombraDoToken(goblin, { x: 205, y: 0, raio: 300 })).toBeNull();
  });

  it("token fora do alcance não faz sombra", () => {
    expect(sombraDoToken(corpo("g", 900, 0, 20), luz)).toBeNull();
  });

  it("o pé é um círculo no centro da caixa, e `semSombra` não tapa nada", () => {
    const oclusores = oclusoresDosItens([
      item("t1", { x: 100, y: 200, width: 60, height: 40 }),
      item("t2", { semSombra: true }),
    ]);

    expect(oclusores).toEqual([
      {
        id: "t1",
        x: 130,
        y: 220,
        raio: 14,
        caixa: { x: 100, y: 200, width: 60, height: 40, rotation: 0 },
        assetId: "a",
      },
    ]);
  });

  it("só entra na chave quem alguma luz alcança", () => {
    // Arrastar um token longe de toda luz não pode repintar o canvas.
    const fonte = {
      id: "l",
      x: 0,
      y: 0,
      raio: 300,
      raioIntenso: 150,
      cor: "#fb923c",
      intensidade: 1,
    };
    const perto = corpo("a", 100, 0, 20);
    const longe = corpo("b", 900, 0, 20);

    expect(chaveDosOclusores([fonte], [perto, longe])).toBe(
      chaveDosOclusores([fonte], [perto, corpo("b", 950, 0, 20)]),
    );
    expect(chaveDosOclusores([fonte], [perto, longe])).not.toBe(
      chaveDosOclusores([fonte], [corpo("a", 110, 0, 20), longe]),
    );
  });

  it("girar o token muda a chave: a silhueta deitada muda junto", () => {
    const fonte = {
      id: "l",
      x: 0,
      y: 0,
      raio: 300,
      raioIntenso: 150,
      cor: "#fb923c",
      intensidade: 1,
    };
    const parado = corpo("a", 100, 0, 20);
    const girado = { ...parado, caixa: { ...parado.caixa, rotation: 90 } };

    expect(chaveDosOclusores([fonte], [parado])).not.toBe(
      chaveDosOclusores([fonte], [girado]),
    );
  });
});

describe("a silhueta deitada pela luz", () => {
  const luz = { x: 0, y: 0, raio: 500 };

  it("corre para LONGE da luz, e mais longe quanto mais longe está", () => {
    const perto = cisalhamentoDaLuz(corpo("a", 100, 0, 20), luz)!;
    const longe = cisalhamentoDaLuz(corpo("b", 450, 0, 20), luz)!;

    expect(perto.kx).toBeGreaterThan(0);
    expect(perto.ky).toBeCloseTo(0);
    expect(longe.kx).toBeGreaterThan(perto.kx);
    expect(longe.kx).toBeLessThanOrEqual(0.6);
  });

  it("do outro lado da luz, a sombra vai para o outro lado", () => {
    expect(cisalhamentoDaLuz(corpo("a", -100, 0, 20), luz)!.kx).toBeLessThan(0);
  });

  it("a lanterna na mão e o token fora do alcance não deitam nada", () => {
    expect(cisalhamentoDaLuz(corpo("a", 5, 0, 20), luz)).toBeNull();
    expect(cisalhamentoDaLuz(corpo("a", 900, 0, 20), luz)).toBeNull();
  });

  it("o PÉ fica onde está, e a cabeça corre", () => {
    const caixa = { x: 100, y: 100, width: 50, height: 80, rotation: 0 };
    const m = matrizDaFigura(caixa, { kx: 0.5, ky: 0, pe: 80 });

    // A sola, na base da caixa: não se mexe.
    expect(aplicarAfim(m, { x: 25, y: 80 })).toEqual({ x: 125, y: 180 });
    // O topo, oitenta acima do pé: corre 0,5 · 80 para a direita.
    const cabeca = aplicarAfim(m, { x: 25, y: 0 });
    expect(cabeca.x).toBeCloseTo(165);
    expect(cabeca.y).toBeCloseTo(100);
  });

  it("sem cisalhamento é a figura em pé, onde o token está", () => {
    const caixa = { x: 10, y: 20, width: 40, height: 40, rotation: 0 };

    expect(aplicarAfim(matrizDaFigura(caixa, null), { x: 0, y: 0 })).toEqual({
      x: 10,
      y: 20,
    });
  });

  it("gira em torno do centro, como o token", () => {
    const caixa = { x: 0, y: 0, width: 40, height: 40, rotation: 180 };
    const canto = aplicarAfim(matrizDaFigura(caixa, null), { x: 0, y: 0 });

    expect(canto.x).toBeCloseTo(40);
    expect(canto.y).toBeCloseTo(40);
  });

  it("a caixa da sombra cobre a figura deitada inteira", () => {
    const caixa = { x: 100, y: 100, width: 50, height: 80, rotation: 0 };
    const m = matrizDaFigura(caixa, { kx: 0.5, ky: 0, pe: 80 });
    const area = caixaDaMatriz(
      m,
      retanguloDaSilhueta(caixa, { margemX: 0, margemY: 0 }),
    );

    expect(area.x).toBe(100);
    expect(area.x + area.width).toBe(190);
    expect(area.y).toBe(100);
    expect(area.height).toBe(80);
  });
});

describe("caixaDaFonte", () => {
  it("é o quadrado do alcance", () => {
    expect(caixaDaFonte({ x: 500, y: 500, raio: 100 })).toEqual({
      x: 400,
      y: 400,
      width: 200,
      height: 200,
    });
  });

  it("presa ao plano: a luz no canto não pede rascunho maior que ele", () => {
    expect(caixaDaFonte({ x: 0, y: 0, raio: 5000 })).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it("luz inteira fora do plano não tem caixa", () => {
    expect(caixaDaFonte({ x: -500, y: -500, raio: 100 })).toBeNull();
  });
});

describe("limitarEscuridao", () => {
  it("prende entre 0 e 1", () => {
    expect(limitarEscuridao(-1)).toBe(0);
    expect(limitarEscuridao(2)).toBe(1);
    expect(limitarEscuridao(0.4)).toBe(0.4);
  });

  it("o que não é número é o mapa claro de sempre", () => {
    expect(limitarEscuridao(undefined)).toBe(0);
    expect(limitarEscuridao(Number.NaN)).toBe(0);
    expect(limitarEscuridao("0.5")).toBe(0);
  });
});
