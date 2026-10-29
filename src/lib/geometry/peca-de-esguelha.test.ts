import { describe, expect, it } from "vitest";

import { espelhadaPeloOlhar } from "@/lib/geometry/peca-de-esguelha";

/**
 * Um token em pé. Com o cone padrão (90°, para baixo na figura) e giro zero,
 * ele olha para baixo no mapa -- para a câmera, que com `giro: 0` está do lado
 * de baixo. `rotation` gira o olhar no sentido horário.
 */
const TOKEN = { rotation: 0, espelharPeloOlhar: true as const };

describe("espelhadaPeloOlhar", () => {
  it("desligado, é o espelho manual e só ele", () => {
    expect(espelhadaPeloOlhar({ rotation: 90 }, 0)).toBe(false);
    expect(espelhadaPeloOlhar({ rotation: 90, flipX: true }, 0)).toBe(true);
  });

  it("olhando para a direita da tela fica como está, para a esquerda espelha", () => {
    // `rotation: -90` leva o olhar de 90° para 0°: a direita do mapa, que com
    // giro zero é a direita da tela.
    expect(espelhadaPeloOlhar({ ...TOKEN, rotation: -90 }, 0)).toBe(false);
    // `rotation: 90` leva para 180°: a esquerda.
    expect(espelhadaPeloOlhar({ ...TOKEN, rotation: 90 }, 0)).toBe(true);
  });

  it("girar a câmera troca o lado sem o token mexer", () => {
    // Olhando para a direita do mapa: com a câmera meia volta, é a esquerda
    // da tela.
    expect(espelhadaPeloOlhar({ ...TOKEN, rotation: -90 }, 180)).toBe(true);
  });

  it("o espelho manual diz de que lado a arte olha: inverte o resultado", () => {
    expect(
      espelhadaPeloOlhar({ ...TOKEN, rotation: -90, flipX: true }, 0),
    ).toBe(true);
    expect(espelhadaPeloOlhar({ ...TOKEN, rotation: 90, flipX: true }, 0)).toBe(
      false,
    );
  });

  it("a deitada não espelha pelo olhar: ela está no chão", () => {
    expect(
      espelhadaPeloOlhar({ ...TOKEN, rotation: 90, deitado: true }, 0),
    ).toBe(false);
  });
});
