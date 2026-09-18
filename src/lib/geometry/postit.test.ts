import { describe, expect, it } from "vitest";

import { postitNaArea } from "@/lib/geometry/postit";
import { FOLGA_X, FOLGA_Y } from "@/lib/geometry/viewport";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

/**
 * O papel pode ir para a margem -- um plano de folga em volta do mapa --, mas
 * nunca além dela. Fora da margem seria um postit que existe e não se alcança.
 */
describe("postitNaArea", () => {
  it("deixa quieto um papel dentro do plano", () => {
    expect(postitNaArea(100, 200, 260, 180)).toEqual({ x: 100, y: 200 });
  });

  it("deixa quieto um papel estacionado na margem", () => {
    expect(postitNaArea(-500, -222, 260, 180)).toEqual({ x: -500, y: -222 });
  });

  it("prende na borda da margem o que passa dela", () => {
    expect(postitNaArea(-FOLGA_X - 50, -FOLGA_Y - 50, 260, 180)).toEqual({
      x: -FOLGA_X,
      y: -FOLGA_Y,
    });
    expect(
      postitNaArea(SCENE_WIDTH + FOLGA_X, SCENE_HEIGHT + FOLGA_Y, 260, 180),
    ).toEqual({ x: SCENE_WIDTH + FOLGA_X - 260, y: SCENE_HEIGHT + FOLGA_Y - 180 });
  });
});
