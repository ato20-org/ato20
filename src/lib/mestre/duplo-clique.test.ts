import { describe, expect, it } from "vitest";

import {
  ehDuploClique,
  FOLGA_DO_DUPLO_PX,
  INTERVALO_DO_DUPLO_MS,
} from "@/lib/mestre/duplo-clique";

const primeiro = { alvo: "goblin", t: 1000, x: 100, y: 100 };

describe("ehDuploClique", () => {
  it("dois toques no mesmo alvo, rápidos e parados", () => {
    expect(ehDuploClique(primeiro, { ...primeiro, t: 1200 })).toBe(true);
  });

  it("sem toque anterior, não", () => {
    expect(ehDuploClique(null, primeiro)).toBe(false);
  });

  it("em outro alvo, não", () => {
    expect(ehDuploClique(primeiro, { ...primeiro, alvo: "orc", t: 1100 })).toBe(false);
  });

  it("devagar demais, não", () => {
    expect(
      ehDuploClique(primeiro, { ...primeiro, t: 1000 + INTERVALO_DO_DUPLO_MS + 1 }),
    ).toBe(false);
  });

  it("com a mão andando, não", () => {
    expect(
      ehDuploClique(primeiro, { ...primeiro, t: 1100, x: 100 + FOLGA_DO_DUPLO_PX + 1 }),
    ).toBe(false);
  });
});
