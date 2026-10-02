import { describe, expect, it } from "vitest";

import {
  ALTURA_MINIMA,
  lenteComARoda,
  olharComOMouse,
  passoDoCinegrafista,
} from "@/lib/geometry/cinegrafista";
import { UNIDADES_POR_METRO } from "@/lib/geometry/sombra";
import type { Tripe } from "@/types/scene";

const OLHO: Tripe = {
  x: 1000,
  y: 600,
  altura: 80,
  giro: 0,
  inclinacao: 80,
  rolagem: 0,
  lente: 45,
};

const teclas = (...codigos: string[]) => new Set(codigos);

describe("passoDoCinegrafista", () => {
  it("W anda para onde o tripé olha, no chão", () => {
    // Giro 0 olha para cima do mapa (-y).
    const depois = passoDoCinegrafista(OLHO, teclas("KeyW"), 1, false);
    expect(depois.x).toBeCloseTo(OLHO.x);
    expect(depois.y).toBeCloseTo(OLHO.y - 3 * UNIDADES_POR_METRO);
    expect(depois.altura).toBe(OLHO.altura);
  });

  it("D anda para a direita de quem olha", () => {
    const depois = passoDoCinegrafista(OLHO, teclas("KeyD"), 1, false);
    expect(depois.x).toBeGreaterThan(OLHO.x);
    expect(depois.y).toBeCloseTo(OLHO.y);
  });

  it("na diagonal anda o mesmo que de frente", () => {
    const frente = passoDoCinegrafista(OLHO, teclas("KeyW"), 1, false);
    const diagonal = passoDoCinegrafista(OLHO, teclas("KeyW", "KeyD"), 1, false);
    const de = (tripe: Tripe) => Math.hypot(tripe.x - OLHO.x, tripe.y - OLHO.y);
    expect(de(diagonal)).toBeCloseTo(de(frente));
  });

  it("Shift anda mais devagar", () => {
    const normal = passoDoCinegrafista(OLHO, teclas("KeyW"), 1, false);
    const devagar = passoDoCinegrafista(OLHO, teclas("KeyW"), 1, true);
    expect(OLHO.y - devagar.y).toBeLessThan(OLHO.y - normal.y);
  });

  it("C desce e para rente ao chão: não atravessa o mapa", () => {
    const depois = passoDoCinegrafista(OLHO, teclas("KeyC"), 60, false);
    expect(depois.altura).toBe(ALTURA_MINIMA);
  });

  it("Espaço sobe, e Q e E rolam", () => {
    const sobe = passoDoCinegrafista(OLHO, teclas("Space"), 1, false);
    expect(sobe.altura).toBeGreaterThan(OLHO.altura);
    expect(passoDoCinegrafista(OLHO, teclas("KeyQ"), 1, false).rolagem).toBe(45);
    expect(passoDoCinegrafista(OLHO, teclas("KeyE"), 1, false).rolagem).toBe(-45);
  });
});

describe("olharComOMouse", () => {
  it("para a direita vira à direita; para cima levanta o olhar", () => {
    const direita = olharComOMouse(OLHO, 100, 0, false);
    // Virar à direita tira a frente do -y para o +x: o giro desce.
    expect(direita.giro).toBeCloseTo(360 - 12);
    expect(olharComOMouse(OLHO, 0, -100, false).inclinacao).toBeCloseTo(92);
  });

  it("a inclinação fica entre olhar o chão e um pouco acima do horizonte", () => {
    expect(olharComOMouse(OLHO, 0, 10_000, false).inclinacao).toBe(0);
    expect(olharComOMouse(OLHO, 0, -10_000, false).inclinacao).toBe(135);
  });
});

describe("lenteComARoda", () => {
  it("para frente fecha a lente, para trás abre, dentro do painel", () => {
    expect(lenteComARoda(OLHO, -100, false).lente).toBeLessThan(OLHO.lente);
    expect(lenteComARoda(OLHO, 100, false).lente).toBeGreaterThan(OLHO.lente);
    expect(lenteComARoda(OLHO, -100_000, false).lente).toBe(10);
    expect(lenteComARoda(OLHO, 100_000, false).lente).toBe(120);
  });

  it("Shift muda a lente mais devagar", () => {
    const normal = OLHO.lente - lenteComARoda(OLHO, -100, false).lente;
    const devagar = OLHO.lente - lenteComARoda(OLHO, -100, true).lente;
    expect(devagar).toBeLessThan(normal);
  });
});
