import { describe, expect, it } from "vitest";

import {
  agarrarAte,
  aproximar,
  bocaDoTripe,
  cameraDoRecorte,
  correnteDaCamera,
  curvaBezier,
  daTelaAoChao,
  doOlhoAoMundo,
  focalDaLente,
  misturarTripe,
  pegadaDoTripe,
  prender,
  profundidadeNoTripe,
  projetarNoTripe,
  tripeDaOrbital,
  projetar,
  type CameraOrbital,
  type LimitesDaCamera,
  type Tela,
} from "@/lib/geometry/camera-orbital";

const TELA: Tela = {
  largura: 1440,
  altura: 900,
  focal: focalDaLente(900, 45),
};

const CENTRO = { x: TELA.largura / 2, y: TELA.altura / 2 };

const LIMITES: LimitesDaCamera = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
  zoomMin: 0.1,
  zoomMax: 20,
};

function camera(parcial: Partial<CameraOrbital> = {}): CameraOrbital {
  return {
    alvo: { x: 960, y: 540 },
    zoom: 1.5,
    giro: 0,
    inclinacao: 52,
    ...parcial,
  };
}

/** As vistas em que as contas têm de fechar: de prumo, deitada e girada. */
const VISTAS: Array<Partial<CameraOrbital>> = [
  { giro: 0, inclinacao: 0 },
  { giro: 0, inclinacao: 52 },
  { giro: 37, inclinacao: 30 },
  { giro: 200, inclinacao: 70 },
  { giro: 90, inclinacao: 45, zoom: 4, alvo: { x: 100, y: 900 } },
];

const PIXELS = [
  { x: 0, y: 899 },
  { x: 1439, y: 899 },
  { x: 720, y: 450 },
  { x: 300, y: 600 },
  { x: 1200, y: 300 },
];

describe("focalDaLente", () => {
  it("dá a distância em que a metade da tela abre a metade do ângulo", () => {
    // 90° na vertical: a metade da tela é igual à distância do olho.
    expect(focalDaLente(900, 90)).toBeCloseTo(450, 6);
  });

  it("lente mais fechada põe o olho mais longe", () => {
    expect(focalDaLente(900, 20)).toBeGreaterThan(focalDaLente(900, 60));
  });
});

describe("projetar e daTelaAoChao", () => {
  it("o alvo cai no centro da tela, em qualquer vista", () => {
    for (const vista of VISTAS) {
      const cam = camera(vista);
      const naTela = projetar(cam, TELA, cam.alvo)!;

      expect(naTela.x).toBeCloseTo(CENTRO.x, 6);
      expect(naTela.y).toBeCloseTo(CENTRO.y, 6);
    }
  });

  it("uma é a inversa da outra no chão", () => {
    for (const vista of VISTAS) {
      const cam = camera(vista);

      for (const pixel of PIXELS) {
        const noChao = daTelaAoChao(cam, TELA, pixel);
        if (!noChao) continue;
        const deVolta = projetar(cam, TELA, noChao)!;

        expect(deVolta.x).toBeCloseTo(pixel.x, 6);
        expect(deVolta.y).toBeCloseTo(pixel.y, 6);
      }
    }
  });

  it("acima do horizonte não há chão", () => {
    // Deitada a 70° com lente de 45°, o alto da tela olha o céu.
    const cam = camera({ inclinacao: 70 });

    expect(daTelaAoChao(cam, TELA, { x: 720, y: 0 })).toBeNull();
  });

  it("de prumo, um pixel é 1 / zoom unidades de chão em qualquer lugar", () => {
    const cam = camera({ inclinacao: 0, zoom: 2 });
    const a = daTelaAoChao(cam, TELA, { x: 100, y: 100 })!;
    const b = daTelaAoChao(cam, TELA, { x: 101, y: 100 })!;

    expect(b.x - a.x).toBeCloseTo(0.5, 6);
  });

  it("o que está atrás do olho não é projetado", () => {
    // Um ponto muito perto de quem olha, embaixo da tela, deitado e ampliado.
    const cam = camera({ inclinacao: 70, zoom: 6 });

    expect(projetar(cam, TELA, { x: 960, y: 540 + 800 })).toBeNull();
  });
});

describe("inclinar não dá zoom", () => {
  it("o chão no centro da tela mantém a escala de lado a lado", () => {
    // O defeito da foto: deitar encolhia a cena para caber. Aqui a largura de
    // um palmo no alvo é a mesma deitado ou de prumo, porque o olho não se
    // afasta -- só muda de onde ele olha.
    for (const inclinacao of [0, 20, 52, 72]) {
      const cam = camera({ inclinacao, zoom: 1.5 });
      const a = projetar(cam, TELA, { x: 950, y: 540 })!;
      const b = projetar(cam, TELA, { x: 970, y: 540 })!;

      expect(b.x - a.x).toBeCloseTo(30, 6);
    }
  });

  it("girar também não", () => {
    for (const giro of [0, 15, 45, 60, 90]) {
      const cam = camera({ giro, inclinacao: 52 });
      const a = projetar(cam, TELA, cam.alvo)!;
      const b = projetar(cam, TELA, {
        x: cam.alvo.x + 10 * Math.cos((-giro * Math.PI) / 180),
        y: cam.alvo.y + 10 * Math.sin((-giro * Math.PI) / 180),
      })!;

      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(15, 6);
    }
  });
});

describe("aproximar abre a perspectiva", () => {
  it("de perto, o lado de perto cresce mais que o de longe", () => {
    // Na foto, ampliar multiplicava tudo pelo mesmo fator. Com o olho
    // chegando perto, a razão entre perto e longe aumenta.
    function razao(zoom: number): number {
      const cam = camera({ zoom });
      const perto =
        projetar(cam, TELA, { x: 970, y: 560 })!.x -
        projetar(cam, TELA, { x: 950, y: 560 })!.x;
      const longe =
        projetar(cam, TELA, { x: 970, y: 520 })!.x -
        projetar(cam, TELA, { x: 950, y: 520 })!.x;
      return perto / longe;
    }

    expect(razao(4)).toBeGreaterThan(razao(1));
  });
});

describe("agarrarAte", () => {
  it("o ponto agarrado fica sob o cursor", () => {
    for (const vista of VISTAS) {
      const cam = camera(vista);
      const agarrado = daTelaAoChao(cam, TELA, { x: 600, y: 700 })!;
      const depois = agarrarAte(cam, TELA, agarrado, { x: 900, y: 650 });
      const sob = daTelaAoChao(depois, TELA, { x: 900, y: 650 })!;

      expect(sob.x).toBeCloseTo(agarrado.x, 6);
      expect(sob.y).toBeCloseTo(agarrado.y, 6);
      // Andar não gira nem aproxima.
      expect(depois.zoom).toBe(cam.zoom);
      expect(depois.giro).toBe(cam.giro);
    }
  });

  it("cursor no céu não mexe na câmera", () => {
    const cam = camera({ inclinacao: 70 });

    expect(agarrarAte(cam, TELA, { x: 0, y: 0 }, { x: 720, y: 0 })).toBe(cam);
  });
});

describe("aproximar", () => {
  it("o ponto sob o cursor fica parado", () => {
    const cam = camera({ giro: 30, inclinacao: 50 });
    const pixel = { x: 1000, y: 700 };
    const antes = daTelaAoChao(cam, TELA, pixel)!;
    const depois = aproximar(cam, TELA, 1.6, pixel, LIMITES);
    const agora = daTelaAoChao(depois, TELA, pixel)!;

    expect(depois.zoom).toBeCloseTo(cam.zoom * 1.6, 6);
    expect(agora.x).toBeCloseTo(antes.x, 6);
    expect(agora.y).toBeCloseTo(antes.y, 6);
  });

  it("respeita a faixa de zoom", () => {
    const cam = camera({ zoom: 19 });

    expect(aproximar(cam, TELA, 2, CENTRO, LIMITES).zoom).toBe(20);
  });
});

describe("prender", () => {
  it("o alvo não sai do mapa", () => {
    const presa = prender(camera({ alvo: { x: -50, y: 5000 } }), LIMITES);

    expect(presa.alvo).toEqual({ x: 0, y: 1080 });
  });
});

describe("cameraDoRecorte", () => {
  it("olha o centro do recorte, com o recorte cabendo na tela", () => {
    const cam = cameraDoRecorte(
      { x: 560, y: 341, width: 960, height: 540 },
      TELA,
      0,
      0,
    );

    expect(cam.alvo).toEqual({ x: 1040, y: 611 });
    expect(cam.zoom).toBeCloseTo(1.5, 6);
  });
});

describe("correnteDaCamera", () => {
  it("põe o alvo e o zoom DENTRO do tombo", () => {
    const corrente = correnteDaCamera(
      camera({ alvo: { x: 100, y: 200 }, zoom: 2, giro: 30, inclinacao: 45 }),
      TELA,
    );

    expect(corrente).toBe(
      "translate(720px, 450px) rotateX(45deg) rotateZ(30deg) scale3d(2, 2, 2) translate(-100px, -200px)",
    );
  });
});

describe("curvaBezier", () => {
  it("é a identidade com os pontos de uma reta", () => {
    const reta = curvaBezier(0, 0, 1, 1);

    for (const t of [0, 0.25, 0.5, 0.9, 1]) expect(reta(t)).toBeCloseTo(t, 4);
  });

  it("a curva do salto da TV desacelera: anda mais no começo que no fim", () => {
    const salto = curvaBezier(0.22, 0.61, 0.36, 1);

    expect(salto(0)).toBe(0);
    expect(salto(1)).toBe(1);
    expect(salto(0.5)).toBeGreaterThan(0.8);
    expect(salto(0.25)).toBeGreaterThan(salto(0.1));
  });
});

describe("tripé", () => {
  it("o tripé tirado da orbital projeta igual a ela", () => {
    // A prova de que a corrente do tripé é a da orbital generalizada: o mesmo
    // ponto, pelas duas contas, cai no mesmo pixel.
    for (const vista of VISTAS) {
      const cam = camera(vista);
      const tripe = tripeDaOrbital(cam, TELA);

      for (const ponto of [
        cam.alvo,
        { x: cam.alvo.x + 80, y: cam.alvo.y - 40 },
        { x: cam.alvo.x - 120, y: cam.alvo.y + 60 },
      ]) {
        for (const altura of [0, 110]) {
          const pelaOrbital = projetar(cam, TELA, ponto, altura);
          const peloTripe = projetarNoTripe(tripe, TELA, ponto, altura);
          if (!pelaOrbital) {
            expect(peloTripe).toBeNull();
            continue;
          }
          expect(peloTripe!.x).toBeCloseTo(pelaOrbital.x, 6);
          expect(peloTripe!.y).toBeCloseTo(pelaOrbital.y, 6);
        }
      }
    }
  });

  it("de prumo, o tripé fica em cima do alvo, na distância do zoom", () => {
    const cam = camera({ inclinacao: 0, zoom: 2 });
    const tripe = tripeDaOrbital(cam, TELA);

    expect(tripe.x).toBeCloseTo(cam.alvo.x, 6);
    expect(tripe.y).toBeCloseTo(cam.alvo.y, 6);
    expect(tripe.altura).toBeCloseTo(TELA.focal / 2, 6);
  });

  it("o que está atrás do olho tem profundidade negativa", () => {
    // Deitado de lado, olhando o horizonte para o alto do mapa.
    const tripe = {
      x: 500,
      y: 500,
      altura: 80,
      giro: 0,
      inclinacao: 90,
      rolagem: 0,
      lente: 45,
    };

    expect(profundidadeNoTripe(tripe, { x: 500, y: 300 }, 80)).toBeCloseTo(
      200,
      6,
    );
    expect(profundidadeNoTripe(tripe, { x: 500, y: 700 }, 80)).toBeCloseTo(
      -200,
      6,
    );
    expect(projetarNoTripe(tripe, TELA, { x: 500, y: 700 }, 80)).toBeNull();
  });

  it("lente mais fechada amplia o que está no meio", () => {
    const base = tripeDaOrbital(camera(), TELA);
    const ponto = { x: 980, y: 540 };
    const aberta = projetarNoTripe(base, TELA, ponto)!;
    const fechada = projetarNoTripe({ ...base, lente: 20 }, TELA, ponto)!;

    expect(Math.abs(fechada.x - CENTRO.x)).toBeGreaterThan(
      Math.abs(aberta.x - CENTRO.x),
    );
  });

  it("a rolagem gira a imagem em volta do centro", () => {
    const base = tripeDaOrbital(camera({ inclinacao: 0 }), TELA);
    const ponto = { x: base.x + 50, y: base.y };
    const reto = projetarNoTripe(base, TELA, ponto)!;
    const virado = projetarNoTripe({ ...base, rolagem: 90 }, TELA, ponto)!;

    // Um quarto de volta: o que estava à direita do centro vai para baixo.
    expect(virado.x).toBeCloseTo(CENTRO.x, 6);
    expect(virado.y - CENTRO.y).toBeCloseTo(reto.x - CENTRO.x, 6);
  });
});

describe("misturarTripe", () => {
  const de = {
    x: 0,
    y: 0,
    altura: 100,
    giro: 350,
    inclinacao: 40,
    rolagem: 0,
    lente: 45,
  };
  const para = { ...de, x: 100, giro: 10, lente: 25 };

  it("começa num e termina no outro", () => {
    expect(misturarTripe(de, para, 0)).toEqual(de);
    expect(misturarTripe(de, para, 1).x).toBeCloseTo(100, 9);
    expect(misturarTripe(de, para, 1).giro).toBeCloseTo(10, 9);
  });

  it("o giro vai pelo caminho curto", () => {
    // De 350 a 10 passando por 0, e não por 180.
    expect(misturarTripe(de, para, 0.5).giro).toBeCloseTo(0, 9);
    expect(misturarTripe(de, para, 0.25).giro).toBeCloseTo(355, 9);
  });

  it("a lente anda junto", () => {
    expect(misturarTripe(de, para, 0.5).lente).toBeCloseTo(35, 9);
  });
});

describe("o tripé no mundo", () => {
  const tripe = {
    x: 600,
    y: 500,
    altura: 120,
    giro: 37,
    inclinacao: 63,
    rolagem: 12,
    lente: 45,
  };

  it("sair do olho e voltar devolve o mesmo ponto", () => {
    for (const [lado, cima, profundidade] of [
      [0, 0, 100],
      [40, -25, 300],
      [-80, 60, 50],
    ] as const) {
      const mundo = doOlhoAoMundo(tripe, lado, cima, profundidade);
      expect(profundidadeNoTripe(tripe, mundo, mundo.altura)).toBeCloseTo(
        profundidade,
        6,
      );
      const naTela = projetarNoTripe(tripe, TELA, mundo, mundo.altura)!;
      const focal = focalDaLente(TELA.altura, tripe.lente);
      expect(naTela.x - CENTRO.x).toBeCloseTo((lado * focal) / profundidade, 6);
      expect(naTela.y - CENTRO.y).toBeCloseTo((cima * focal) / profundidade, 6);
    }
  });

  it("a boca da pirâmide cai nos cantos da tela 16:9", () => {
    const tela = { largura: 1600, altura: 900, focal: focalDaLente(900, 45) };
    const cantos = bocaDoTripe(tripe, 200).map(
      (canto) => projetarNoTripe(tripe, tela, canto, canto.altura)!,
    );

    expect(cantos[0]!.x).toBeCloseTo(0, 4);
    expect(cantos[0]!.y).toBeCloseTo(0, 4);
    expect(cantos[2]!.x).toBeCloseTo(1600, 4);
    expect(cantos[2]!.y).toBeCloseTo(900, 4);
  });

  it("a pegada fica no chão, e some quando o tripé olha o céu", () => {
    const pegada = pegadaDoTripe({ ...tripe, inclinacao: 40 })!;
    expect(pegada).toHaveLength(4);
    for (const ponto of pegada) expect(ponto.altura).toBe(0);

    expect(pegadaDoTripe({ ...tripe, inclinacao: 89 })).toBeNull();
  });
});

