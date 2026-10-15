import { describe, expect, it } from "vitest";
import type { CanvasItem } from "@/types/scene";
import {
  pontoNaLinha,
  pontoNoCirculo,
  pontoNoCone,
  pontoNoCubo,
  tokensAtingidos,
  type MoldeDeMagia,
} from "./templates-de-magia";

describe("Moldes de Magia 5e (AoE Templates) e Colisão", () => {
  it("detecta pontos dentro e fora de um círculo/esfera", () => {
    const origem = { x: 100, y: 100 };
    const raio = 50;

    expect(pontoNoCirculo({ x: 100, y: 100 }, origem, raio)).toBe(true);
    expect(pontoNoCirculo({ x: 140, y: 100 }, origem, raio)).toBe(true);
    expect(pontoNoCirculo({ x: 150, y: 100 }, origem, raio)).toBe(true);
    expect(pontoNoCirculo({ x: 160, y: 100 }, origem, raio)).toBe(false);
  });

  it("detecta pontos dentro e fora de um cone 5e de 53.13°", () => {
    const origem = { x: 0, y: 0 };
    const alcance = 100;
    // Apontando para o leste (0 graus)
    const direcao = 0;

    // Centro do feixe
    expect(pontoNoCone({ x: 50, y: 0 }, origem, alcance, direcao)).toBe(true);
    expect(pontoNoCone({ x: 100, y: 0 }, origem, alcance, direcao)).toBe(true);

    // Atrás do conjurador
    expect(pontoNoCone({ x: -10, y: 0 }, origem, alcance, direcao)).toBe(false);

    // Fora do alcance
    expect(pontoNoCone({ x: 110, y: 0 }, origem, alcance, direcao)).toBe(false);

    // Fora da abertura do cone (ângulo de 45° é maior que 53.13/2 = 26.56°)
    expect(pontoNoCone({ x: 50, y: 50 }, origem, alcance, direcao)).toBe(false);

    // Dentro da abertura do cone (ângulo de ~20°)
    expect(pontoNoCone({ x: 50, y: 15 }, origem, alcance, direcao)).toBe(true);
  });

  it("detecta pontos dentro e fora de um feixe retilíneo (linha)", () => {
    const origem = { x: 0, y: 0 };
    const alcance = 200;
    const direcao = 0; // leste
    const largura = 40; // metade para cima, metade para baixo: y entre -20 e +20

    expect(pontoNaLinha({ x: 50, y: 0 }, origem, alcance, direcao, largura)).toBe(true);
    expect(pontoNaLinha({ x: 50, y: 15 }, origem, alcance, direcao, largura)).toBe(true);
    expect(pontoNaLinha({ x: 50, y: 25 }, origem, alcance, direcao, largura)).toBe(false);
    expect(pontoNaLinha({ x: 210, y: 0 }, origem, alcance, direcao, largura)).toBe(false);
  });

  it("detecta pontos dentro de um cubo", () => {
    const origem = { x: 0, y: 0 };
    const tamanho = 50;

    expect(pontoNoCubo({ x: 25, y: 25 }, origem, tamanho)).toBe(true);
    expect(pontoNoCubo({ x: 50, y: 50 }, origem, tamanho)).toBe(true);
    expect(pontoNoCubo({ x: 55, y: 25 }, origem, tamanho)).toBe(false);
  });

  it("filtra tokens atingidos por uma Bola de Fogo", () => {
    const molde: MoldeDeMagia = {
      id: "fireball-1",
      formato: "circulo",
      origem: { x: 200, y: 200 },
      alcance: 100,
    };

    const t1: CanvasItem = {
      id: "token-1",
      assetId: "a1",
      x: 180,
      y: 180,
      width: 40,
      height: 40,
      rotation: 0,
      z: 1,
      locked: false,
    };

    const t2_distante: CanvasItem = {
      id: "token-2",
      assetId: "a2",
      x: 500,
      y: 500,
      width: 40,
      height: 40,
      rotation: 0,
      z: 1,
      locked: false,
    };

    const atingidos = tokensAtingidos([t1, t2_distante], molde);
    expect(atingidos).toHaveLength(1);
    expect(atingidos[0]!.id).toBe("token-1");
  });

  it("cone com alcance zero ou negativo retorna false", () => {
    expect(pontoNoCone({ x: 10, y: 0 }, { x: 0, y: 0 }, 0, 0)).toBe(false);
    expect(pontoNoCone({ x: 10, y: 0 }, { x: 0, y: 0 }, -50, 0)).toBe(false);
  });
});

