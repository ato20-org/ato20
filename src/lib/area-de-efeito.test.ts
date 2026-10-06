import { describe, expect, it } from "vitest";

import {
  ALTURA_DA_CHAMA_DE_PE,
  chamasDePe,
  COR_DA_AREA,
  corDaArea,
  efeitosDeAreaProntos,
  efeitosEmAreaDaCampanha,
  efeitosEmAreaDosPlugins,
  densidadeDoEfeito,
  MAX_CHAMAS_DE_PE,
  dentroDaArea,
  divisoesDaArea,
  divisoesDoEfeito,
  EFEITOS_DE_AREA,
  fontesDaArea,
  LARGURA_DA_BORDA,
  ladoDoSegmento,
  MAX_SEGMENTOS,
  planoDaArea,
  segmentosDaArea,
} from "@/lib/area-de-efeito";
import { RAIO_MAXIMO_DO_EFEITO } from "@/lib/geometry/luz";
import type { AreaDeEfeito, SceneGrid } from "@/types/scene";

function area(parcial: Partial<AreaDeEfeito> = {}): AreaDeEfeito {
  return {
    id: "a1",
    x: 0,
    y: 0,
    width: 192,
    height: 192,
    efeito: "chamas",
    cor: "#f59e0b",
    ...parcial,
  };
}

const GRADE: SceneGrid = { size: 96, offsetX: 0, offsetY: 0, opacity: 0.35 };
const FOGO = { raio: 2.5, cor: "#f59e0b", intensidade: 0.85, efeito: "fogo" as const };
const OPCOES = { escala: 1.5, total: 16, fps: 14 };
const FAGULHAS = {
  quantidade: 10,
  pintar: false,
  cor: "#f59e0b",
  giro: 0,
  tamanho: 0.045,
  variacao: 0.6,
  direcao: 270,
  abertura: 50,
  velocidade: 0.9,
  vida: 1.4,
  emissor: { largura: 0.8, altura: 0.35, ancora: "base" as const },
};

/** O pé de cada foco, em cena: o meio de baixo do sprite. */
function pesEmCena(plano: NonNullable<ReturnType<typeof planoDaArea>>) {
  const pixels = plano.quadro.largura / plano.caixa.width;
  return plano.focos.map((foco) => ({
    x: plano.caixa.x + (foco.x + foco.lado / 2) / pixels,
    y: plano.caixa.y + (foco.y + foco.lado) / pixels,
  }));
}

/** O fogo de fábrica, pelo id: a lista é em ordem de título, e o gelo vem antes. */
const FOGO_DE_FABRICA = EFEITOS_DE_AREA.find((efeito) => efeito.id === "chamas");

describe("EFEITOS_DE_AREA", () => {
  it("são os da fábrica que declaram área, em ordem de título", () => {
    expect(EFEITOS_DE_AREA.map((efeito) => efeito.id)).toEqual([
      "congelado",
      "chamas",
      "envenenado",
      "molhado",
    ]);
  });
});

describe("corDaArea", () => {
  it("a da área, senão a do efeito, senão a do fogo", () => {
    const fogo = { id: "f", titulo: "F", area: { cor: "#ff0000" } };

    expect(corDaArea({ cor: "#00ff00" }, fogo)).toBe("#00ff00");
    expect(corDaArea({}, fogo)).toBe("#ff0000");
    expect(corDaArea({}, undefined)).toBe(COR_DA_AREA);
  });
});

describe("efeitosEmAreaDaCampanha", () => {
  it("os da campanha com área, menos os que uma condição usa", () => {
    const efeitos = [
      { id: "campanha/a", titulo: "Incêndio", area: {} },
      { id: "campanha/b", titulo: "Fogo da condição", area: {} },
      { id: "campanha/c", titulo: "Só da figura" },
    ];

    expect(
      efeitosEmAreaDaCampanha(efeitos, new Set(["campanha/b"])).map((efeito) => efeito.id),
    ).toEqual(["campanha/a"]);
    expect(efeitosEmAreaDaCampanha(null, new Set())).toEqual([]);
  });
});

describe("efeitosDeAreaProntos", () => {
  it("os de fábrica, e os de plugin que declaram área", () => {
    const deFora = {
      "ordem/nevoa": { id: "ordem/nevoa", titulo: "Névoa", area: {}, origem: { plugin: "ordem", versao: "1" } },
      "ordem/aura": { id: "ordem/aura", titulo: "Aura", origem: { plugin: "ordem", versao: "1" } },
      "campanha/x": { id: "campanha/x", titulo: "X", area: {}, origem: { acervo: true as const } },
    };

    expect(efeitosDeAreaProntos(deFora).map((efeito) => efeito.id)).toEqual([
      "congelado",
      "chamas",
      "envenenado",
      "molhado",
      "ordem/nevoa",
    ]);
  });
});

describe("efeitosEmAreaDosPlugins", () => {
  it("só os de plugin que declaram área, nem fábrica nem campanha", () => {
    const deFora = {
      "ordem/nevoa": { id: "ordem/nevoa", titulo: "Névoa", area: {}, origem: { plugin: "ordem", versao: "1" } },
      "ordem/aura": { id: "ordem/aura", titulo: "Aura", origem: { plugin: "ordem", versao: "1" } },
      "campanha/x": { id: "campanha/x", titulo: "X", area: {}, origem: { acervo: true as const } },
    };

    expect(efeitosEmAreaDosPlugins(deFora).map((efeito) => efeito.id)).toEqual(["ordem/nevoa"]);
    expect(efeitosEmAreaDosPlugins(undefined)).toEqual([]);
  });
});

describe("ladoDoSegmento", () => {
  it("é a casa da grade, e a da grade padrão sem grade", () => {
    expect(ladoDoSegmento({ ...GRADE, size: 70 })).toBe(70);
    expect(ladoDoSegmento(undefined)).toBe(96);
  });
});

describe("divisoesDoEfeito", () => {
  it("o fogo divide a casa em quatro; sem dizer, a casa inteira", () => {
    expect(divisoesDoEfeito(FOGO_DE_FABRICA)).toBe(2);
    expect(divisoesDoEfeito(undefined)).toBe(1);
    expect(divisoesDoEfeito({ id: "x", titulo: "X", area: { divisoes: 9 } })).toBe(4);
  });
});

describe("divisoesDaArea", () => {
  it("a área pequena divide mais a casa: a chama encolhe com ela", () => {
    // Quatro segmentos no menor lado, no mínimo.
    expect(divisoesDaArea(area({ width: 960, height: 960 }), GRADE, 2, 4)).toBe(2);
    expect(divisoesDaArea(area({ width: 96, height: 96 }), GRADE, 2, 4)).toBe(4);
    expect(divisoesDaArea(area({ width: 48, height: 300 }), GRADE, 2, 4)).toBe(8);
    // Nunca mais que oito: o segmento não vira pó.
    expect(divisoesDaArea(area({ width: 10, height: 10 }), GRADE, 2, 4)).toBe(8);
    // Sem densidade, as divisões do efeito.
    expect(divisoesDaArea(area({ width: 10, height: 10 }), GRADE, 2)).toBe(2);
  });

  it("o fogo pede quatro no menor lado", () => {
    expect(densidadeDoEfeito(FOGO_DE_FABRICA)).toBe(4);
    expect(densidadeDoEfeito(undefined)).toBe(0);
  });

  it("com a densidade, a área de uma casa arde em dezesseis segmentos", () => {
    const { lado, segmentos } = segmentosDaArea(area({ width: 96, height: 96 }), GRADE, 2, 4);

    expect(lado).toBe(24);
    expect(segmentos).toHaveLength(16);
  });
});

describe("dentroDaArea", () => {
  it("o retângulo é a caixa inteira", () => {
    expect(dentroDaArea(area(), { x: 5, y: 5 })).toBe(true);
    expect(dentroDaArea(area(), { x: 200, y: 5 })).toBe(false);
  });

  it("a elipse deixa os cantos de fora", () => {
    const elipse = area({ formato: "elipse" });

    expect(dentroDaArea(elipse, { x: 96, y: 96 })).toBe(true);
    expect(dentroDaArea(elipse, { x: 10, y: 10 })).toBe(false);
  });

  it("o polígono recorta pelos vértices", () => {
    // Um triângulo: o canto de cima à esquerda, o de cima à direita e o de baixo à esquerda.
    const triangulo = area({ formato: "poligono", pontos: [0, 0, 1, 0, 0, 1] });

    expect(dentroDaArea(triangulo, { x: 30, y: 30 })).toBe(true);
    expect(dentroDaArea(triangulo, { x: 170, y: 170 })).toBe(false);
  });

  it("o giro vale: o retângulo deitado e girado 90° vira em pé", () => {
    const deitado = area({ x: 0, y: 80, width: 200, height: 40, rotation: 90 });

    expect(dentroDaArea(deitado, { x: 100, y: 10 })).toBe(true);
    expect(dentroDaArea(deitado, { x: 10, y: 100 })).toBe(false);
  });
});

describe("segmentosDaArea", () => {
  it("as casas da grade cujo centro cai dentro", () => {
    const { lado, segmentos } = segmentosDaArea(area(), GRADE);

    expect(lado).toBe(96);
    expect(segmentos.map(({ x, y }) => [x, y])).toEqual([
      [0, 0],
      [96, 0],
      [0, 96],
      [96, 96],
    ]);
  });

  it("alinha ao deslocamento da grade, como as casas que o mestre conta", () => {
    const { segmentos } = segmentosDaArea(area({ x: 10, y: 10 }), { ...GRADE, offsetX: 10, offsetY: 10 });

    expect(segmentos[0]).toMatchObject({ x: 10, y: 10 });
  });

  it("dividida em dois, cada casa vira quatro segmentos, ainda na grade", () => {
    const { lado, segmentos } = segmentosDaArea(area(), GRADE, 2);

    expect(lado).toBe(48);
    expect(segmentos).toHaveLength(16);
    expect(segmentos.every(({ x, y }) => x % 48 === 0 && y % 48 === 0)).toBe(true);
  });

  it("fora do plano não pega fogo", () => {
    const { segmentos } = segmentosDaArea(area({ x: -192 }), GRADE);

    expect(segmentos).toEqual([]);
  });

  it("a sala enorme dobra o segmento em vez de passar do teto", () => {
    const { lado, segmentos } = segmentosDaArea(
      area({ width: 1920, height: 1080 }),
      { ...GRADE, size: 10 },
    );

    expect(segmentos.length).toBeLessThanOrEqual(MAX_SEGMENTOS);
    expect(lado).toBeGreaterThan(10);
    expect(lado % 10).toBe(0);
  });
});

describe("planoDaArea", () => {
  it("a caixa cerca todas as casas, e as chamas sobem além da de cima", () => {
    // Duas casas por duas, longe das bordas.
    const plano = planoDaArea(area({ x: 96, y: 192 }), GRADE, OPCOES)!;

    expect(plano.caixa.x).toBeLessThanOrEqual(96);
    expect(plano.caixa.x + plano.caixa.width).toBeGreaterThanOrEqual(96 + 192 - 96 * 0.15);
    expect(plano.caixa.y).toBeLessThan(192 - 96 * 0.4);
    expect(plano.caixa.y + plano.caixa.height).toBeLessThanOrEqual(192 + 192);
  });

  it("três focos por casa, cada um na sua fase", () => {
    const plano = planoDaArea(area({ x: 96, y: 192 }), GRADE, OPCOES)!;

    expect(plano.focos).toHaveLength(4 * 3);
    expect(new Set(plano.focos.map((foco) => foco.fase)).size).toBeGreaterThan(1);
  });

  it("presa ao plano: nada passa da borda de cima nem da esquerda", () => {
    const plano = planoDaArea(area(), GRADE, OPCOES)!;

    expect(plano.caixa.x).toBeGreaterThanOrEqual(0);
    expect(plano.caixa.y).toBe(0);
  });

  it("o quadro da folha não passa de 512 px", () => {
    const plano = planoDaArea(area({ width: 1920, height: 1080 }), GRADE, OPCOES)!;

    expect(Math.max(plano.quadro.largura, plano.quadro.altura)).toBeLessThanOrEqual(512);
  });

  it("arrastada de casa em casa, a área pede ao forno a mesma folha", () => {
    const aqui = planoDaArea(area({ x: 96, y: 192 }), GRADE, OPCOES)!;
    const ali = planoDaArea(area({ x: 96 * 5, y: 192 + 96 * 2 }), GRADE, OPCOES)!;

    expect(ali.focos).toEqual(aqui.focos);
    expect(ali.quadro).toEqual(aqui.quadro);
  });

  it("crescer para a direita não embaralha o fogo de quem já ardia", () => {
    const pequena = planoDaArea(area({ x: 96, y: 192 }), GRADE, OPCOES)!;
    const grande = planoDaArea(area({ x: 96, y: 192, width: 384 }), GRADE, OPCOES)!;
    // Em cena, porque a caixa da grande pode começar em outro lugar.
    const emCena = (plano: typeof pequena) =>
      plano.focos.map((foco) => ({
        x: plano.caixa.x + foco.x / (plano.quadro.largura / plano.caixa.width),
        y: plano.caixa.y + foco.y / (plano.quadro.altura / plano.caixa.height),
        fase: foco.fase,
      }));
    const daGrande = emCena(grande);

    for (const foco of emCena(pequena)) {
      expect(
        daGrande.some(
          (outro) =>
            outro.fase === foco.fase && Math.abs(outro.x - foco.x) < 1 && Math.abs(outro.y - foco.y) < 1,
        ),
      ).toBe(true);
    }
  });

  it("o pé de cada chama fica dentro da forma: só a língua passa da borda", () => {
    const elipse = area({ x: 96, y: 192, width: 384, height: 288, formato: "elipse" });
    const plano = planoDaArea(elipse, GRADE, OPCOES)!;
    // A elipse um fio maior, pelo arredondamento da folha.
    const folga = { ...elipse, x: elipse.x - 2, y: elipse.y - 2, width: elipse.width + 4, height: elipse.height + 4 };

    expect(pesEmCena(plano).every((pe) => dentroDaArea(folga, pe))).toBe(true);
  });

  it("o contorno é a forma girada, dentro do quadro", () => {
    const girado = planoDaArea(area({ x: 300, y: 300, rotation: 45 }), GRADE, OPCOES)!;

    expect(girado.contorno).toHaveLength(4);
    for (const ponto of girado.contorno) {
      expect(ponto.x).toBeGreaterThanOrEqual(-0.1);
      expect(ponto.y).toBeGreaterThanOrEqual(-0.1);
      expect(ponto.x).toBeLessThanOrEqual(girado.quadro.largura + 0.1);
      expect(ponto.y).toBeLessThanOrEqual(girado.quadro.altura + 0.1);
    }
    expect(planoDaArea(area({ formato: "elipse" }), GRADE, OPCOES)!.contorno.length).toBeGreaterThan(16);
  });

  it("o ladrilho da base começa onde a grade começa, antes da caixa", () => {
    const plano = planoDaArea(area({ x: 96, y: 192 }), GRADE, { ...OPCOES, escalaDaBase: 1 })!;
    const pixels = plano.quadro.largura / plano.caixa.width;

    expect(plano.ladrilho.lado).toBeCloseTo(96 * pixels, 0);
    expect(plano.ladrilho.x).toBeLessThanOrEqual(0);
    expect(plano.ladrilho.x).toBeGreaterThan(-plano.ladrilho.lado - 0.2);
    // A grade passa em x = 96: o ladrilho, levado para a cena, cai numa linha dela.
    const linha = plano.caixa.x + plano.ladrilho.x / pixels;
    expect(Math.abs(((linha % 96) + 96) % 96) < 0.5 || Math.abs((((linha % 96) + 96) % 96) - 96) < 0.5).toBe(true);
  });

  it("com base, a borda esfumaçada: meia casa, e a caixa cresce para a fumaça caber", () => {
    const sem = planoDaArea(area({ x: 192, y: 192 }), GRADE, OPCOES)!;
    const com = planoDaArea(area({ x: 192, y: 192 }), GRADE, { ...OPCOES, escalaDaBase: 1 })!;
    const pixels = com.quadro.largura / com.caixa.width;
    const fumaca = 96 * LARGURA_DA_BORDA;

    expect(sem.borda).toBeUndefined();
    expect(com.borda!.largura).toBeCloseTo(fumaca * pixels, 0);
    expect(com.caixa.x).toBeLessThanOrEqual(192 - fumaca);
    expect(com.caixa.x + com.caixa.width).toBeGreaterThanOrEqual(192 + 192 + fumaca);
    expect(com.caixa.y + com.caixa.height).toBeGreaterThanOrEqual(192 + 192 + fumaca);
    // Arrastada, a mesma textura: a semente é a da área, e não a do lugar.
    const longe = planoDaArea(area({ x: 960, y: 480 }), GRADE, { ...OPCOES, escalaDaBase: 1 })!;
    expect(longe.borda).toEqual(com.borda);
  });

  it("na área pequena, a borda é um terço do menor lado", () => {
    const pequena = planoDaArea(area({ x: 192, y: 192, width: 60, height: 300 }), GRADE, {
      ...OPCOES,
      escalaDaBase: 1,
    })!;
    const pixels = pequena.quadro.largura / pequena.caixa.width;

    expect(pequena.borda!.largura / pixels).toBeCloseTo(20, 0);
  });

  it("as fagulhas nascem dentro da área e cabem no teto", () => {
    const plano = planoDaArea(area({ x: 96, y: 192 }), GRADE, { ...OPCOES, particulas: FAGULHAS })!;
    const grande = planoDaArea(area({ width: 1920, height: 1080 }), GRADE, { ...OPCOES, particulas: FAGULHAS })!;

    expect(plano.fagulhas).toHaveLength(10);
    expect(grande.fagulhas.length).toBeLessThanOrEqual(60);
    for (const fagulha of plano.fagulhas) {
      expect(fagulha.dy).toBeLessThan(0);
      expect(fagulha.x).toBeGreaterThanOrEqual(0);
      expect(fagulha.x).toBeLessThanOrEqual(1);
    }
    expect(planoDaArea(area(), GRADE, OPCOES)!.fagulhas).toEqual([]);
  });

  it("a área menor que uma casa arde no meio, e a chama não passa do tamanho dela", () => {
    const pequena = area({ x: 100, y: 100, width: 20, height: 20 });
    const plano = planoDaArea(pequena, GRADE, OPCOES)!;
    const pixels = plano.quadro.largura / plano.caixa.width;

    // Com folga: numa folha deste tamanho, arredondar a largura muda a escala
    // que o teste recalcula em alguns por cento.
    expect(plano.focos.length).toBeGreaterThan(0);
    expect(plano.focos.every((foco) => foco.lado <= 20 * pixels * 1.06)).toBe(true);
    for (const pe of pesEmCena(plano)) {
      expect(Math.abs(pe.x - 110)).toBeLessThan(1.5);
      expect(Math.abs(pe.y - 110)).toBeLessThan(1.5);
    }
  });

  it("fora do plano, sem plano", () => {
    expect(planoDaArea(area({ width: 20, height: 20, x: -500, y: 2 }), GRADE, OPCOES)).toBeNull();
  });
});

describe("chamasDePe", () => {
  it("na área pequena, uma chama de pé por segmento, com o pé dentro dela", () => {
    const chamas = chamasDePe(area(), GRADE, OPCOES);

    expect(chamas).toHaveLength(4);
    for (const chama of chamas) {
      const pe = { x: chama.x + chama.lado / 2, y: chama.y + chama.lado };
      expect(dentroDaArea(area(), pe)).toBe(true);
      expect(chama.lado).toBeLessThanOrEqual(192);
    }
  });

  it("a sala enorme não vira horda: os segmentos se juntam em blocos", () => {
    const sala = area({ width: 1920, height: 1080 });
    const chamas = chamasDePe(sala, { ...GRADE, size: 48 }, OPCOES);

    expect(chamas.length).toBeGreaterThan(1);
    expect(chamas.length).toBeLessThanOrEqual(MAX_CHAMAS_DE_PE * 1.5);
  });

  it("no círculo, o pé de cada chama fica dentro dele", () => {
    const roda = area({ x: 300, y: 300, width: 384, height: 384, formato: "elipse" });

    for (const chama of chamasDePe(roda, GRADE, OPCOES)) {
      expect(dentroDaArea(roda, { x: chama.x + chama.lado / 2, y: chama.y + chama.lado })).toBe(true);
    }
  });

  it("a chama de pé não passa de metade do menor lado da área", () => {
    const fita = area({ x: 100, y: 100, width: 400, height: 40 });

    expect(chamasDePe(fita, GRADE, OPCOES).every((chama) => chama.lado <= 20)).toBe(true);
  });

  it("nem passa da altura de um token: no máximo 0,8 casa, mesmo na sala enorme", () => {
    const sala = area({ width: 1920, height: 1080 });

    expect(
      chamasDePe(sala, GRADE, OPCOES).every((chama) => chama.lado <= 96 * ALTURA_DA_CHAMA_DE_PE),
    ).toBe(true);
  });
});

describe("fontesDaArea", () => {
  it("uma luz por área, com a forma dela, saindo do meio", () => {
    const fontes = fontesDaArea(area(), segmentosDaArea(area(), GRADE), FOGO, 96);

    expect(fontes).toHaveLength(1);
    // Sem a sombra dos tokens: a luz do chão não se refaz quando um token anda.
    expect(fontes[0]).toMatchObject({ id: "a1#luz", dono: "a1", x: 96, y: 96, efeito: "fogo", semTokens: true });
    expect(fontes[0]!.forma).toEqual([
      { x: 0, y: 0 },
      { x: 192, y: 0 },
      { x: 192, y: 192 },
      { x: 0, y: 192 },
    ]);
  });

  it("a luz cai em casas, e não em segmentos: dividir não muda a queda", () => {
    const inteira = fontesDaArea(area(), segmentosDaArea(area(), GRADE), FOGO, 96)[0]!;
    const dividida = fontesDaArea(area(), segmentosDaArea(area(), GRADE, 2), FOGO, 96)[0]!;

    expect(dividida.raio).toBeCloseTo(inteira.raio);
    expect(inteira.raio).toBeCloseTo(2.5 * 96 * 0.6);
  });

  it("a sala em chamas continua uma luz, presa ao teto do raio", () => {
    const grande = area({ width: 1920, height: 1080 });
    const fontes = fontesDaArea(grande, segmentosDaArea(grande, { ...GRADE, size: 400 }), FOGO, 400);

    expect(fontes).toHaveLength(1);
    expect(fontes[0]!.raio).toBeLessThanOrEqual(RAIO_MAXIMO_DO_EFEITO);
  });

  it("sem segmento, sem luz", () => {
    expect(fontesDaArea(area(), { segmentos: [] }, FOGO, 96)).toEqual([]);
  });
});
