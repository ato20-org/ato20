import { describe, expect, it } from "vitest";

import type { Bounds } from "@/lib/geometry/bounds";
import {
  AFASTAR_EXTRA,
  ampliarCamera,
  ampliarCameraNoCentro,
  cabeTudo,
  centrarCameraEm,
  clampCamera,
  clampCameraPorEixo,
  clampViewport,
  comFolga,
  formatoDentroDe,
  FULL_VIEWPORT,
  MAX_ZOOM,
  panViewport,
  PLANO,
  proporcaoDe,
  quadroDaMesa,
  quadroNaTela,
  recorteNaTela,
  temFormatoDaMesa,
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

  const largura = preso(width, MIN_WIDTH, SCENE_WIDTH * AFASTAR_EXTRA);
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

  it("só diz que chegou ao fim do afastar a duas larguras do plano", () => {
    expect(cabeTudo(FULL_VIEWPORT, PLANO)).toBe(false);
    expect(
      cabeTudo(
        { ...FULL_VIEWPORT, width: SCENE_WIDTH * AFASTAR_EXTRA - 1 },
        PLANO,
      ),
    ).toBe(false);
    expect(
      cabeTudo({ ...FULL_VIEWPORT, width: SCENE_WIDTH * AFASTAR_EXTRA }, PLANO),
    ).toBe(true);
  });

  it("afasta até metade do plano e para lá", () => {
    const longe = clampViewport({ ...FULL_VIEWPORT, width: 99_999 }, PLANO);

    expect(viewportZoom(longe)).toBeCloseTo(1 / AFASTAR_EXTRA);
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

  it("deixa afastar até o dobro do encaixe, e não mais", () => {
    const encaixado = viewportQueCabe(vazouParaDireita);
    const longe = zoomViewport(encaixado, 0.1, { x: 0, y: 0 }, vazouParaDireita);

    expect(cabeTudo(encaixado, vazouParaDireita)).toBe(false);
    expect(longe.width).toBeCloseTo(encaixado.width * AFASTAR_EXTRA);
    expect(cabeTudo(longe, vazouParaDireita)).toBe(true);
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

describe("recorteNaTela", () => {
  const moldura = { width: 1000, height: 800 };

  /** O mesmo recorte em cinco ampliações, todas 16:9 como o clamp garante. */
  const ampliacoes = [1, 2, 4, 8, MAX_ZOOM].map((fator) =>
    clampViewport({
      x: 300,
      y: 200,
      width: SCENE_WIDTH / fator,
      height: 0,
    }),
  );

  function naTela(viewport: Viewport) {
    return recorteNaTela(
      moldura,
      viewport,
      Math.min(
        moldura.width / viewport.width,
        moldura.height / viewport.height,
      ),
    );
  }

  it("é o mesmo retângulo em qualquer ampliação da câmera", () => {
    // A promessa que sustenta o overlay: aproximar não mexe na caixa. Se isto
    // quebrar, o retrato do jogador volta a andar com o zoom.
    const primeiro = naTela(ampliacoes[0]);

    for (const viewport of ampliacoes) {
      expect(naTela(viewport)).toEqual(primeiro);
    }
  });

  it("é o mesmo retângulo em qualquer deslocamento da câmera", () => {
    const parado = naTela(clampViewport({ x: 0, y: 0, width: 960, height: 0 }));

    for (const x of [-5_000, 0, 137, 5_000]) {
      for (const y of [-5_000, 0, 42, 5_000]) {
        expect(naTela(clampViewport({ x, y, width: 960, height: 0 }))).toEqual(
          parado,
        );
      }
    }
  });

  it("letterboxa: encosta no eixo apertado e centra a sobra no outro", () => {
    // Moldura 1000x800 é mais alta que 16:9, então a largura manda e a sobra
    // vai para cima e para baixo, dividida em duas.
    const caixa = naTela(ampliacoes[0]);

    expect(caixa.left).toBeCloseTo(0);
    expect(caixa.width).toBeCloseTo(moldura.width);
    expect(caixa.height).toBeCloseTo(moldura.width * ASPECT);
    expect(caixa.top).toBeCloseTo((moldura.height - caixa.height) / 2);
  });

  it("moldura ainda não medida devolve caixa sem área", () => {
    // `scale` zero é o primeiro paint. Nada a desenhar, e nenhum NaN.
    const caixa = recorteNaTela({ width: 0, height: 0 }, FULL_VIEWPORT, 0);

    expect(caixa).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });
});

/** A torre em pé: metade da largura do plano, a altura inteira dele. */
const emPe: Viewport = { x: 400, y: 0, width: 600, height: SCENE_HEIGHT };

/** O corredor deitado: a largura inteira, um quarto da altura. */
const deitado: Viewport = {
  x: 0,
  y: 300,
  width: SCENE_WIDTH,
  height: SCENE_HEIGHT / 4,
};

const MIN_HEIGHT = MIN_WIDTH * ASPECT;

function centro(viewport: Viewport) {
  return {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  };
}

describe("a câmera tem formato próprio", () => {
  const areas = [PLANO, vazouParaDireita, vazouParaEsquerda, torre];

  it("dentro dos limites, sai do clamp como entrou", () => {
    for (const camera of [emPe, deitado])
      expect(clampCamera(camera)).toEqual(camera);
  });

  it("pequena demais, cresce inteira e mantém o formato", () => {
    const miuda = { x: 500, y: 500, width: 30, height: 60 };
    const presa = clampCamera(miuda);

    expect(proporcaoDe(presa)).toBeCloseTo(proporcaoDe(miuda));
    expect(presa.width).toBeCloseTo(MIN_WIDTH);
    // Pelo centro: crescer não pode empurrar a câmera para um lado.
    expect(centro(presa).x).toBeCloseTo(centro(miuda).x);
    expect(centro(presa).y).toBeCloseTo(centro(miuda).y);
  });

  it("nunca passa dos limites em nenhum eixo, em formato nenhum", () => {
    const proximo = sorteio(11);

    for (const conteudo of areas)
      for (let i = 0; i < 2_000; i++) {
        const camera = {
          x: (proximo() - 0.5) * 20_000,
          y: (proximo() - 0.5) * 20_000,
          width: 1 + proximo() * 20_000,
          height: 1 + proximo() * 20_000,
        };

        for (const prender of [clampCamera, clampCameraPorEixo]) {
          const { width, height } = prender(camera, conteudo);
          const encaixe = viewportQueCabe(conteudo);

          expect(width).toBeGreaterThanOrEqual(MIN_WIDTH - 1e-9);
          expect(height).toBeGreaterThanOrEqual(MIN_HEIGHT - 1e-9);
          expect(width).toBeLessThanOrEqual(
            encaixe.width * AFASTAR_EXTRA + 1e-6,
          );
          expect(height).toBeLessThanOrEqual(
            encaixe.height * AFASTAR_EXTRA + 1e-6,
          );
        }
      }
  });

  it("prender uma câmera já presa não a move de novo", () => {
    const proximo = sorteio(13);

    for (const conteudo of areas)
      for (let i = 0; i < 500; i++) {
        const uma = clampCamera(
          {
            x: (proximo() - 0.5) * 20_000,
            y: (proximo() - 0.5) * 20_000,
            width: 1 + proximo() * 20_000,
            height: 1 + proximo() * 20_000,
          },
          conteudo,
        );

        expect(clampCamera(uma, conteudo)).toEqual(uma);
        expect(clampCameraPorEixo(uma, conteudo)).toEqual(uma);
      }
  });

  it("pelo canto, o eixo que bate no piso para e o outro não se mexe", () => {
    // O mestre encolhe a altura do corredor até o fim. A largura é dele, e
    // não pode crescer sozinha para manter uma proporção que ele está mudando.
    const achatado = clampCameraPorEixo({ ...deitado, height: 5 });

    expect(achatado.height).toBeCloseTo(MIN_HEIGHT);
    expect(achatado.width).toBe(deitado.width);
  });

  it("aproxima mantendo o formato, e para quando um eixo chega ao piso", () => {
    for (const camera of [emPe, deitado]) {
      const fundo = ampliarCameraNoCentro(camera, 1e6);

      expect(proporcaoDe(fundo)).toBeCloseTo(proporcaoDe(camera));
      // A torre bate pela largura; o corredor, pela altura.
      expect(
        Math.min(fundo.width / MIN_WIDTH, fundo.height / MIN_HEIGHT),
      ).toBeCloseTo(1);
    }
  });

  it("afasta mantendo o formato, e para quando um eixo chega ao teto", () => {
    for (const camera of [emPe, deitado]) {
      const longe = ampliarCameraNoCentro(camera, 1e-6);
      const encaixe = viewportQueCabe(PLANO);

      expect(proporcaoDe(longe)).toBeCloseTo(proporcaoDe(camera));
      expect(
        Math.max(
          longe.width / (encaixe.width * AFASTAR_EXTRA),
          longe.height / (encaixe.height * AFASTAR_EXTRA),
        ),
      ).toBeCloseTo(1);
    }
  });

  it("aproxima com a âncora parada", () => {
    const ancora = { x: 500, y: 700 };
    const perto = ampliarCamera(emPe, 2, ancora);

    expect((ancora.x - perto.x) / perto.width).toBeCloseTo(
      (ancora.x - emPe.x) / emPe.width,
    );
    expect((ancora.y - perto.y) / perto.height).toBeCloseTo(
      (ancora.y - emPe.y) / emPe.height,
    );
  });

  it("recentrar não muda tamanho nem formato", () => {
    const ali = centrarCameraEm(deitado, { x: 900, y: 500 });

    expect(ali.width).toBe(deitado.width);
    expect(ali.height).toBe(deitado.height);
    expect(centro(ali)).toEqual({ x: 900, y: 500 });
  });

  it("enquadra uma caixa no formato pedido, com a caixa inteira dentro", () => {
    const caixa: Bounds = { minX: 100, minY: 100, maxX: 300, maxY: 900 };
    const enquadrado = viewportQueCabe(caixa, proporcaoDe(deitado));

    expect(proporcaoDe(enquadrado)).toBeCloseTo(proporcaoDe(deitado));
    expect(enquadrado.x).toBeLessThanOrEqual(caixa.minX);
    expect(enquadrado.y).toBeLessThanOrEqual(caixa.minY);
    expect(enquadrado.x + enquadrado.width).toBeGreaterThanOrEqual(caixa.maxX);
    expect(enquadrado.y + enquadrado.height).toBeGreaterThanOrEqual(
      caixa.maxY,
    );
  });

  it("enquadrar uma caixa minúscula não desce do piso no eixo curto", () => {
    // Sem o piso da altura, o corredor sairia mais fino que o MAX_ZOOM deixa,
    // e o clamp depois o esticaria -- mudando o formato.
    const ponto: Bounds = { minX: 500, minY: 500, maxX: 501, maxY: 501 };
    const enquadrado = viewportQueCabe(ponto, proporcaoDe(deitado));

    expect(enquadrado.height).toBeGreaterThanOrEqual(MIN_HEIGHT - 1e-9);
    expect(clampCamera(enquadrado)).toEqual(enquadrado);
  });

  it("lê a ampliação pelo eixo que aperta", () => {
    // A torre com a altura do plano mostra o plano em escala um numa TV 16:9.
    expect(viewportZoom(emPe)).toBeCloseTo(1);
    expect(viewportZoom(deitado)).toBeCloseTo(1);
    expect(viewportZoom(FULL_VIEWPORT)).toBe(1);
  });
});

describe("trazer a câmera para o palco", () => {
  const palco = clampViewport({ x: 200, y: 100, width: 960, height: 0 });

  it("a câmera 16:9 recebe o palco ele mesmo", () => {
    expect(formatoDentroDe(palco, ASPECT)).toBe(palco);
  });

  it("a câmera em pé encosta em cima e embaixo, centrada nos lados", () => {
    const dentro = formatoDentroDe(palco, proporcaoDe(emPe));

    expect(dentro.height).toBeCloseTo(palco.height);
    expect(proporcaoDe(dentro)).toBeCloseTo(proporcaoDe(emPe));
    expect(centro(dentro).x).toBeCloseTo(centro(palco).x);
    expect(centro(dentro).y).toBeCloseTo(centro(palco).y);
  });

  it("o corredor encosta nos lados, centrado em cima e embaixo", () => {
    const dentro = formatoDentroDe(palco, proporcaoDe(deitado));

    expect(dentro.width).toBeCloseTo(palco.width);
    expect(centro(dentro).y).toBeCloseTo(centro(palco).y);
  });
});

describe("quadroDaMesa", () => {
  it("devolve a câmera 16:9 ela mesma, e não uma cópia", () => {
    // O retrato é `memo`; uma caixa nova por render o redesenharia a 10 Hz.
    const camera = clampViewport({ x: 10, y: 20, width: 800, height: 0 });

    expect(temFormatoDaMesa(camera)).toBe(true);
    expect(quadroDaMesa(camera)).toBe(camera);
  });

  it("é o menor 16:9 que contém a câmera, com o mesmo centro", () => {
    for (const camera of [emPe, deitado]) {
      const quadro = quadroDaMesa(camera);

      expect(temFormatoDaMesa(quadro)).toBe(true);
      expect(centro(quadro).x).toBeCloseTo(centro(camera).x);
      expect(centro(quadro).y).toBeCloseTo(centro(camera).y);
      // Encosta no eixo que aperta, e sobra no outro.
      expect(
        Math.max(
          camera.width / quadro.width,
          camera.height / quadro.height,
        ),
      ).toBeCloseTo(1);
    }
  });

  it("devolver a câmera ao 16:9 não tira nada do que a mesa via", () => {
    const quadro = quadroDaMesa(emPe);

    expect(quadro.x).toBeLessThanOrEqual(emPe.x);
    expect(quadro.x + quadro.width).toBeGreaterThanOrEqual(
      emPe.x + emPe.width,
    );
    expect(quadro.height).toBeCloseTo(emPe.height);
  });
});

describe("quadroNaTela", () => {
  const moldura = { width: 1920, height: 1080 };
  const escala = (viewport: Viewport) =>
    Math.min(moldura.width / viewport.width, moldura.height / viewport.height);

  it("com a câmera 16:9, é o próprio recorte", () => {
    const camera = clampViewport({ x: 300, y: 200, width: 700, height: 0 });
    const recorte = recorteNaTela(moldura, camera, escala(camera));
    const quadro = quadroNaTela(moldura);

    expect(quadro.left).toBeCloseTo(recorte.left);
    expect(quadro.top).toBeCloseTo(recorte.top);
    expect(quadro.width).toBeCloseTo(recorte.width);
    expect(quadro.height).toBeCloseTo(recorte.height);
  });

  it("com a câmera em pé, contém o recorte e sobra dos lados", () => {
    // É o espaço do retrato: ele fica sobre a tarja, e não em cima da torre.
    const recorte = recorteNaTela(moldura, emPe, escala(emPe));
    const quadro = quadroNaTela(moldura);

    expect(quadro.width).toBeGreaterThan(recorte.width);
    expect(quadro.left).toBeLessThan(recorte.left);
    expect(quadro.height).toBeCloseTo(recorte.height);
  });

  it("numa moldura fora de 16:9, letterboxa como o recorte de sempre", () => {
    const alta = { width: 1000, height: 800 };
    const quadro = quadroNaTela(alta);

    expect(quadro.left).toBeCloseTo(0);
    expect(quadro.width).toBeCloseTo(alta.width);
    expect(quadro.height).toBeCloseTo(alta.width * ASPECT);
    expect(quadro.top).toBeCloseTo((alta.height - quadro.height) / 2);
  });

  it("moldura ainda não medida devolve caixa sem área", () => {
    expect(quadroNaTela({ width: 0, height: 0 })).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
  });
});
