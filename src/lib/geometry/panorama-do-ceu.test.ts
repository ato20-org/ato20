import { describe, expect, it } from "vitest";

import {
  daTelaAoChao,
  focalDaLente,
  type CameraOrbital,
} from "@/lib/geometry/camera-orbital";
import { ceuNaTela } from "@/lib/geometry/panorama-do-ceu";

const TELA = { largura: 1440, altura: 900 };
const TRIPE = { giro: 0, inclinacao: 80, rolagem: 0, lente: 45 };

describe("ceuNaTela", () => {
  it("o panorama inteiro tem a volta na largura e meia volta na altura", () => {
    const ceu = ceuNaTela(TRIPE, TELA);
    const focal = focalDaLente(TELA.altura, 45);

    expect(ceu.largura).toBeCloseTo(2 * Math.PI * focal, 6);
    expect(ceu.altura).toBeCloseTo(Math.PI * focal, 6);
  });

  it("olhando o horizonte, o meio do panorama cai no meio da tela", () => {
    const ceu = ceuNaTela({ ...TRIPE, inclinacao: 90 }, TELA);

    expect(ceu.y + ceu.altura / 2).toBeCloseTo(TELA.altura / 2, 6);
  });

  it("o horizonte do céu é onde o chão acaba", () => {
    // Abaixo do horizonte o chão existe; um pixel acima, não. A linha do meio
    // do panorama é essa fronteira.
    const camera: CameraOrbital = {
      alvo: { x: 960, y: 540 },
      zoom: 1.5,
      giro: 0,
      inclinacao: 70,
    };
    const tela = { ...TELA, focal: focalDaLente(TELA.altura, 45) };
    const ceu = ceuNaTela({ ...TRIPE, inclinacao: 70 }, TELA);
    const horizonte = ceu.y + ceu.altura / 2;

    expect(daTelaAoChao(camera, tela, { x: 720, y: horizonte + 2 })).not.toBeNull();
    expect(daTelaAoChao(camera, tela, { x: 720, y: horizonte - 2 })).toBeNull();
  });

  it("olhando para baixo, o pé do panorama fica no pé da tela, sem vazio", () => {
    for (const inclinacao of [0, 10, 30]) {
      const ceu = ceuNaTela({ ...TRIPE, inclinacao }, TELA);

      expect(ceu.y).toBeLessThanOrEqual(0);
      expect(ceu.y + ceu.altura).toBeGreaterThanOrEqual(TELA.altura - 1e-6);
    }
  });

  it("olhando para cima, o alto do panorama não desce da borda da tela", () => {
    const ceu = ceuNaTela({ ...TRIPE, inclinacao: 175 }, TELA);

    expect(ceu.y).toBeLessThanOrEqual(0);
  });

  it("girar a volta inteira devolve o céu ao mesmo lugar", () => {
    const antes = ceuNaTela(TRIPE, TELA);
    const depois = ceuNaTela({ ...TRIPE, giro: 360 }, TELA);

    expect(depois.x).toBeCloseTo(antes.x, 4);
  });

  it("a posição fica dentro de uma volta, para o fundo repetir sem buraco", () => {
    for (const giro of [-720, -90, 0, 45, 359, 1000]) {
      const { x, largura } = ceuNaTela({ ...TRIPE, giro }, TELA);
      expect(x).toBeLessThanOrEqual(0);
      expect(x).toBeGreaterThan(-largura);
    }
  });
});
