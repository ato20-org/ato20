import { describe, expect, it } from "vitest";

import {
  anguloEntre,
  caixaDaFonte,
  tremorSoDe,
  chaveDasFontes,
  coneDe,
  corDoEscuroDe,
  fatorDoEfeito,
  FUNDO_DO_PULSO,
  anguloDoFacho,
  fontesDaCena,
  inicioDoCone,
  ladoDaLuz,
  paradasDoCone,
  sementeDaLuz,
  TREMIDA_DO_FOGO,
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
  donoDaFonte,
  RAIO_MAXIMO_DO_EFEITO,
} from "@/lib/geometry/luz";
import { escorrerDaFigura, segmentosDaParede } from "@/lib/geometry/sombra";
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

describe("anguloDoFacho", () => {
  it("sem giro nem espelho, é o ângulo da figura", () => {
    expect(anguloDoFacho({ rotation: 0 }, 90)).toBe(90);
  });

  it("o giro soma, e o resultado fica entre 0 e 360", () => {
    expect(anguloDoFacho({ rotation: 300 }, 90)).toBe(30);
    expect(anguloDoFacho({ rotation: -45 }, 0)).toBe(315);
  });

  it("espelhar na horizontal troca direita por esquerda", () => {
    // O facho para baixo e à direita (45) vira para baixo e à esquerda (135):
    // a figura espelhada olha para o outro lado, e a luz também.
    expect(anguloDoFacho({ rotation: 0, flipX: true }, 45)).toBe(135);
  });

  it("espelhar na vertical troca cima por baixo", () => {
    expect(anguloDoFacho({ rotation: 0, flipY: true }, 90)).toBe(270);
  });

  it("espelha ANTES de girar, na ordem do CanvasItemView", () => {
    // A imagem espelha dentro do contêiner que gira. Na ordem inversa o
    // resultado seria 180 - (0 + 90) = 90, e o facho sairia para o lado errado.
    expect(anguloDoFacho({ rotation: 90, flipX: true }, 0)).toBe(270);
  });
});

describe("fontesDaCena", () => {
  const solta: Luz = { id: "l1", x: 50, y: 60, raio: 200, cor: "#fb923c" };

  it("junta a luz solta e a do token numa lista só", () => {
    const fontes = fontesDaCena(
      [solta],
      [item("t1", { luz: { raio: 150, cor: "#93c5fd" } })],
    );

    expect(fontes.map((fonte) => fonte.id)).toEqual(["l1", "t1"]);
  });

  it("a lanterna em cone gira com o token", () => {
    // O ângulo guardado é o da figura. O token girado 30 graus leva o facho
    // junto: quem vira a cabeça no corredor leva a luz.
    const [fonte] = fontesDaCena(
      [],
      [
        item("t1", {
          rotation: 30,
          luz: { raio: 150, cor: "#93c5fd", cone: { angulo: 90, abertura: 60 } },
        }),
      ],
    );

    expect(fonte?.cone).toEqual({ angulo: 120, abertura: 60 });
  });

  it("a lanterna com cone podre acende como círculo", () => {
    // Um `NaN` no cone jogaria exceção no degradê cônico, e a luz do mapa
    // inteiro apagaria por causa de uma lanterna.
    const [fonte] = fontesDaCena(
      [],
      [
        item("t1", {
          luz: {
            raio: 150,
            cor: "#93c5fd",
            cone: { angulo: Number.NaN, abertura: 60 },
          },
        }),
      ],
    );

    expect(fonte?.cone).toBeUndefined();
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

  it("a desligada não acende nada, e as outras continuam", () => {
    const fontes = fontesDaCena(
      [solta, { ...solta, id: "l2", desligada: true }],
      [],
    );

    expect(fontes.map((fonte) => fonte.id)).toEqual(["l1"]);
  });

  it("o cone e o efeito passam para a fonte", () => {
    const [fonte] = fontesDaCena(
      [{ ...solta, cone: { angulo: 90, abertura: 45 }, efeito: "fogo" }],
      [],
    );

    expect(fonte).toMatchObject({
      cone: { angulo: 90, abertura: 45 },
      efeito: "fogo",
    });
  });

  it("sem cone é círculo, e sem efeito é fixa", () => {
    const [fonte] = fontesDaCena([solta], []);

    expect(fonte).not.toHaveProperty("cone");
    expect(fonte).not.toHaveProperty("efeito");
  });

  it("a lanterna do token acende na intensidade dela", () => {
    const [fraca, antiga] = fontesDaCena(
      [],
      [
        item("t1", { luz: { raio: 150, cor: "#fb923c", intensidade: 0.35 } }),
        // Sem o campo é a lanterna de antes de a intensidade existir.
        item("t2", { luz: { raio: 150, cor: "#fb923c" } }),
      ],
    );

    expect(fraca?.intensidade).toBe(0.35);
    expect(antiga?.intensidade).toBe(1);
  });

  it("a lanterna com intensidade podre acende inteira", () => {
    const [fonte] = fontesDaCena(
      [],
      [
        item("t1", {
          luz: { raio: 150, cor: "#fb923c", intensidade: Number.NaN },
        }),
      ],
    );

    expect(fonte?.intensidade).toBe(1);
  });

  it("a lanterna do token também tremula", () => {
    const [fonte] = fontesDaCena(
      [],
      [item("t1", { luz: { raio: 150, cor: "#fb923c", efeito: "fogo" } })],
    );

    expect(fonte?.efeito).toBe("fogo");
  });

  it("efeito de uma versão futura acende fixo, e não apaga a luz", () => {
    const [fonte] = fontesDaCena(
      [{ ...solta, efeito: "arco-iris" as never }],
      [],
    );

    expect(fonte?.id).toBe("l1");
    expect(fonte).not.toHaveProperty("efeito");
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

  it("virar cone, e girar o cone, muda a chave", () => {
    const cone = { ...luz, cone: { angulo: 0, abertura: 60 } };

    expect(chaveDasFontes([luz])).not.toBe(chaveDasFontes([cone]));
    expect(chaveDasFontes([cone])).not.toBe(
      chaveDasFontes([{ ...cone, cone: { angulo: 30, abertura: 60 } }]),
    );
  });

  it("trocar o efeito muda a chave: é ele que liga o laço", () => {
    expect(chaveDasFontes([luz])).not.toBe(
      chaveDasFontes([{ ...luz, efeito: "fogo" as const }]),
    );
  });
});

describe("coneDe", () => {
  it("prende a abertura entre os limites", () => {
    expect(coneDe({ angulo: 0, abertura: 2 })?.abertura).toBe(10);
    expect(coneDe({ angulo: 0, abertura: 359 })?.abertura).toBe(270);
  });

  it("cone podre vira círculo, e não derruba a luz", () => {
    // `createConicGradient` joga exceção com NaN, como o radial.
    expect(coneDe({ angulo: Number.NaN, abertura: 60 })).toBeUndefined();
    expect(coneDe({ angulo: 0 })).toBeUndefined();
    expect(coneDe(undefined)).toBeUndefined();
  });
});

describe("paradasDoCone", () => {
  const paradas = paradasDoCone(60);

  it("vai de zero a zero numa volta, sempre crescendo no `onde`", () => {
    expect(paradas[0]).toEqual([0, 0]);
    expect(paradas.at(-1)).toEqual([1, 0]);
    for (let i = 1; i < paradas.length; i += 1) {
      expect(paradas[i]![0]).toBeGreaterThanOrEqual(paradas[i - 1]![0]);
    }
  });

  it("o facho fica no meio da volta, em torno de 0,5", () => {
    const acesas = paradas.filter(([, forca]) => forca === 1);

    expect(acesas).toHaveLength(2);
    // A borda nominal, a 30 graus do eixo, cai no meio da borda macia.
    const [antes, depois] = [paradas[1]!, paradas[2]!];
    expect((antes[0] + depois[0]) / 2).toBeCloseTo(0.5 - 30 / 360);
  });

  it("a volta começa do lado oposto ao eixo", () => {
    expect(inicioDoCone({ angulo: 0 })).toBeCloseTo(-Math.PI);
    expect(inicioDoCone({ angulo: 90 })).toBeCloseTo(-Math.PI / 2);
  });

  it("até na abertura máxima a borda macia não cruza a emenda", () => {
    const larga = paradasDoCone(270);

    expect(larga[1]![0]).toBeGreaterThan(0);
    expect(larga[4]![0]).toBeLessThan(1);
  });
});

describe("fatorDoEfeito", () => {
  const semente = sementeDaLuz("tocha");
  const amostras = (efeito: Parameters<typeof fatorDoEfeito>[0]) =>
    Array.from({ length: 2000 }, (_, i) =>
      fatorDoEfeito(efeito, i * 0.01, semente),
    );

  it("a fixa é sempre a luz inteira", () => {
    expect(new Set(amostras(undefined))).toEqual(new Set([1]));
  });

  it("o fogo tremula sem nunca apagar", () => {
    const fogo = amostras("fogo");

    expect(Math.min(...fogo)).toBeGreaterThanOrEqual(1 - TREMIDA_DO_FOGO);
    expect(Math.max(...fogo)).toBeLessThanOrEqual(1);
    expect(Math.max(...fogo) - Math.min(...fogo)).toBeGreaterThan(0.1);
  });

  it("o fogo não salta: um centésimo de segundo muda pouco", () => {
    const fogo = amostras("fogo");
    const saltos = fogo.slice(1).map((valor, i) => Math.abs(valor - fogo[i]!));

    expect(Math.max(...saltos)).toBeLessThan(0.05);
  });

  it("o pulso respira entre o fundo e a luz inteira", () => {
    const pulso = amostras("pulsando");

    expect(Math.min(...pulso)).toBeCloseTo(FUNDO_DO_PULSO, 2);
    expect(Math.max(...pulso)).toBeCloseTo(1, 2);
  });

  it("o pisca apaga de verdade, e acende inteiro", () => {
    const pisca = amostras("piscando");

    expect(Math.min(...pisca)).toBe(0);
    expect(Math.max(...pisca)).toBe(1);
  });

  it("duas tochas não tremem em uníssono", () => {
    const outra = sementeDaLuz("outra tocha");

    expect(fatorDoEfeito("fogo", 3.21, semente)).not.toBe(
      fatorDoEfeito("fogo", 3.21, outra),
    );
  });

  it("a mesma tocha treme igual, em qualquer tela", () => {
    expect(fatorDoEfeito("fogo", 7.5, sementeDaLuz("tocha"))).toBe(
      fatorDoEfeito("fogo", 7.5, sementeDaLuz("tocha")),
    );
  });
});

describe("anguloEntre", () => {
  it("vai pela volta curta, mesmo cruzando o zero", () => {
    expect(anguloEntre(350, 10, 0.5) % 360).toBeCloseTo(0);
    expect(anguloEntre(10, 350, 0.5)).toBeCloseTo(0);
  });

  it("nas pontas é o de partida e o de chegada", () => {
    expect(anguloEntre(40, 100, 0)).toBe(40);
    expect(anguloEntre(40, 100, 1)).toBe(100);
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
    const m = matrizDaFigura(caixa, escorrerDaFigura(0.5, 0, 80));

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
    const m = matrizDaFigura(caixa, escorrerDaFigura(0.5, 0, 80));
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
  it("a luz com forma cobre o contorno crescido pelo raio, e não o círculo do meio", () => {
    const forma = [
      { x: 400, y: 300 },
      { x: 800, y: 300 },
      { x: 800, y: 400 },
      { x: 400, y: 400 },
    ];

    expect(caixaDaFonte({ x: 600, y: 350, raio: 50, forma })).toEqual({
      x: 350,
      y: 250,
      width: 500,
      height: 200,
    });
  });

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

  it("o cone pede só o retângulo do facho, com a borda macia dentro", () => {
    // Sessenta graus para a direita, e cinco de borda macia de cada lado: as
    // bordas a 35 graus do eixo.
    const meia = Math.sin((35 * Math.PI) / 180) * 100;

    expect(
      caixaDaFonte({
        x: 500,
        y: 500,
        raio: 100,
        cone: { angulo: 0, abertura: 60 },
      }),
    ).toEqual({
      x: 500,
      y: Math.floor(500 - meia),
      width: 100,
      height: Math.ceil(500 + meia) - Math.floor(500 - meia),
    });
  });

  it("o cone que cruza um eixo alcança o ponto mais longe do arco nele", () => {
    // Para baixo, cento e vinte graus: o fundo do arco é o ponto mais baixo,
    // e não uma das pontas.
    const caixa = caixaDaFonte({
      x: 500,
      y: 500,
      raio: 100,
      cone: { angulo: 90, abertura: 120 },
    });

    expect(caixa?.y).toBe(500);
    expect(caixa!.y + caixa!.height).toBe(600);
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

describe("ladoDaLuz", () => {
  const luz = { x: 0, y: 500, raio: 800 };

  it("vai do lado virado para a luz ao lado oposto", () => {
    const lado = ladoDaLuz(corpo("t", 400, 500, 35), luz)!;

    expect(lado.de.x).toBeLessThan(400);
    expect(lado.ate.x).toBeGreaterThan(400);
    expect(lado.de.y).toBeCloseTo(500);
    expect(lado.ate.y).toBeCloseTo(500);
  });

  it("atravessa a caixa inteira na direção da luz", () => {
    // `corpo` monta uma caixa quadrada de lado raio / 0,35: 100 aqui.
    const lado = ladoDaLuz(corpo("t", 400, 500, 35), luz)!;

    expect(lado.ate.x - lado.de.x).toBeCloseTo(100);
  });

  it("a luz vindo de cima põe o lado escuro embaixo", () => {
    const lado = ladoDaLuz(corpo("t", 0, 900, 35), {
      x: 0,
      y: 500,
      raio: 800,
    })!;

    expect(lado.de.y).toBeLessThan(lado.ate.y);
  });

  it("girar a caixa muda o quanto ela ocupa na direção da luz", () => {
    const reto = corpo("t", 400, 500, 35);
    const deitado = {
      ...reto,
      caixa: { ...reto.caixa, width: 200, height: 40 },
    };
    const girado = {
      ...deitado,
      caixa: { ...deitado.caixa, rotation: 90 },
    };

    const largura = (o: Oclusor) => {
      const lado = ladoDaLuz(o, luz)!;
      return lado.ate.x - lado.de.x;
    };

    expect(largura(deitado)).toBeCloseTo(200);
    expect(largura(girado)).toBeCloseTo(40);
  });

  it("a lanterna na mão e o token fora do alcance não têm lado", () => {
    expect(ladoDaLuz(corpo("t", 5, 500, 35), luz)).toBeNull();
    expect(ladoDaLuz(corpo("t", 5000, 500, 35), luz)).toBeNull();
  });
});

describe("corDoEscuroDe", () => {
  it("devolve a cor escolhida, normalizada", () => {
    expect(corDoEscuroDe("#0B1330")).toBe("#0b1330");
  });

  it("o que não é cor vira o breu, e não some", () => {
    // Um `fillStyle` inválido o canvas ignora em silêncio, e o escuro sairia
    // na cor do último desenho.
    expect(corDoEscuroDe(undefined)).toBe("#000000");
    expect(corDoEscuroDe("azul")).toBe("#000000");
    expect(corDoEscuroDe(42)).toBe("#000000");
  });
});

describe("a luz dos efeitos de condição", () => {
  const goblin = {
    id: "goblin",
    assetId: "a",
    x: 100,
    y: 200,
    width: 80,
    height: 60,
    rotation: 0,
    z: 1,
    luz: { raio: 160, cor: "#ffffff" },
  } as CanvasItem;

  it("vira uma fonte do item, ao lado da lanterna, medida pela figura", () => {
    const fontes = fontesDaCena(undefined, [goblin], () => ({
      raio: 2.5,
      cor: "#f59e0b",
      intensidade: 0.8,
      efeito: "fogo",
    }));

    expect(fontes).toHaveLength(2);
    const doEfeito = fontes.find((fonte) => fonte.id === "goblin#efeito")!;
    // Do centro, e o raio em vezes o lado maior.
    expect(doEfeito).toMatchObject({ x: 140, y: 230, raio: 200, cor: "#f59e0b", efeito: "fogo" });
    expect(doEfeito.intensidade).toBeCloseTo(0.8);
  });

  it("continua sendo do item: é por ele que o token não tapa a própria luz", () => {
    const [lanterna, fogo] = fontesDaCena(undefined, [goblin], () => ({
      raio: 2,
      cor: "#f59e0b",
      intensidade: 1,
    }));

    expect(donoDaFonte(lanterna!)).toBe("goblin");
    expect(donoDaFonte(fogo!)).toBe("goblin");
  });

  it("figura grande não acende o mapa inteiro: o raio tem teto", () => {
    const dragao = { ...goblin, width: 300, height: 300 };
    const [, fogo] = fontesDaCena(undefined, [dragao], () => ({
      raio: 10,
      cor: "#f59e0b",
      intensidade: 1,
    }));

    expect(fogo!.raio).toBe(RAIO_MAXIMO_DO_EFEITO);
  });

  it("sem quem pergunte, só as luzes de sempre", () => {
    expect(fontesDaCena(undefined, [goblin])).toHaveLength(1);
  });
});

describe("tremorSoDe", () => {
  const base = { raio: 100, raioIntenso: 40, cor: "#f59e0b", intensidade: 1 };
  const fontes = [
    { ...base, id: "tocha", x: 0, y: 0, efeito: "fogo" as const },
    { ...base, id: "goblin#efeito", dono: "goblin", x: 10, y: 0, efeito: "fogo" as const },
    { ...base, id: "area#luz", dono: "area", x: 20, y: 0, efeito: "fogo" as const },
  ];

  it("sem lista, todas tremulam: é a mesa", () => {
    expect(tremorSoDe(fontes, undefined)).toBe(fontes);
  });

  it("no Mestre, só a de efeito do selecionado tremula; a tocha cravada segue", () => {
    const efeitos = tremorSoDe(fontes, new Set(["area"])).map((fonte) => fonte.efeito);

    expect(efeitos).toEqual(["fogo", undefined, "fogo"]);
  });
});
