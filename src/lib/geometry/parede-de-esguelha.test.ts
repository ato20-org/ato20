import { describe, expect, it } from "vitest";

import {
  focalDaLente,
  projetar,
  type CameraOrbital,
  type Tela,
} from "@/lib/geometry/camera-orbital";
import {
  alturaPeloArrasto,
  caixaRedimensionada,
  linhaEntre,
  paredeGirada,
  paredeSobOPixel,
} from "@/lib/geometry/parede-de-esguelha";
import { UNIDADES_POR_METRO } from "@/lib/geometry/sombra";
import type { Parede } from "@/types/scene";

const TELA: Tela = { largura: 1440, altura: 900, focal: focalDaLente(900, 45) };

function camera(parcial: Partial<CameraOrbital> = {}): CameraOrbital {
  return {
    alvo: { x: 960, y: 540 },
    zoom: 1.5,
    giro: 0,
    inclinacao: 52,
    ...parcial,
  };
}

const CASA: Parede = {
  id: "casa",
  x: 900,
  y: 480,
  width: 120,
  height: 120,
  formato: "retangulo",
};

/** O pixel de um ponto do chão a uma altura, com a câmera dada. */
function pixelDe(cam: CameraOrbital, ponto: { x: number; y: number }, altura = 0) {
  return projetar(cam, TELA, ponto, altura)!;
}

describe("paredeSobOPixel", () => {
  it("o topo da parede coberta acerta, e a mão a pega na altura dela", () => {
    const cam = camera();
    const topo = pixelDe(cam, { x: 960, y: 540 }, 110);

    const mira = paredeSobOPixel([CASA], { camera: cam, tela: TELA }, topo);
    expect(mira?.parede.id).toBe("casa");
    expect(mira?.plano).toBe(110);
  });

  it("a face de frente acerta, e a mão a pega no meio", () => {
    const cam = camera();
    // O meio do lado de baixo (de frente para quem olha com giro 0), a meia
    // altura.
    const face = pixelDe(cam, { x: 960, y: 600 }, 30);

    const mira = paredeSobOPixel([CASA], { camera: cam, tela: TELA }, face);
    expect(mira?.parede.id).toBe("casa");
    expect(mira?.plano).toBe(55);
  });

  it("no miolo do pátio é chão, e não parede", () => {
    const cam = camera({ inclinacao: 0 });
    const patio: Parede = { ...CASA, semTeto: true };
    const meio = pixelDe(cam, { x: 960, y: 540 });

    expect(paredeSobOPixel([patio], { camera: cam, tela: TELA }, meio)).toBeNull();
  });

  it("longe da parede não acerta nada", () => {
    const cam = camera();
    const longe = pixelDe(cam, { x: 600, y: 300 });

    expect(paredeSobOPixel([CASA], { camera: cam, tela: TELA }, longe)).toBeNull();
  });

  it("entre duas, ganha a de mais perto, que é a pintada por cima", () => {
    const cam = camera({ inclinacao: 0 });
    const atras: Parede = { ...CASA, id: "atras", y: 470 };
    const frente: Parede = { ...CASA, id: "frente", y: 490 };
    const meio = pixelDe(cam, { x: 960, y: 560 }, 110);

    // Com giro zero, mais `y` é mais perto. A ordem da lista não decide.
    for (const lista of [
      [atras, frente],
      [frente, atras],
    ]) {
      const mira = paredeSobOPixel(lista, { camera: cam, tela: TELA }, meio);
      expect(mira?.parede.id).toBe("frente");
    }
  });
});

describe("caixaRedimensionada", () => {
  it("a alça do canto cresce a caixa e o canto oposto fica", () => {
    const caixa = caixaRedimensionada(CASA, "se", { x: 30, y: 10 }, false);

    expect(caixa).toEqual({ x: 900, y: 480, width: 150, height: 130 });
  });
});

describe("caixaRedimensionada abaixo do piso de item", () => {
  it("a parede fechada encolhe até um, e não até 24", () => {
    const caixa = caixaRedimensionada(CASA, "se", { x: -200, y: -110 }, false);

    expect(caixa.width).toBe(1);
    expect(caixa.height).toBe(10);
  });

  it("a linha deitada continua deitada: o piso não a entorta", () => {
    const reta: Parede = { ...CASA, formato: "linha", height: 0 };
    const caixa = caixaRedimensionada(reta, "e", { x: 40, y: 0 }, false);

    expect(caixa.height).toBe(0);
    expect(caixa.width).toBe(160);
  });

  it("com Shift na linha deitada não sai NaN", () => {
    const reta: Parede = { ...CASA, formato: "linha", height: 0 };
    const caixa = caixaRedimensionada(reta, "se", { x: 40, y: 0 }, true);

    expect(Number.isFinite(caixa.width)).toBe(true);
    expect(Number.isFinite(caixa.height)).toBe(true);
  });
});

describe("linhaEntre", () => {
  it("põe a caixa entre as pontas e acerta a diagonal", () => {
    expect(linhaEntre({ x: 100, y: 300 }, { x: 300, y: 100 })).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      rotation: undefined,
      diagonal: "secundaria",
    });
  });

  it("recusa as pontas coladas", () => {
    expect(linhaEntre({ x: 100, y: 100 }, { x: 100.5, y: 100.2 })).toBeNull();
  });
});

describe("alturaPeloArrasto", () => {
  const cam = camera();
  const olhar = { camera: cam, tela: TELA };

  it("subir a mão na tela sobe a parede", () => {
    const meio = pixelDe(cam, { x: 960, y: 540 }, 110);
    const altura = alturaPeloArrasto(olhar, CASA, 110, meio, {
      x: meio.x,
      y: meio.y - 40,
    });

    expect(altura).toBeGreaterThan(110);
  });

  it("voltar aos dois metros apaga o campo, como no 2D", () => {
    const meio = pixelDe(cam, { x: 960, y: 540 }, 110);

    expect(alturaPeloArrasto(olhar, CASA, 110, meio, meio)).toBeUndefined();
  });

  it("anda de cinco em cinco centímetros", () => {
    const meio = pixelDe(cam, { x: 960, y: 540 }, 110);
    const altura = alturaPeloArrasto(olhar, CASA, 110, meio, {
      x: meio.x,
      y: meio.y - 23,
    })!;
    const centimetros = (altura / UNIDADES_POR_METRO) * 100;

    expect(centimetros).toBeCloseTo(Math.round(centimetros / 5) * 5, 6);
  });
});

describe("paredeGirada", () => {
  it("a caixa gira pelo rotation, somando ao que ela já tinha", () => {
    expect(paredeGirada({ ...CASA, rotation: 10 }, 30, false)).toEqual({
      rotation: 40,
    });
    expect(paredeGirada(CASA, -30, false)).toEqual({ rotation: 330 });
  });

  it("com Shift, o ângulo final cai no passo de 15", () => {
    expect(paredeGirada({ ...CASA, rotation: 3 }, 20, true)).toEqual({
      rotation: 30,
    });
  });

  it("a linha gira as pontas em volta do meio", () => {
    const reta: Parede = {
      id: "r",
      x: 100,
      y: 200,
      width: 200,
      height: 0,
      formato: "linha",
    };

    // Deitada de 100 a 300 em y = 200; a 90 graus fica de pé em x = 200.
    expect(paredeGirada(reta, 90, false)).toEqual({
      x: 200,
      y: 100,
      width: 0,
      height: 200,
      rotation: undefined,
      diagonal: undefined,
    });
  });
});
