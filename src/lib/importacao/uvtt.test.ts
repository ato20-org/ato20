import { describe, expect, it } from "vitest";

import {
  ErroDeUVTT,
  converterUVTT,
  corDaUVTT,
  escuridaoDoAmbiente,
  lerUVTT,
  type DocumentoUVTT,
} from "@/lib/importacao/uvtt";
import { CORES_DA_LUZ, SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

/**
 * Um mapa de 20 × 15 quadrados a 100 pixels: 2000 × 1500. Encaixado na cena de
 * 1920 × 1080 pela altura, ele fica com 1440 × 1080, começando em x = 240 -- e
 * cada quadrado mede 72 unidades de cena.
 */
const QUADRADO = 72;
const ESQUERDA = 240;

function mapa(extra: Partial<DocumentoUVTT> = {}): DocumentoUVTT {
  return {
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: 20, y: 15 },
      pixels_per_grid: 100,
    },
    ...extra,
  };
}

describe("lerUVTT", () => {
  it("recusa o que não é mapa, dizendo por quê", () => {
    const motivo = (texto: string) => {
      try {
        lerUVTT(texto);
      } catch (erro) {
        return erro instanceof ErroDeUVTT ? erro.motivo : "outro";
      }
      return "aceitou";
    };

    expect(motivo("isto não é json")).toBe("json");
    expect(motivo("{}")).toBe("tamanho");
    expect(motivo('{"resolution":{"map_size":{"x":0,"y":5}}}')).toBe("tamanho");
    expect(motivo('{"resolution":{"map_size":{"x":20,"y":15}}}')).toBe("aceitou");
  });
});

describe("corDaUVTT", () => {
  it("lê o alfa na frente, como o Dungeondraft escreve", () => {
    expect(corDaUVTT("ffeccd8b")).toBe("#eccd8b");
    expect(corDaUVTT("#FFAA5500")).toBe("#aa5500");
  });

  it("passa seis dígitos como estão, e o ilegível vira a chama", () => {
    expect(corDaUVTT("eccd8b")).toBe("#eccd8b");
    expect(corDaUVTT("laranja")).toBe(CORES_DA_LUZ[0]);
    expect(corDaUVTT(undefined)).toBe(CORES_DA_LUZ[0]);
  });
});

describe("escuridaoDoAmbiente", () => {
  it("escurece pelo contrário do brilho da luz ambiente", () => {
    expect(escuridaoDoAmbiente({ baked_lighting: false, ambient_light: "ffffffff" })).toBe(0);
    expect(escuridaoDoAmbiente({ baked_lighting: false, ambient_light: "ff000000" })).toBe(1);
  });

  it("não mexe na escuridão com a luz assada na imagem, nem sem ambiente", () => {
    expect(escuridaoDoAmbiente({ baked_lighting: true, ambient_light: "ff101010" })).toBeUndefined();
    expect(escuridaoDoAmbiente({ baked_lighting: false })).toBeUndefined();
    expect(escuridaoDoAmbiente(undefined)).toBeUndefined();
  });
});

describe("converterUVTT", () => {
  it("encaixa o mapa na cena como o fundo vai ser encaixado", () => {
    const { grid } = converterUVTT(mapa());

    expect(grid.size).toBe(QUADRADO);
    expect(grid.offsetX).toBe(ESQUERDA);
    expect(grid.offsetY).toBe(0);
    expect(grid.snap).toBe(true);
    // O mapa inteiro cabe na cena: a borda direita é a do encaixe.
    expect(ESQUERDA + 20 * QUADRADO).toBe((SCENE_WIDTH + 1440) / 2);
    expect(15 * QUADRADO).toBe(SCENE_HEIGHT);
  });

  it("conta a partir de map_origin", () => {
    const { luzes } = converterUVTT(
      mapa({
        resolution: { map_origin: { x: -2, y: -1 }, map_size: { x: 20, y: 15 }, pixels_per_grid: 100 },
        lights: [{ position: { x: -2, y: -1 }, range: 4, color: "ffeccd8b" }],
      }),
    );

    expect(luzes[0]).toMatchObject({ x: ESQUERDA, y: 0 });
  });

  it("linha aberta vira um segmento por lado, na diagonal certa", () => {
    const { paredes } = converterUVTT(
      mapa({ line_of_sight: [[{ x: 0, y: 2 }, { x: 5, y: 2 }, { x: 7, y: 0 }]] }),
    );

    expect(paredes).toHaveLength(2);
    expect(paredes[0]).toMatchObject({
      formato: "linha",
      x: ESQUERDA,
      y: 2 * QUADRADO,
      width: 5 * QUADRADO,
      height: 0,
    });
    // De (5,2) a (7,0) sobe da esquerda para a direita: a outra diagonal.
    expect(paredes[1]).toMatchObject({ formato: "linha", diagonal: "secundaria" });
  });

  it("laço fechado vira um polígono só, e as sombras dos objetos entram junto", () => {
    const laco = [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 4 },
      { x: 1, y: 1 },
    ];
    const { paredes } = converterUVTT(
      mapa({ line_of_sight: [laco], objects_line_of_sight: [[{ x: 9, y: 9 }, { x: 10, y: 9 }]] }),
    );

    expect(paredes).toHaveLength(2);
    expect(paredes[0]).toMatchObject({
      formato: "poligono",
      x: ESQUERDA + QUADRADO,
      y: QUADRADO,
      width: 2 * QUADRADO,
      height: 3 * QUADRADO,
      pontos: [0, 0, 1, 0, 1, 1],
    });
    expect(paredes[1]).toMatchObject({ formato: "linha" });
  });

  it("só o portal fechado vira porta, com a dobradiça no primeiro limite", () => {
    const { portas } = converterUVTT(
      mapa({
        portals: [
          { bounds: [{ x: 5, y: 3 }, { x: 5, y: 4 }], closed: true },
          { bounds: [{ x: 8, y: 3 }, { x: 9, y: 3 }], closed: false },
        ],
      }),
    );

    expect(portas).toHaveLength(1);
    expect(portas[0]).toMatchObject({
      x: ESQUERDA + 5 * QUADRADO,
      y: 3 * QUADRADO,
      comprimento: QUADRADO,
      angulo: 90,
    });
    expect(portas[0]?.abertura).toBeUndefined();
  });

  it("luz com o alcance em quadrados, a cor do arquivo e a intensidade presa", () => {
    const { luzes } = converterUVTT(
      mapa({
        lights: [
          { position: { x: 6.5, y: 5 }, range: 4.5, intensity: 1.3, color: "ffeccd8b" },
          { position: { x: 2, y: 2 }, range: 2, intensity: 0.4, color: "ff93c5fd" },
          { position: { x: 40, y: 2 }, range: 2 },
        ],
      }),
    );

    // A terceira está fora do mapa.
    expect(luzes).toHaveLength(2);
    expect(luzes[0]).toMatchObject({
      x: ESQUERDA + 6.5 * QUADRADO,
      y: 5 * QUADRADO,
      raio: 4.5 * QUADRADO,
      cor: "#eccd8b",
    });
    expect(luzes[0]?.intensidade).toBeUndefined();
    expect(luzes[1]).toMatchObject({ cor: "#93c5fd", intensidade: 0.4 });
  });
});
