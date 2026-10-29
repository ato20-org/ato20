import { describe, expect, it } from "vitest";

import {
  bicoDaRoda,
  giroDaMao,
  miraDaLanterna,
  passoDaRoda,
} from "@/lib/mestre/roda-da-lanterna";
import type { CanvasItem, LuzCarregada } from "@/types/scene";

/** Um token de 100 com o centro em (100, 100). */
function token(
  luz: LuzCarregada | undefined,
  extra: Partial<CanvasItem> = {},
): CanvasItem {
  return {
    id: "t",
    assetId: "a",
    x: 50,
    y: 50,
    width: 100,
    height: 100,
    rotation: 0,
    z: 1,
    ...(luz ? { luz } : {}),
    ...extra,
  } as CanvasItem;
}

const chama: LuzCarregada = { raio: 260, cor: "#fb923c" };

describe("bicoDaRoda", () => {
  it("fica na borda do alcance, para onde o token olha", () => {
    // Sem cone, o olhar é o do facho padrão: para baixo da figura.
    const bico = bicoDaRoda(token(chama), 10);

    expect(bico.x).toBeCloseTo(100);
    expect(bico.y).toBeCloseTo(360);
  });

  it("gira com o token", () => {
    const bico = bicoDaRoda(token(chama, { rotation: -90 }), 10);

    expect(bico.x).toBeCloseTo(360);
    expect(bico.y).toBeCloseTo(100);
  });

  it("com alcance curto num token grande, fica fora do desenho", () => {
    const grande = token({ ...chama, raio: 100 }, { width: 300, height: 300 });
    const bico = bicoDaRoda(grande, 10);

    // O centro do grande é (200, 200); a borda dele, 150 abaixo.
    expect(bico.y - 200).toBeCloseTo(160);
  });
});

describe("passoDaRoda", () => {
  const livre = { encaixar: false, apontar: false };
  const mirando = { encaixar: false, apontar: true };
  const facho: LuzCarregada = {
    ...chama,
    cone: { angulo: 90, abertura: 60 },
  };

  it("em volta do token mira a lanterna, e o token não gira", () => {
    // Do bico embaixo (100, 360) até a direita (360, 100): o facho, que
    // saía para baixo da figura, passa a sair para a direita.
    const patch = passoDaRoda(
      token(facho),
      { x: 100, y: 360 },
      { x: 360, y: 100 },
      livre,
    );

    expect(patch).not.toHaveProperty("rotation");
    expect(patch?.luz?.cone).toEqual({ angulo: 0, abertura: 60 });
    expect(patch?.luz?.raio).toBe(260);
  });

  it("a mira é no MAPA: com o token girado, guarda o ângulo da figura", () => {
    // Girado 90, o facho padrão (90 na figura) já sai para a esquerda (180).
    // Levar o bico para cima (270 no mapa) é 180 na figura.
    const girado = token(facho, { rotation: 90 });
    const patch = passoDaRoda(
      girado,
      { x: -160, y: 100 },
      { x: 100, y: -160 },
      livre,
    );

    expect(patch?.luz?.cone?.angulo).toBe(180);
  });

  it("o círculo fica círculo enquanto não aponta", () => {
    const patch = passoDaRoda(
      token(chama),
      { x: 100, y: 360 },
      { x: 120, y: 400 },
      livre,
    );

    expect(patch?.luz).not.toHaveProperty("cone");
  });

  it("o círculo que aponta vira facho, na abertura de sempre", () => {
    const patch = passoDaRoda(
      token(chama),
      { x: 100, y: 360 },
      { x: 360, y: 100 },
      mirando,
    );

    expect(patch?.luz?.cone).toEqual({ angulo: 0, abertura: 60 });
  });

  it("para longe aumenta o alcance, e a mira fica", () => {
    const patch = passoDaRoda(
      token(facho),
      { x: 100, y: 360 },
      { x: 100, y: 400 },
      livre,
    );

    expect(patch?.luz?.raio).toBe(300);
    expect(patch?.luz?.cone?.angulo).toBe(90);
  });

  it("o alcance desce abaixo do menu e para no teto", () => {
    const longe = passoDaRoda(
      token(chama),
      { x: 100, y: 360 },
      { x: 100, y: 2000 },
      livre,
    );
    const perto = passoDaRoda(
      token(chama),
      { x: 100, y: 360 },
      { x: 100, y: 101 },
      livre,
    );

    expect(longe?.luz?.raio).toBe(420);
    // O token de mapa grande tem poucas unidades: a lanterna encolhe junto.
    expect(perto?.luz?.raio).toBe(10);
  });

  it("Shift encaixa a mira de quinze em quinze, e o alcance segue a mão", () => {
    const patch = passoDaRoda(
      token(facho),
      { x: 100, y: 360 },
      // Uns 10 graus de volta e uns 70 a mais de alcance.
      {
        x: 100 - 330 * Math.sin(Math.PI / 18),
        y: 100 + 330 * Math.cos(Math.PI / 18),
      },
      { encaixar: true, apontar: false },
    );

    expect(patch?.luz?.cone?.angulo).toBe(105);
    expect(patch?.luz?.raio).toBe(330);
  });

  it("guarda a cor e a intensidade", () => {
    const luz: LuzCarregada = { ...facho, intensidade: 0.35 };
    const patch = passoDaRoda(
      token(luz),
      { x: 100, y: 360 },
      { x: 100, y: 380 },
      livre,
    );

    expect(patch?.luz).toEqual({ ...luz, raio: 280 });
  });

  it("token sem lanterna não tem roda", () => {
    expect(
      passoDaRoda(token(undefined), { x: 0, y: 0 }, { x: 1, y: 1 }, livre),
    ).toBeNull();
  });
});

describe("giroDaMao", () => {
  it("passar pela volta é o caminho curto", () => {
    // De um pouco acima da direita (-5°) a um pouco abaixo (+5°): 10 graus.
    const em = (graus: number) => ({
      x: 100 + 100 * Math.cos((graus * Math.PI) / 180),
      y: 100 + 100 * Math.sin((graus * Math.PI) / 180),
    });
    const giro = giroDaMao(token(chama), em(-5), em(5));

    expect(giro).toBeCloseTo(10);
  });

  it("do lado esquerdo, cruzar o 180 também", () => {
    const giro = giroDaMao(token(chama), { x: 0, y: 101 }, { x: 0, y: 99 });

    expect(Math.abs(giro)).toBeLessThan(5);
  });
});

describe("miraDaLanterna", () => {
  const livre = { encaixar: false, apontar: false };
  const facho: LuzCarregada = {
    ...chama,
    cone: { angulo: 90, abertura: 60 },
  };

  it("mira o facho pelo giro da mão, e o alcance fica", () => {
    // A roda do 2.5D: um quarto de volta em volta do pé leva o facho de baixo
    // para a esquerda, sem tocar no giro do token.
    expect(miraDaLanterna(token(facho), 90, livre)).toEqual({
      ...facho,
      cone: { angulo: 180, abertura: 60 },
    });
  });

  it("no token girado, guarda o ângulo da figura", () => {
    const luz = miraDaLanterna(token(facho, { rotation: 90 }), 90, livre);

    // Olhava para a esquerda (180 no mapa), passa a olhar para cima (270):
    // na figura girada de 90, isso é 180.
    expect(luz?.cone?.angulo).toBe(180);
  });

  it("o círculo volta como está até apontar", () => {
    expect(miraDaLanterna(token(chama), 5, livre)).toBe(chama);
  });

  it("sem lanterna não há o que mirar", () => {
    expect(miraDaLanterna(token(undefined), 90, livre)).toBeNull();
  });
});
