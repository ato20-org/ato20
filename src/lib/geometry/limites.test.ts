import { describe, expect, it } from "vitest";

import { limitesDoConteudo } from "@/lib/geometry/limites";
import { PLANO } from "@/lib/geometry/viewport";
import type { Scene } from "@/types/scene";

function cena(mudar: Partial<Scene>): Scene {
  return { id: "c", items: [], fog: [], ...mudar } as unknown as Scene;
}

describe("limitesDoConteudo", () => {
  it("com tudo dentro, é o próprio plano", () => {
    expect(
      limitesDoConteudo(
        cena({
          luzes: [{ id: "l", x: 500, y: 300, raio: 200, cor: "#fff" }],
          paredes: [{ id: "w", x: 100, y: 100, width: 300, height: 200, formato: "retangulo" }],
        }),
      ),
    ).toEqual(PLANO);
  });

  it("a luz e a parede fora do mapa entram, para a câmera do mestre chegar até elas", () => {
    const limites = limitesDoConteudo(
      cena({
        luzes: [{ id: "l", x: 2300, y: 300, raio: 200, cor: "#fff" }],
        paredes: [{ id: "w", x: 100, y: -400, width: 300, height: 200, formato: "retangulo" }],
      }),
    );

    expect(limites.maxX).toBe(2300);
    expect(limites.minY).toBe(-400);
  });
});
