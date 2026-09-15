import { describe, expect, it } from "vitest";

import type { Bounds } from "@/lib/geometry/bounds";
import {
  cabeTudo,
  clampViewport,
  comFolga,
  FULL_VIEWPORT,
  MAX_ZOOM,
  panViewport,
  PLANO,
  viewportQueCabe,
  viewportZoom,
  zoomViewport,
} from "@/lib/geometry/viewport";
import { SCENE_HEIGHT, SCENE_WIDTH, type Viewport } from "@/types/scene";

const ASPECT = SCENE_HEIGHT / SCENE_WIDTH;
const MIN_WIDTH = SCENE_WIDTH / MAX_ZOOM;

/**
 * O clamp como ele era quando o limite do palco era o PLANO, e não o conteúdo.
 *
 * Copiado do git e mantido aqui de propósito: a promessa da mudança para
 * limites que acompanham o conteúdo é que a cena que nunca vazou do plano se
 * comporta exatamente como antes. Promessa sem o "antes" ao lado não dá para
 * conferir, e a versão de hoje comparada consigo mesma não prova nada.
 */
function clampComoEraAntes({ x, y, width }: Viewport): Viewport {
  const preso = (valor: number, min: number, max: number) =>
    Math.min(max, Math.max(min, valor));

  const largura = preso(width, MIN_WIDTH, SCENE_WIDTH);
  const altura = largura * ASPECT;

  return {
    x: preso(x, -SCENE_WIDTH, SCENE_WIDTH - largura + SCENE_WIDTH),
    y: preso(y, -SCENE_HEIGHT, SCENE_HEIGHT - altura + SCENE_HEIGHT),
    width: largura,
    height: altura,
  };
}

/** Um gerador estável: falha de teste que só acontece às vezes não é achado. */
function sorteio(semente: number): () => number {
  let estado = semente;

  return () => {
    estado = (estado * 1103515245 + 12345) % 2147483648;
    return estado / 2147483648;
  };
}

const vazouParaDireita: Bounds = {
  minX: 0,
  minY: 0,
  maxX: SCENE_WIDTH + 3000,
  maxY: SCENE_HEIGHT,
};

const vazouParaEsquerda: Bounds = {
  minX: -2500,
  minY: -900,
  maxX: SCENE_WIDTH,
  maxY: SCENE_HEIGHT,
};

/** Alto e estreito: o recorte 16:9 precisa transbordar os lados para conter. */
const torre: Bounds = { minX: 0, minY: 0, maxX: 100, maxY: 6000 };

describe("com tudo dentro do plano, nada mudou", () => {
  it("prende o recorte exatamente como prendia antes", () => {
    const proximo = sorteio(20_260_915);

    for (let i = 0; i < 20_000; i++) {
      const pedido: Viewport = {
        x: (proximo() - 0.5) * 9000,
        y: (proximo() - 0.5) * 6000,
        width: proximo() * 3000 + 1,
        height: 0,
      };

      expect(clampViewport(pedido, PLANO)).toEqual(clampComoEraAntes(pedido));
    }
  });

  it("encaixa no plano inteiro, no mesmo canto e no mesmo tamanho", () => {
    expect(viewportQueCabe(PLANO)).toEqual(FULL_VIEWPORT);
  });

  it("lê o plano inteiro como 100%", () => {
    expect(viewportZoom(FULL_VIEWPORT)).toBe(1);
  });

  it("só diz que cabe tudo a partir da largura do plano", () => {
    expect(cabeTudo({ ...FULL_VIEWPORT, width: 1919 }, PLANO)).toBe(false);
    expect(cabeTudo(FULL_VIEWPORT, PLANO)).toBe(true);
  });

  it("é o padrão quando ninguém informa área", () => {
    const pedido: Viewport = { x: 9999, y: 9999, width: 500, height: 0 };

    expect(clampViewport(pedido)).toEqual(clampViewport(pedido, PLANO));
  });
});

describe("conteúdo que passou das bordas do plano", () => {
  it("é alcançado pelo encaixe, dos dois lados", () => {
    for (const conteudo of [vazouParaDireita, vazouParaEsquerda]) {
      const recorte = viewportQueCabe(conteudo);

      expect(recorte.x).toBeLessThanOrEqual(conteudo.minX);
      expect(recorte.x + recorte.width).toBeGreaterThanOrEqual(conteudo.maxX);
      expect(recorte.y).toBeLessThanOrEqual(conteudo.minY);
      expect(recorte.y + recorte.height).toBeGreaterThanOrEqual(conteudo.maxY);
    }
  });

  it("faz o encaixe ler menos de 100%, porque a vista está além do plano", () => {
    expect(viewportZoom(viewportQueCabe(vazouParaDireita))).toBeLessThan(1);
  });

  it("não deixa afastar depois que tudo já cabe", () => {
    const encaixado = viewportQueCabe(vazouParaDireita);

    expect(cabeTudo(encaixado, vazouParaDireita)).toBe(true);
    expect(
      zoomViewport(encaixado, 0.5, { x: 0, y: 0 }, vazouParaDireita).width,
    ).toBeCloseTo(encaixado.width);
  });

  it("deixa o deslocamento chegar à folga, depois do fim e antes do começo", () => {
    const recorte = viewportQueCabe(vazouParaDireita);
    const navegavel = comFolga(vazouParaDireita);

    expect(panViewport(recorte, 99_999, 0, vazouParaDireita).x).toBeCloseTo(
      navegavel.maxX - recorte.width,
    );
    expect(panViewport(recorte, -99_999, 0, vazouParaDireita).x).toBeCloseTo(
      navegavel.minX,
    );
  });
});

describe("área que o recorte 16:9 não consegue caber", () => {
  it("centra em vez de grudar na borda errada", () => {
    const preso = clampViewport(viewportQueCabe(torre), torre);
    const navegavel = comFolga(torre);

    expect(Number.isFinite(preso.x)).toBe(true);
    expect(preso.x + preso.width / 2).toBeCloseTo(
      (navegavel.minX + navegavel.maxX) / 2,
    );
  });

  it("ainda contém a altura inteira", () => {
    const preso = clampViewport(viewportQueCabe(torre), torre);

    expect(preso.y).toBeLessThanOrEqual(torre.minY);
    expect(preso.y + preso.height).toBeGreaterThanOrEqual(torre.maxY);
  });
});

describe("regras que valem em qualquer área", () => {
  const areas = [PLANO, vazouParaDireita, vazouParaEsquerda, torre];

  it("nunca entrega recorte fora de 16:9", () => {
    const proximo = sorteio(7);

    for (const conteudo of areas)
      for (let i = 0; i < 2_000; i++) {
        const { width, height } = clampViewport(
          {
            x: (proximo() - 0.5) * 20_000,
            y: (proximo() - 0.5) * 20_000,
            width: proximo() * 20_000,
            height: proximo() * 20_000,
          },
          conteudo,
        );

        expect(height / width).toBeCloseTo(ASPECT);
      }
  });

  it("mantém a ampliação máxima ancorada no plano, não no conteúdo", () => {
    for (const conteudo of areas)
      expect(
        zoomViewport(viewportQueCabe(conteudo), 1e6, { x: 0, y: 0 }, conteudo)
          .width,
      ).toBeCloseTo(MIN_WIDTH);
  });

  it("prender um recorte já preso não o move de novo", () => {
    for (const conteudo of areas) {
      const uma = clampViewport(
        { x: 12_345, y: -9_876, width: 700, height: 0 },
        conteudo,
      );

      expect(clampViewport(uma, conteudo)).toEqual(uma);
    }
  });
});
