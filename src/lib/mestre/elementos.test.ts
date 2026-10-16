import { describe, expect, it } from "vitest";

import {
  caixaDoElemento,
  camposDaParedeNova,
  comFormato,
  comoAreaDeEfeito,
  comoForma,
  comoNevoa,
  comoParede,
} from "@/lib/mestre/elementos";
import type { AreaDeEfeito, Forma } from "@/types/scene";
import {
  METROS_DA_PAREDE_PADRAO,
  UNIDADES_POR_METRO,
} from "@/lib/geometry/sombra";

describe("camposDaParedeNova", () => {
  it("a parede de sempre não grava campo nenhum", () => {
    expect(
      camposDaParedeNova(
        { metros: METROS_DA_PAREDE_PADRAO, comTeto: true },
        "retangulo",
      ),
    ).toEqual({});
  });

  it("altura em metros vira unidade de cena; sem teto e cor gravam", () => {
    expect(
      camposDaParedeNova(
        { metros: 4, comTeto: false, cor: "#78716c" },
        "poligono",
      ),
    ).toEqual({ altura: 4 * UNIDADES_POR_METRO, semTeto: true, cor: "#78716c" });
  });

  it("a linha não tem miolo: nasce sem o campo do teto", () => {
    expect(
      camposDaParedeNova(
        { metros: METROS_DA_PAREDE_PADRAO, comTeto: false },
        "linha",
      ),
    ).toEqual({});
  });
});

describe("trocar o formato e o tipo de um elemento do mapa", () => {
  const caixa = { x: 10, y: 20, width: 300, height: 200 };
  const forma: Forma = {
    id: "f1",
    tipo: "retangulo",
    ...caixa,
    rotation: 15,
    espessura: 4,
    cor: "#f00",
    naMesa: true,
  };

  it("o quadrado vira laço pelos quatro cantos, e o círculo pela volta dele", () => {
    const quadrado = caixaDoElemento({ natureza: "elemento", forma });
    expect(comFormato(quadrado, "poligono").pontos).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);

    const circulo = comFormato(comFormato(quadrado, "elipse"), "poligono");
    expect(circulo.pontos).toHaveLength(32);
    // Todos dentro da caixa: o laço nunca transborda dela.
    expect(circulo.pontos!.every((valor) => valor >= 0 && valor <= 1)).toBe(true);
  });

  it("sair do laço esquece os vértices, e o laço que já era fica com os dele", () => {
    const laco = comFormato(caixaDoElemento({ natureza: "elemento", forma }), "poligono");
    const meu = { ...laco, pontos: [0, 0, 1, 0, 0.5, 1] };

    expect(comFormato(meu, "poligono").pontos).toEqual([0, 0, 1, 0, 0.5, 1]);
    expect(comFormato(meu, "retangulo")).not.toHaveProperty("pontos");
  });

  it("a forma vira área de efeito no mesmo lugar, girada, e a mesa continua vendo", () => {
    const area = comoAreaDeEfeito(caixaDoElemento({ natureza: "elemento", forma }), "campanha/fogo");

    expect(area).toEqual({ ...caixa, rotation: 15, naMesa: true, efeito: "campanha/fogo" });
  });

  it("a linha vira área escondida pelo quadrado dela", () => {
    const linha: Forma = { ...forma, tipo: "linha", diagonal: "secundaria" };
    const nevoa = comoNevoa(caixaDoElemento({ natureza: "elemento", forma: linha }), false);

    expect(nevoa).toEqual({ ...caixa, rotation: 15 });
  });

  it("a área de efeito vira parede com a parede de sempre, e forma com o traço do painel", () => {
    const area: AreaDeEfeito = { id: "a1", ...caixa, formato: "elipse", efeito: "chamas" };
    const comum = caixaDoElemento({ natureza: "efeito", area });

    expect(comoParede(comum, { metros: METROS_DA_PAREDE_PADRAO, comTeto: true })).toEqual({
      ...caixa,
      formato: "elipse",
    });
    expect(comoForma(comum, { espessura: 2, fundo: "#0f0" })).toEqual({
      ...caixa,
      rotation: 0,
      tipo: "elipse",
      espessura: 2,
      fundo: "#0f0",
    });
  });
});
