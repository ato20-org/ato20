import { describe, expect, it } from "vitest";

import { ALTURA_DA_PAREDE } from "@/lib/geometry/sombra";
import {
  amostrasDaArea,
  amostrasDaParede,
  apoioDoPe,
  caixaDaFace,
  caixaDaPeca,
  caixaDoTopo,
  empurraoDaVista,
  encaixeDoChao,
  facesDaParede,
  lateralNaVista,
  leandoDaCamera,
  tapa,
  volumeDasParedes,
  RELEVO_PADRAO,
  type VistaDoRelevo,
} from "@/lib/geometry/volume";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Parede,
  type Sol,
} from "@/types/scene";

const MURO: Parede = {
  id: "m",
  x: 400,
  y: 400,
  width: 300,
  height: 200,
  formato: "retangulo",
};

/** O maior `y` que aparece num caminho SVG. Serve para medir até onde subiu. */
function ateOndeSobe(caminho: string): number {
  const numeros = [...caminho.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)];
  return Math.min(...numeros.map((achado) => Number(achado[2])));
}

describe("empurraoDaVista", () => {
  it("aponta para onde o giro manda", () => {
    const paraBaixo = empurraoDaVista(100, { giro: 90, inclinacao: 1 });
    expect(paraBaixo.x).toBeCloseTo(0, 1);
    expect(paraBaixo.y).toBeCloseTo(100, 1);

    const paraCima = empurraoDaVista(100, { giro: 270, inclinacao: 1 });
    expect(paraCima.y).toBeCloseTo(-100, 1);
  });

  it("a inclinação encurta o empurrão, e zero o anula", () => {
    expect(empurraoDaVista(100, { giro: 0, inclinacao: 0.5 }).x).toBeCloseTo(50, 1);
    expect(empurraoDaVista(100, { giro: 0, inclinacao: 0 }).x).toBe(0);
  });
});

describe("volumeDasParedes", () => {
  it("sem inclinação não há volume nenhum", () => {
    expect(volumeDasParedes([MURO], { giro: 270, inclinacao: 0 })).toEqual([]);
  });

  it("sem parede não há volume nenhum", () => {
    expect(volumeDasParedes([], RELEVO_PADRAO)).toEqual([]);
  });

  it("uma parede sobe pela própria altura vezes a inclinação", () => {
    const vista: VistaDoRelevo = { giro: 270, inclinacao: 1 };
    const [faixa] = volumeDasParedes([MURO], vista);

    expect(faixa).toBeDefined();
    expect(faixa!.empurrao.y).toBeCloseTo(-ALTURA_DA_PAREDE, 1);
    // O topo do muro está em y=400; a face sobe uma altura acima disso.
    expect(ateOndeSobe(faixa!.faces)).toBeCloseTo(400 - ALTURA_DA_PAREDE, 1);
  });

  it("uma torre sobe mais que um muro, na mesma vista", () => {
    const torre: Parede = { ...MURO, id: "t", altura: ALTURA_DA_PAREDE * 3 };
    const vista: VistaDoRelevo = { giro: 270, inclinacao: 1 };

    const [doMuro] = volumeDasParedes([MURO], vista);
    const [daTorre] = volumeDasParedes([torre], vista);

    expect(ateOndeSobe(daTorre!.faces)).toBeLessThan(ateOndeSobe(doMuro!.faces));
  });

  it("alturas diferentes viram faixas diferentes; iguais compartilham a faixa", () => {
    const outro: Parede = { ...MURO, id: "o", x: 900 };
    const alta: Parede = { ...MURO, id: "a", x: 1200, altura: 300 };

    expect(volumeDasParedes([MURO, outro], RELEVO_PADRAO)).toHaveLength(1);
    expect(volumeDasParedes([MURO, outro, alta], RELEVO_PADRAO)).toHaveLength(2);
  });

  it("o topo sai no chão, sem o empurrão: quem o aplica é a tela", () => {
    const [faixa] = volumeDasParedes([MURO], { giro: 270, inclinacao: 1 });

    // O corpo do muro começa em y=400 e vai até 600. Se o empurrão tivesse
    // sido aplicado aqui, o menor y seria 400 - ALTURA_DA_PAREDE.
    expect(ateOndeSobe(faixa!.topos)).toBeCloseTo(400, 1);
  });

  it("só os lados virados para a vista viram face", () => {
    // Um retângulo tem quatro lados; visto de um ângulo reto, dois aparecem.
    const [faixa] = volumeDasParedes([MURO], { giro: 270, inclinacao: 1 });
    const quadrilateros = (faixa!.faces.match(/M/g) ?? []).length;

    expect(quadrilateros).toBe(1);
  });

  it("a linha mostra os dois lados, porque não tem dentro", () => {
    const linha: Parede = { ...MURO, id: "l", formato: "linha" };
    const [faixa] = volumeDasParedes([linha], { giro: 270, inclinacao: 1 });

    expect((faixa!.faces.match(/M/g) ?? []).length).toBe(1);
  });

  it("gira o volume sem mexer no chão: o topo não muda de lugar", () => {
    const a = volumeDasParedes([MURO], { giro: 0, inclinacao: 0.5 });
    const b = volumeDasParedes([MURO], { giro: 180, inclinacao: 0.5 });

    expect(a[0]!.topos).toBe(b[0]!.topos);
    expect(a[0]!.empurrao.x).toBeCloseTo(-b[0]!.empurrao.x, 1);
  });
});

describe("leandoDaCamera", () => {
  it("a parede tomba um quarto de volta para longe de quem olha", () => {
    expect(leandoDaCamera(0)).toBe(270);
    expect(leandoDaCamera(90)).toBe(0);
    expect(leandoDaCamera(180)).toBe(90);
    expect(leandoDaCamera(270)).toBe(180);
  });
});

describe("encaixeDoChao", () => {
  it("chão de prumo não encolhe nem desloca nada", () => {
    const { escala, dx, dy } = encaixeDoChao(0, 0, 2600);
    expect(escala).toBe(1);
    expect(dx).toBeCloseTo(0, 1);
    expect(dy).toBeCloseTo(0, 1);
  });

  it("nunca amplia: deitado sem perspectiva o plano só encurta", () => {
    expect(encaixeDoChao(50, 0, 0).escala).toBe(1);
  });

  it("deitado com perspectiva, encolhe para caber no plano", () => {
    // A 52° com o olho a 2600, a borda de perto amplia ~20% e o plano passa de
    // 1920 para ~2296 de largura: sem encaixe isso é transbordo, que é a
    // armadilha do `debug-do-palco` §3.
    const { escala } = encaixeDoChao(52, 0, 2600);
    expect(escala).toBeLessThan(1);
    expect(escala).toBeCloseTo(1920 / 2296, 1);
  });

  it("o olho mais perto abre mais a perspectiva e encolhe mais", () => {
    expect(encaixeDoChao(52, 0, 1200).escala).toBeLessThan(
      encaixeDoChao(52, 0, 5000).escala,
    );
  });

  it("um quarto de volta põe o plano em pé, e a altura passa a mandar", () => {
    const { escala } = encaixeDoChao(0, 90, 0);
    expect(escala).toBeCloseTo(SCENE_HEIGHT / SCENE_WIDTH, 2);
  });

  it("o encaixe centra o que sobrou", () => {
    // Deitada, a cena projetada nasce descentrada: a borda de perto cresce
    // mais do que a de longe encolhe.
    const { dy } = encaixeDoChao(52, 0, 2600);
    expect(Math.abs(dy)).toBeGreaterThan(0);
  });
});

describe("facesDaParede", () => {
  /** O sol a 0° joga a sombra para leste, então a luz vem do OESTE. */
  const DO_OESTE: Sol = { angulo: 0, comprimento: 0.4, forca: 0.4 };

  it("o lado que encara a luz sai mais claro que o que lhe dá as costas", () => {
    const faces = facesDaParede(MURO, DO_OESTE);

    // Num retângulo de 300x200 em (400,400): o lado esquerdo olha para oeste, o
    // direito para leste. A luz vem do oeste.
    const esquerdo = faces.find((f) => f.x1 === 400 && f.x2 === 400);
    const direito = faces.find((f) => f.x1 === 700 && f.x2 === 700);

    expect(esquerdo).toBeDefined();
    expect(direito).toBeDefined();
    expect(esquerdo!.brilho).toBeGreaterThan(direito!.brilho);
  });

  it("nenhuma face apaga de todo: o piso segura o preto", () => {
    for (const face of facesDaParede(MURO, DO_OESTE)) {
      expect(face.brilho).toBeGreaterThan(0);
      expect(face.brilho).toBeLessThanOrEqual(1);
    }
  });

  it("a linha não tem lado de fora, e os dois lados dela pesam igual", () => {
    const linha: Parede = { ...MURO, formato: "linha" };

    // Invertendo a luz em 180° o resultado tem de ser o mesmo: sem dentro, o
    // que se sabe é só o quanto a face está de través.
    const daqui = facesDaParede(linha, DO_OESTE);
    const de_la = facesDaParede(linha, { ...DO_OESTE, angulo: 180 });

    expect(daqui).toHaveLength(1);
    expect(daqui[0]!.brilho).toBeCloseTo(de_la[0]!.brilho, 5);
  });

  describe("a linha em caixa", () => {
    // Uma reta de (100,100) a (300,100): a faixa de 22 vai de y = 89 a 111.
    const reta: Parede = {
      id: "r",
      x: 100,
      y: 100,
      width: 200,
      height: 0,
      formato: "linha",
    };
    /** Sombra para o sul: a luz vem do NORTE. */
    const DO_NORTE: Sol = { angulo: 90, comprimento: 0.4, forca: 0.4 };

    it("sobe das bordas da faixa, e não do meio do traço", () => {
      const faces = facesDaParede(reta, DO_NORTE, undefined, 22);

      expect(faces).toHaveLength(4);
      const ys = faces
        .filter((f) => f.y1 === f.y2)
        .map((f) => f.y1)
        .sort((a, b) => a - b);
      expect(ys).toEqual([89, 111]);
    });

    it("tem lado de fora: a face do norte acende e a do sul não", () => {
      const faces = facesDaParede(reta, DO_NORTE, undefined, 22);
      const norte = faces.find((f) => f.y1 === 89 && f.y2 === 89)!;
      const sul = faces.find((f) => f.y1 === 111 && f.y2 === 111)!;

      expect(norte.brilho).toBeGreaterThan(sul.brilho);
    });

    it("esconde as costas, como a parede fechada", () => {
      // Olhando de sudeste: a face do sul e a ponta do leste, e só.
      expect(facesDaParede(reta, DO_NORTE, 45, 22)).toHaveLength(2);
    });
  });

  it("sem sol continua havendo relevo: a luz fixa não deixa tudo igual", () => {
    const brilhos = facesDaParede(MURO, null).map((face) => face.brilho);
    expect(new Set(brilhos).size).toBeGreaterThan(1);
  });

  it("o sentido dos vértices não decide quem pega luz", () => {
    // O laço com os mesmos quatro cantos ao contrário é a MESMA parede, e tem
    // de acender do mesmo lado. É o que a normalização por área garante.
    const horario: Parede = {
      ...MURO,
      formato: "poligono",
      pontos: [0, 0, 1, 0, 1, 1, 0, 1],
    };
    const antihorario: Parede = { ...horario, pontos: [0, 0, 0, 1, 1, 1, 1, 0] };

    const claroDe = (parede: Parede) =>
      Math.max(...facesDaParede(parede, DO_OESTE).map((f) => f.brilho));

    expect(claroDe(horario)).toBeCloseTo(claroDe(antihorario), 5);
  });
});

describe("apoioDoPe", () => {
  it("o pé dentro da parede coberta pisa no teto dela", () => {
    expect(apoioDoPe([MURO], { x: 550, y: 500 })).toEqual({
      paredeId: "m",
      altura: ALTURA_DA_PAREDE,
    });
  });

  it("fora de parede, e no miolo do pátio, é chão", () => {
    expect(apoioDoPe([MURO], { x: 100, y: 100 })).toBeNull();
    expect(apoioDoPe([{ ...MURO, semTeto: true }], { x: 550, y: 500 })).toBeNull();
  });

  it("entre duas, a mais alta: quem está sob a torre está na torre", () => {
    const torre: Parede = { ...MURO, id: "t", altura: ALTURA_DA_PAREDE * 2 };

    expect(apoioDoPe([MURO, torre], { x: 550, y: 500 })?.paredeId).toBe("t");
    expect(apoioDoPe([torre, MURO], { x: 550, y: 500 })?.paredeId).toBe("t");
  });

  it("na faixa da linha também: ela sobe maciça", () => {
    const reta: Parede = {
      id: "r",
      x: 100,
      y: 100,
      width: 200,
      height: 0,
      formato: "linha",
    };

    expect(apoioDoPe([reta], { x: 200, y: 105 })?.paredeId).toBe("r");
    expect(apoioDoPe([reta], { x: 200, y: 130 })).toBeNull();
  });
});

describe("amostrasDaArea", () => {
  it("cobre o miolo, e não só a borda", () => {
    const pontos = amostrasDaArea(MURO);

    expect(pontos.length).toBeGreaterThan(100);
    expect(
      pontos.some((p) => Math.abs(p.x - 550) < 20 && Math.abs(p.y - 500) < 20),
    ).toBe(true);
  });

  it("fica dentro do formato: a elipse não leva os cantos da caixa", () => {
    const elipse: Parede = { ...MURO, formato: "elipse" };

    for (const ponto of amostrasDaArea(elipse)) {
      const nx = (ponto.x - 550) / 150;
      const ny = (ponto.y - 500) / 100;
      expect(nx * nx + ny * ny).toBeLessThanOrEqual(1.05);
    }
  });
});

describe("amostrasDaParede", () => {
  it("as amostras caem DENTRO da caixa da parede, e não no chão ao lado", () => {
    for (const ponto of amostrasDaParede(MURO)) {
      expect(ponto.x).toBeGreaterThanOrEqual(400);
      expect(ponto.x).toBeLessThanOrEqual(700);
      expect(ponto.y).toBeGreaterThanOrEqual(400);
      expect(ponto.y).toBeLessThanOrEqual(600);
    }
  });

  it("o recuo é para dentro nos quatro lados", () => {
    const pontos = amostrasDaParede(MURO);
    // Recuadas, nenhuma encosta na borda: é isso que impede a amostra de ler o
    // corredor do lado de fora.
    expect(pontos.every((p) => p.x > 400 && p.x < 700)).toBe(true);
    expect(pontos.every((p) => p.y > 400 && p.y < 600)).toBe(true);
  });

  it("a linha amostra em cima do próprio traço, sem recuo", () => {
    const linha: Parede = { ...MURO, formato: "linha" };
    const pontos = amostrasDaParede(linha);

    expect(pontos.length).toBeGreaterThan(0);
    // A diagonal principal de (400,400) a (700,600): todo ponto dela obedece a
    // mesma razão entre os dois avanços.
    for (const ponto of pontos) {
      expect((ponto.x - 400) / 300).toBeCloseTo((ponto.y - 400) / 200, 5);
    }
  });

  it("um muro comprido não vira trezentas leituras", () => {
    const comprido: Parede = { ...MURO, width: 5000, height: 5000 };
    expect(amostrasDaParede(comprido).length).toBeLessThanOrEqual(64);
  });

  it("parede sem tamanho não pede amostra nenhuma", () => {
    expect(amostrasDaParede({ ...MURO, width: 0, height: 0 })).toHaveLength(0);
  });
});

describe("tapa", () => {
  // Olhando de `giro: 0`: a profundidade é o próprio `y`, e quem tem `y` maior
  // está mais perto de quem olha.
  const GIRO = 0;
  const INCLINACAO = 52;

  /** Um muro atravessado na frente, de 600 a 900 em x, na linha y = 700. */
  const MURO_NA_FRENTE = { x1: 600, y1: 700, x2: 900, y2: 700 };

  it("o topo da casa na frente tapa a peça logo atrás dela", () => {
    // Uma casa de 600 a 900 em x e 660 a 760 em y; a peça atrás, em y = 640.
    const casa: Parede = {
      id: "casa",
      x: 600,
      y: 660,
      width: 300,
      height: 100,
      formato: "retangulo",
    };
    const peca = caixaDaPeca(750, 640, 96, 96, GIRO, INCLINACAO);
    const topo = caixaDoTopo(casa, ALTURA_DA_PAREDE, GIRO, INCLINACAO, 710)!;

    expect(tapa(topo, peca)).toBe(true);
  });

  it("o topo da casa atrás não tapa a peça na frente", () => {
    const casa: Parede = {
      id: "casa",
      x: 600,
      y: 400,
      width: 300,
      height: 100,
      formato: "retangulo",
    };
    const peca = caixaDaPeca(750, 640, 96, 96, GIRO, INCLINACAO);
    const topo = caixaDoTopo(casa, ALTURA_DA_PAREDE, GIRO, INCLINACAO, 450)!;

    expect(tapa(topo, peca)).toBe(false);
  });

  it("a face na frente tapa a peça que está atrás dela", () => {
    const face = caixaDaFace(MURO_NA_FRENTE, ALTURA_DA_PAREDE, GIRO, INCLINACAO);
    const peca = caixaDaPeca(750, 640, 96, 96, GIRO, INCLINACAO);

    expect(tapa(face, peca)).toBe(true);
  });

  it("a peça na frente do muro não é tapada por ele", () => {
    const face = caixaDaFace(MURO_NA_FRENTE, ALTURA_DA_PAREDE, GIRO, INCLINACAO);
    // Mais perto de quem olha: `y` maior.
    const peca = caixaDaPeca(750, 820, 96, 96, GIRO, INCLINACAO);

    expect(tapa(face, peca)).toBe(false);
  });

  it("a peça ao lado do muro não é tapada, por mais atrás que esteja", () => {
    const face = caixaDaFace(MURO_NA_FRENTE, ALTURA_DA_PAREDE, GIRO, INCLINACAO);
    // Bem à esquerda do trecho de muro, que vai de 600 a 900.
    const peca = caixaDaPeca(200, 300, 96, 96, GIRO, INCLINACAO);

    expect(tapa(face, peca)).toBe(false);
  });

  it("o empate de profundidade não tapa: quem está no muro está à vista", () => {
    const face = caixaDaFace(MURO_NA_FRENTE, ALTURA_DA_PAREDE, GIRO, INCLINACAO);
    const peca = caixaDaPeca(750, 700, 96, 96, GIRO, INCLINACAO);

    expect(tapa(face, peca)).toBe(false);
  });

  it("com o chão de prumo a parede não sobe, e deixa de tapar", () => {
    // A `inclinacao` zero é o mapa chapado: a face tem altura zero na tela, e
    // é assim que o modo some sem nenhum caso especial.
    const face = caixaDaFace(MURO_NA_FRENTE, ALTURA_DA_PAREDE, GIRO, 0);
    const peca = caixaDaPeca(750, 640, 96, 96, GIRO, 0);

    expect(tapa(face, peca)).toBe(false);
  });

  it("girar a câmera troca quem está atrás de quem", () => {
    const muro = { x1: 700, y1: 400, x2: 700, y2: 800 };
    const peca = { x: 600, y: 600 };

    const de = (giro: number) =>
      tapa(
        caixaDaFace(muro, ALTURA_DA_PAREDE, giro, INCLINACAO),
        caixaDaPeca(peca.x, peca.y, 96, 96, giro, INCLINACAO),
      );

    // De um lado do muro a peça fica atrás dele; do outro, na frente.
    expect(de(90)).toBe(true);
    expect(de(270)).toBe(false);
  });
});

describe("lateralNaVista", () => {
  it("sem giro, é o próprio x", () => {
    expect(lateralNaVista(300, 900, 0)).toBeCloseTo(300, 5);
  });

  it("a um quarto de volta, o que atravessa a tela é o y", () => {
    expect(lateralNaVista(0, 400, 90)).toBeCloseTo(-400, 5);
  });
});

describe("amostrasDaParede, com a cor escolhida pelo mestre", () => {
  it("continua respondendo onde amostrar: quem decide ignorar é quem chama", () => {
    // A geometria não sabe de `Parede.cor` e não deve saber -- ela responde
    // "onde eu leria o mapa", e o hook é que decide não perguntar. Misturar as
    // duas aqui faria a conta mudar de resposta por causa de um campo de
    // aparência.
    const pintada: Parede = { ...MURO, cor: "#ff0000" };
    expect(amostrasDaParede(pintada)).toEqual(amostrasDaParede(MURO));
  });
});
