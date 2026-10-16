import { describe, expect, it } from "vitest";

import {
  areaDoCone,
  areaDoImpacto,
  CONE_FICA_MS,
  CONE_SOME_MS,
  DISPARO_PADRAO,
  disparoDoEfeito,
  EFEITOS_DE_DISPARO,
  disparoPeloOlhar,
  disparoValido,
  efeitosDeDisparoDosPlugins,
  IMPACTO_MS,
  novoDisparo,
  podeDisparar,
  pontosDoDisparo,
  rumoTravado,
  vidaDoDisparo,
  VOO_MAX_MS,
  VOO_MIN_MS,
} from "@/lib/disparo-de-efeito";
import type { DefinicaoDeEfeito } from "@/types/efeito";
import type { EfeitoDisparado } from "@/types/efeito-disparado";
import { SCENE_HEIGHT, SCENE_WIDTH, type CanvasItem, type SceneGrid } from "@/types/scene";

const GRADE: SceneGrid = { size: 100, offsetX: 0, offsetY: 0, opacity: 0.35 };

function efeito(extra: Partial<DefinicaoDeEfeito> = {}): DefinicaoDeEfeito {
  return { id: "campanha/fogo", titulo: "Fogo", area: { cor: "#ff0000" }, ...extra };
}

function item(id: string, extra: Partial<CanvasItem> = {}): CanvasItem {
  return {
    id,
    assetId: "a",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    z: 1,
    ...extra,
  } as CanvasItem;
}

function tiro(extra: Partial<Parameters<typeof novoDisparo>[0]> = {}): EfeitoDisparado {
  const disparo = novoDisparo({
    id: "t",
    cenaId: "c",
    efeito: "campanha/fogo",
    definicao: efeito(),
    grid: GRADE,
    de: { x: 200, y: 500 },
    para: { x: 1700, y: 500 },
    quando: 0,
    ...extra,
  });
  if (!disparo) throw new Error("o tiro não saiu");
  return disparo;
}

describe("disparoDoEfeito", () => {
  it("o efeito sem bloco dispara em linha, com os padrões", () => {
    expect(disparoDoEfeito(efeito())).toEqual(DISPARO_PADRAO);
    expect(disparoDoEfeito(undefined)).toEqual(DISPARO_PADRAO);
  });

  it("prende cada número e desconhece a forma torta", () => {
    const resolvido = disparoDoEfeito(
      efeito({
        disparo: {
          forma: "espiral" as "linha",
          abertura: 999,
          velocidade: -4,
          alcance: Number.NaN,
          tamanho: 0,
          impacto: 10,
        },
      }),
    );

    expect(resolvido).toEqual({
      forma: "linha",
      abertura: 160,
      velocidade: 3,
      alcance: DISPARO_PADRAO.alcance,
      tamanho: 0.3,
      impacto: 4,
      rastro: true,
      brilho: true,
    });
  });
});

describe("quem dispara", () => {
  it("só o disparo: o de área e o de figura têm o lugar deles", () => {
    expect(podeDisparar({ disparo: { forma: "cone" } })).toBe(true);
    expect(podeDisparar({ area: {}, disparo: { forma: "linha" } })).toBe(true);
    expect(podeDisparar({ area: {} })).toBe(false);
    expect(podeDisparar({})).toBe(false);
  });

  it("dos plugins, só os de plugin que disparam", () => {
    const tiro = { disparo: { forma: "linha" as const } };
    const deFora = {
      "p/fogo": efeito({ id: "p/fogo", origem: { plugin: "p", versao: "1" }, ...tiro }),
      "p/chao": efeito({ id: "p/chao", origem: { plugin: "p", versao: "1" } }),
      "campanha/x": efeito({ id: "campanha/x", origem: { acervo: true }, ...tiro }),
    };

    expect(efeitosDeDisparoDosPlugins(deFora).map((cada) => cada.id)).toEqual(["p/fogo"]);
  });

  it("os de fábrica: os cinco prontos, cada um com a forma dele", () => {
    const formas = Object.fromEntries(
      EFEITOS_DE_DISPARO.map((pronto) => {
        const { forma, impacto } = disparoDoEfeito(pronto);
        return [pronto.id, forma === "cone" ? "cone" : impacto > 0 ? "estouro" : "reto"];
      }),
    );

    expect(formas).toEqual({
      "bola-de-fogo": "estouro",
      "jato-de-agua": "estouro",
      "nuvem-venenosa": "cone",
      "raio-de-gelo": "reto",
      "sopro-de-fogo": "cone",
    });
  });
});

describe("novoDisparo", () => {
  it("o voo pela velocidade: quinze casas a quinze casas por segundo é um segundo", () => {
    const disparo = tiro({ de: { x: 200, y: 500 }, para: { x: 1700, y: 500 } });

    expect(disparo.voo).toBe(1000);
    expect(disparo.forma).toBe("linha");
    expect(disparo.cor).toBe("#ff0000");
    expect(disparo.tamanho).toBe(100);
    // O raio do estouro é uma casa: o diâmetro, duas.
    expect(disparo.impacto).toBe(200);
  });

  it("o voo fica entre o mínimo e o máximo", () => {
    const curto = tiro({ de: { x: 500, y: 500 }, para: { x: 540, y: 500 } });
    const lento = tiro({
      definicao: efeito({ disparo: { forma: "linha", velocidade: 3 } }),
      de: { x: 100, y: 500 },
      para: { x: 1800, y: 500 },
    });

    expect(curto.voo).toBe(VOO_MIN_MS);
    expect(lento.voo).toBe(VOO_MAX_MS);
  });

  it("dois cliques no mesmo lugar não disparam", () => {
    expect(
      novoDisparo({
        id: "t",
        cenaId: "c",
        efeito: "e",
        definicao: efeito(),
        grid: GRADE,
        de: { x: 500, y: 500 },
        para: { x: 505, y: 500 },
        quando: 0,
      }),
    ).toBeNull();
  });

  it("o fim fora do plano encurta AO LONGO do tiro, sem mudar a direção", () => {
    const disparo = tiro({ de: { x: 1000, y: 500 }, para: { x: 3000, y: 1500 } });
    const margem = 100 * 0.72;

    expect(disparo.para.x).toBeLessThanOrEqual(SCENE_WIDTH - margem + 1e-9);
    expect(disparo.para.y).toBeLessThanOrEqual(SCENE_HEIGHT - margem + 1e-9);
    // A mesma inclinação de antes: dois para um.
    expect((disparo.para.x - disparo.de.x) / (disparo.para.y - disparo.de.y)).toBeCloseTo(2);
  });

  it("o rastro e o brilho desligados viajam no tiro; ligados, não pesam nada", () => {
    const ligado = tiro();
    const desligado = tiro({
      definicao: efeito({ disparo: { forma: "linha", rastro: false, brilho: false } }),
    });

    expect(ligado.semRastro).toBeUndefined();
    expect(ligado.semBrilho).toBeUndefined();
    expect(desligado.semRastro).toBe(true);
    expect(desligado.semBrilho).toBe(true);
    expect(disparoValido(desligado)).toBe(true);
  });

  it("o cone leva a abertura e nenhum estouro", () => {
    const disparo = tiro({ definicao: efeito({ disparo: { forma: "cone", abertura: 90 } }) });

    expect(disparo.forma).toBe("cone");
    expect(disparo.abertura).toBe(90);
    expect(disparo.impacto).toBe(0);
  });
});

describe("vidaDoDisparo", () => {
  it("o voo e o estouro; o cone aberto e apagando", () => {
    expect(vidaDoDisparo({ forma: "linha", voo: 300, impacto: 200 })).toBe(300 + IMPACTO_MS);
    expect(vidaDoDisparo({ forma: "cone", voo: 300, impacto: 0 })).toBe(
      300 + CONE_FICA_MS + CONE_SOME_MS,
    );
  });
});

describe("rumoTravado", () => {
  it("anda de quinze em quinze graus, com a mesma distância", () => {
    const fim = rumoTravado({ x: 0, y: 0 }, { x: 100, y: 10 });

    expect(fim.x).toBeCloseTo(Math.hypot(100, 10));
    expect(fim.y).toBeCloseTo(0);
  });
});

describe("disparoPeloOlhar", () => {
  it("a figura sem lanterna olha para baixo, e o tiro sai da borda dela", () => {
    const { de, para } = disparoPeloOlhar(item("t", { x: 100, y: 100 }), efeito(), GRADE);

    expect(de.x).toBeCloseTo(150);
    expect(de.y).toBeCloseTo(150 + 30);
    // Seis casas além da saída.
    expect(para.y - de.y).toBeCloseTo(600);
  });

  it("o giro vira o olhar, e o alcance é o do efeito", () => {
    const { de, para } = disparoPeloOlhar(
      item("t", { x: 100, y: 100, rotation: 90 }),
      efeito({ disparo: { forma: "linha", alcance: 2 } }),
      GRADE,
    );

    expect(para.x - de.x).toBeCloseTo(-200);
    expect(para.y - de.y).toBeCloseTo(0);
  });
});

describe("pontosDoDisparo", () => {
  const mago = item("mago", { x: 0, y: 0, personagemId: "p1" });
  const goblin = item("goblin", { x: 600, y: 0, personagemId: "p2" });
  const mapa = item("mapa", { x: 0, y: 0, width: 1920, height: 1080 });

  it("do mago ao goblin: sai da borda dele e cai no centro do outro", () => {
    const { de, para } = pontosDoDisparo([mapa, mago, goblin], { x: 20, y: 80 }, { x: 610, y: 10 });

    expect(para).toEqual({ x: 650, y: 50 });
    expect(de.x).toBeCloseTo(80);
    expect(de.y).toBeCloseTo(50);
  });

  it("só personagem encaixa: o mapa posto como item não puxa o tiro", () => {
    const { de, para } = pontosDoDisparo([mapa], { x: 300, y: 300 }, { x: 900, y: 300 });

    expect(de).toEqual({ x: 300, y: 300 });
    expect(para).toEqual({ x: 900, y: 300 });
  });

  it("com o Shift, o rumo trava a partir do centro, e o alvo não encaixa", () => {
    const { para } = pontosDoDisparo([mago, goblin], { x: 50, y: 50 }, { x: 640, y: 70 }, true);

    expect(para.y).toBeCloseTo(50);
  });
});

describe("areaDoCone", () => {
  it("um polígono que começa na ponta, preso ao plano", () => {
    const disparo = tiro({
      definicao: efeito({ disparo: { forma: "cone", abertura: 60 } }),
      de: { x: 100, y: 100 },
      para: { x: 100, y: -900 },
    });
    const area = areaDoCone(disparo)!;

    expect(area.formato).toBe("poligono");
    expect(area.x).toBeGreaterThanOrEqual(0);
    expect(area.y).toBeGreaterThanOrEqual(0);
    expect(area.x + area.width).toBeLessThanOrEqual(SCENE_WIDTH);
    expect(area.y + area.height).toBeLessThanOrEqual(SCENE_HEIGHT);
    for (const fracao of area.pontos ?? []) {
      expect(fracao).toBeGreaterThanOrEqual(0);
      expect(fracao).toBeLessThanOrEqual(1);
    }
    // O primeiro vértice é a ponta.
    expect(area.x + area.pontos![0]! * area.width).toBeCloseTo(disparo.de.x);
    expect(area.y + area.pontos![1]! * area.height).toBeCloseTo(disparo.de.y);
  });
});

describe("areaDoImpacto", () => {
  it("um círculo do diâmetro do estouro em volta do alvo", () => {
    const disparo = tiro({ para: { x: 1000, y: 500 } });
    const area = areaDoImpacto(disparo)!;

    expect(area.formato).toBe("elipse");
    expect(area.width).toBe(200);
    expect(area.x + area.width / 2).toBeCloseTo(disparo.para.x);
    expect(area.y + area.height / 2).toBeCloseTo(disparo.para.y);
  });

  it("sem estouro, nada", () => {
    const disparo = tiro({ definicao: efeito({ disparo: { forma: "linha", impacto: 0 } }) });
    expect(areaDoImpacto(disparo)).toBeNull();
  });
});

describe("disparoValido", () => {
  it("aceita o tiro inteiro e recusa o torto", () => {
    const bom = tiro();

    expect(disparoValido(bom)).toBe(true);
    expect(disparoValido({ ...bom, forma: "espiral" })).toBe(false);
    expect(disparoValido({ ...bom, de: { x: Number.NaN, y: 0 } })).toBe(false);
    expect(disparoValido({ ...bom, voo: 60_000 })).toBe(false);
    expect(disparoValido(null)).toBe(false);
  });
});
