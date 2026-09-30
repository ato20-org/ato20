import { describe, expect, it } from "vitest";

import { degrauDeFonte } from "@/lib/mestre/degrau-de-fonte";

describe("degrauDeFonte", () => {
  it("anda um degrau para cada lado", () => {
    expect(degrauDeFonte(16, 1)).toBe(20);
    expect(degrauDeFonte(16, -1)).toBe(13);
  });

  it("para nas pontas da escada", () => {
    expect(degrauDeFonte(38, 1)).toBe(38);
    expect(degrauDeFonte(11, -1)).toBe(11);
  });

  it("leva o 15 do postit antigo para dentro da escada", () => {
    expect(degrauDeFonte(15, 1)).toBe(20);
    expect(degrauDeFonte(15, -1)).toBe(13);
  });
});
