import { describe, expect, it } from "vitest";

import { paraCena, pontosNaCaixa } from "@/lib/geometry/area-escondida";
import {
  alcancaArea,
  furoDoTraco,
  furosNaCaixaNova,
  lanternasDaArea,
  lanternasDosTokens,
  passadaTocaAArea,
  proximoRaioDaBorracha,
  RAIO_DA_BORRACHA_MAXIMO,
  RAIO_DA_BORRACHA_MINIMO,
  tokenSobOPonto,
} from "@/lib/geometry/nevoa-dinamica";
import { semIdDaArea, type CanvasItem, type FogRegion } from "@/types/scene";

function item(id: string, extra: Partial<CanvasItem> = {}): CanvasItem {
  return {
    id,
    assetId: "a",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    z: 1,
    ...extra,
  } as CanvasItem;
}

const area: FogRegion = {
  id: "n",
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  revealed: false,
};

describe("lanternasDosTokens", () => {
  it("só o token com lanterna, do centro dele", () => {
    const fontes = lanternasDosTokens([
      item("sem"),
      item("com", { x: 40, y: 60, luz: { raio: 80, cor: "#fb923c" } }),
    ]);

    expect(fontes).toHaveLength(1);
    expect(fontes[0]).toMatchObject({ id: "com", x: 45, y: 65, raio: 80 });
  });
});

describe("alcancaArea", () => {
  it("dentro da caixa alcança", () => {
    expect(alcancaArea(area, { x: 150, y: 150, raio: 10 })).toBe(true);
  });

  it("fora, alcança pela distância à borda e não ao centro", () => {
    expect(alcancaArea(area, { x: 60, y: 150, raio: 50 })).toBe(true);
    expect(alcancaArea(area, { x: 60, y: 150, raio: 30 })).toBe(false);
  });

  it("no canto, a distância é a diagonal até ele", () => {
    // O canto de cima à esquerda é (100, 100); a luz em (70, 60) está a 50.
    expect(alcancaArea(area, { x: 70, y: 60, raio: 51 })).toBe(true);
    expect(alcancaArea(area, { x: 70, y: 60, raio: 49 })).toBe(false);
  });

  it("a caixa girada leva a borda junto", () => {
    // Girada 90°, a caixa de 200x100 em volta do centro (200, 150) vira uma
    // de 100x200: vai de y = 50 a y = 250, e de x = 150 a x = 250.
    const girada = { ...area, rotation: 90 };

    expect(alcancaArea(girada, { x: 200, y: 40, raio: 15 })).toBe(true);
    expect(alcancaArea(area, { x: 200, y: 40, raio: 15 })).toBe(false);
    expect(alcancaArea(girada, { x: 120, y: 150, raio: 25 })).toBe(false);
  });

  it("filtra a lista pelas que alcançam", () => {
    const fontes = lanternasDosTokens([
      item("perto", { x: 140, y: 140, luz: { raio: 50, cor: "#fff" } }),
      item("longe", { x: 900, y: 900, luz: { raio: 50, cor: "#fff" } }),
    ]);

    expect(lanternasDaArea(area, fontes).map((fonte) => fonte.id)).toEqual([
      "perto",
    ]);
  });
});

describe("furoDoTraco", () => {
  it("guarda os pontos em fração da caixa e o raio em fração da largura", () => {
    const furo = furoDoTraco(
      area,
      [
        { x: 100, y: 100 },
        { x: 200, y: 150 },
      ],
      20,
    );

    expect(furo).toEqual({ raio: 0.1, pontos: [0, 0, 0.5, 0.5] });
  });

  it("arredonda em quatro casas", () => {
    const furo = furoDoTraco(area, [{ x: 100 + 200 / 3, y: 100 }], 20);

    expect(furo?.pontos[0]).toBe(0.3333);
  });

  it("desfaz o giro da caixa", () => {
    const girada = { ...area, rotation: 90 };
    // O centro continua no centro.
    expect(furoDoTraco(girada, [{ x: 200, y: 150 }], 10)?.pontos).toEqual([
      0.5, 0.5,
    ]);
  });

  it("sem ponto, ou numa caixa sem largura, não há furo", () => {
    expect(furoDoTraco(area, [], 10)).toBeNull();
    expect(furoDoTraco({ ...area, width: 0 }, [{ x: 0, y: 0 }], 10)).toBeNull();
  });
});

describe("furosNaCaixaNova", () => {
  it("o furo fica no mesmo lugar do mapa quando a caixa muda", () => {
    const antes = { ...area, rotation: 30 };
    const depois = { x: 80, y: 90, width: 260, height: 140, rotation: 30 };
    const furo = furoDoTraco(antes, [{ x: 180, y: 140 }], 20)!;

    const [novo] = furosNaCaixaNova(antes, depois, [furo]);
    const [ponto] = pontosNaCaixa(depois, novo!.pontos).map((local) =>
      paraCena(depois, local),
    );

    expect(ponto!.x).toBeCloseTo(180, 0);
    expect(ponto!.y).toBeCloseTo(140, 0);
    // E o mesmo tamanho, em unidade de cena.
    expect(novo!.raio * depois.width).toBeCloseTo(20, 1);
  });
});

describe("passadaTocaAArea", () => {
  it("conta o pincel: o ponto fora encosta pela borda dele", () => {
    expect(passadaTocaAArea(area, [{ x: 90, y: 150 }], 15)).toBe(true);
    expect(passadaTocaAArea(area, [{ x: 50, y: 150 }], 15)).toBe(false);
  });
});

describe("proximoRaioDaBorracha", () => {
  it("anda por fator e para nos limites", () => {
    expect(proximoRaioDaBorracha(40, 1)).toBe(50);
    expect(proximoRaioDaBorracha(50, -1)).toBe(40);
    expect(proximoRaioDaBorracha(RAIO_DA_BORRACHA_MAXIMO, 1)).toBe(
      RAIO_DA_BORRACHA_MAXIMO,
    );
    expect(proximoRaioDaBorracha(RAIO_DA_BORRACHA_MINIMO, -1)).toBe(
      RAIO_DA_BORRACHA_MINIMO,
    );
  });
});

describe("tokenSobOPonto", () => {
  it("só token: a mobília sob o ponto não conta", () => {
    expect(tokenSobOPonto([item("barril")], { x: 5, y: 5 })).toBeUndefined();
  });

  it("o de cima ganha", () => {
    const achado = tokenSobOPonto(
      [
        item("alto", { personagemId: "p1", z: 5 }),
        item("baixo", { personagemId: "p2", z: 2 }),
      ],
      { x: 5, y: 5 },
    );

    expect(achado?.id).toBe("alto");
  });

  it("quem carrega lanterna conta mesmo sem personagem", () => {
    const tocha = item("tocha", { luz: { raio: 40, cor: "#fff" } });

    expect(tokenSobOPonto([tocha], { x: 5, y: 5 })?.id).toBe("tocha");
  });

  it("respeita o giro do token", () => {
    // 40x10 girado 90° em volta de (20, 5): vira um de pé, de x 15 a 25.
    const deitado = item("t", {
      personagemId: "p",
      width: 40,
      height: 10,
      rotation: 90,
    });

    expect(tokenSobOPonto([deitado], { x: 20, y: 20 })?.id).toBe("t");
    expect(tokenSobOPonto([deitado], { x: 35, y: 5 })).toBeUndefined();
  });
});

describe("semIdDaArea", () => {
  it("a cópia leva os furos e a névoa dinâmica", () => {
    const furos = [{ raio: 0.1, pontos: [0.5, 0.5] }];

    expect(semIdDaArea({ ...area, furos, dinamica: true })).toMatchObject({
      furos,
      dinamica: true,
    });
  });
});
