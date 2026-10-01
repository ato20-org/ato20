import { describe, expect, it } from "vitest";

import { transmissaoDaCamera } from "@/lib/mestre/camera-actions";
import type { Scene } from "@/types/scene";

const cena = { id: "c1", cameraNoArId: "cam1" } as unknown as Scene;

describe("transmissaoDaCamera", () => {
  it("é no ar só com a cena no ar", () => {
    expect(transmissaoDaCamera(cena, "cam1", true)).toBe("no-ar");
  });

  // A câmera gravada na cena fora do ar é a que a mesa VAI ver, e não a que
  // vê: vermelho ali diria que a TV mostra o que ela não mostra.
  it("é preparada com a cena fora do ar", () => {
    expect(transmissaoDaCamera(cena, "cam1", false)).toBe("preparada");
  });

  it("não é nada para as outras câmeras, nem sem câmera", () => {
    expect(transmissaoDaCamera(cena, "cam2", true)).toBeNull();
    expect(transmissaoDaCamera(cena, undefined, true)).toBeNull();
    expect(
      transmissaoDaCamera({ id: "c1" } as unknown as Scene, undefined, false),
    ).toBeNull();
  });
});
