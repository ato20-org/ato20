import { describe, expect, it } from "vitest";

import { createScene } from "@/types/scene";

import {
  alvoEm,
  ancoraNaBorda,
  ancoraNoLado,
  ancorasDe,
  caixaDe,
  dependeDe,
  caminhoDaSeta,
  ligavelEm,
  naSeta,
  pontaEm,
  pontoNaSeta,
  semReferencia,
  setasDe,
  setasLivresPara,
  tracadoDe,
} from "./ligacoes";

function cenaComTudo() {
  const scene = createScene("Quadro", "quadro");
  scene.items = [
    {
      id: "img",
      assetId: "a",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      rotation: 0,
      z: 1,
      locked: false,
    },
  ];
  scene.postits = [
    { id: "post", x: 500, y: 500, largura: 260, altura: 180, texto: "", cor: "amarelo" },
  ];
  scene.textos = [{ id: "txt", x: 1000, y: 100, texto: "Título", tamanho: 40 }];
  scene.pins = [{ id: "pin", x: 1500, y: 800, title: "", note: "", attachments: [] }];
  scene.formas = [
    {
      id: "forma",
      tipo: "retangulo",
      x: 200,
      y: 600,
      width: 100,
      height: 100,
      rotation: 0,
      espessura: 6,
    },
  ];
  // Uma seta reta e horizontal, de ponta livre a ponta livre: as frações dela
  // saem em números redondos, e é nelas que a bifurcação encosta.
  scene.ligacoes = [{ id: "tronco", de: { x: 0, y: 0 }, para: { x: 100, y: 0 } }];
  return scene;
}

describe("ancoraNaBorda", () => {
  const caixa = { minX: 0, minY: 0, maxX: 200, maxY: 100 };

  it("sai pela borda direita quando o alvo está à direita", () => {
    expect(ancoraNaBorda(caixa, { x: 1000, y: 50 })).toEqual({ x: 200, y: 50 });
  });

  it("sai pela borda de baixo quando o alvo está abaixo", () => {
    expect(ancoraNaBorda(caixa, { x: 100, y: 1000 })).toEqual({ x: 100, y: 100 });
  });

  it("devolve o centro para caixa de tamanho zero, que é o alfinete", () => {
    const ponto = { minX: 5, minY: 5, maxX: 5, maxY: 5 };
    expect(ancoraNaBorda(ponto, { x: 100, y: 100 })).toEqual({ x: 5, y: 5 });
  });
});

describe("caixaDe", () => {
  it("acha cada tipo de ponta, e devolve null para quem sumiu", () => {
    const scene = cenaComTudo();
    expect(caixaDe(scene, { tipo: "item", id: "img" })).toEqual({
      minX: 100,
      minY: 100,
      maxX: 300,
      maxY: 200,
    });
    expect(caixaDe(scene, { tipo: "postit", id: "post" })?.maxX).toBe(760);
    expect(caixaDe(scene, { tipo: "texto", id: "txt" })?.minX).toBe(1000);
    expect(caixaDe(scene, { tipo: "pin", id: "pin" })).toEqual({
      minX: 1500,
      minY: 800,
      maxX: 1500,
      maxY: 800,
    });
    expect(caixaDe(scene, { tipo: "postit", id: "nada" })).toBeNull();
  });
});

describe("ligavelEm", () => {
  it("acha o que está sob o ponto, e nada no vazio", () => {
    const scene = cenaComTudo();
    expect(ligavelEm(scene, { x: 150, y: 150 })).toEqual({ tipo: "item", id: "img" });
    expect(ligavelEm(scene, { x: 600, y: 600 })).toEqual({ tipo: "postit", id: "post" });
    expect(ligavelEm(scene, { x: 1010, y: 110 })).toEqual({ tipo: "texto", id: "txt" });
    expect(ligavelEm(scene, { x: 1510, y: 810 })).toEqual({ tipo: "pin", id: "pin" });
    expect(ligavelEm(scene, { x: 10, y: 10 })).toBeNull();
  });

  it("o postit ganha da imagem por baixo dele", () => {
    const scene = cenaComTudo();
    scene.postits![0] = { ...scene.postits![0]!, x: 100, y: 100 };
    expect(ligavelEm(scene, { x: 150, y: 150 })?.tipo).toBe("postit");
  });
});

describe("semReferencia", () => {
  const ligacoes = [
    { id: "l1", de: { tipo: "postit" as const, id: "a" }, para: { tipo: "texto" as const, id: "b" } },
    { id: "l2", de: { tipo: "item" as const, id: "c" }, para: { tipo: "postit" as const, id: "a" } },
    { id: "l3", de: { tipo: "item" as const, id: "c" }, para: { tipo: "texto" as const, id: "b" } },
  ];

  it("derruba toda ligação com uma ponta apagada", () => {
    expect(semReferencia(ligacoes, ["a"])?.map((l) => l.id)).toEqual(["l3"]);
  });

  it("devolve undefined quando não sobra nenhuma", () => {
    expect(semReferencia(ligacoes, ["a", "b"])).toBeUndefined();
  });

  it("deixa a lista ausente em paz", () => {
    expect(semReferencia(undefined, ["a"])).toBeUndefined();
  });
});

describe("tracadoDe", () => {
  it("ponta livre fica onde está, e a ancorada encosta na borda virada para ela", () => {
    const scene = cenaComTudo();
    const pontas = tracadoDe(scene, { tipo: "item", id: "img" }, { x: 1000, y: 150 })!;
    // A imagem vai de 100 a 300 em x; a borda direita é 300, na altura do alvo.
    expect(pontas.a).toEqual({ x: 300, y: 150 });
    expect(pontas.b).toEqual({ x: 1000, y: 150 });
  });

  it("duas pontas livres é um risco: os dois pontos como estão", () => {
    const scene = cenaComTudo();
    const tracado = tracadoDe(scene, { x: 1, y: 2 }, { x: 3, y: 4 })!;
    expect(tracado.a).toEqual({ x: 1, y: 2 });
    expect(tracado.b).toEqual({ x: 3, y: 4 });
  });

  it("âncora que perdeu o alvo derruba a seta", () => {
    const scene = cenaComTudo();
    expect(tracadoDe(scene, { tipo: "postit", id: "nada" }, { x: 0, y: 0 })).toBeNull();
  });
});

describe("pontaEm", () => {
  it("ancora no que há sob o ponto, e fica livre no vazio", () => {
    const scene = cenaComTudo();
    expect(pontaEm(scene, { x: 150, y: 150 })).toEqual({ tipo: "item", id: "img" });
    expect(pontaEm(scene, { x: 10.4, y: 10.6 })).toEqual({ x: 10, y: 11 });
  });
});

describe("semReferencia com ponta livre", () => {
  it("ponta livre não morre com ninguém", () => {
    const ligacoes = [
      { id: "l1", de: { x: 0, y: 0 }, para: { tipo: "postit" as const, id: "a" } },
      { id: "l2", de: { x: 0, y: 0 }, para: { x: 5, y: 5 } },
    ];
    expect(semReferencia(ligacoes, ["a"])?.map((l) => l.id)).toEqual(["l2"]);
  });
});

describe("ancoraNoLado", () => {
  const caixa = { minX: 0, minY: 0, maxX: 200, maxY: 100 };

  it("dá o meio de cada uma das quatro bordas", () => {
    expect(ancoraNoLado(caixa, "cima")).toEqual({ x: 100, y: 0 });
    expect(ancoraNoLado(caixa, "direita")).toEqual({ x: 200, y: 50 });
    expect(ancoraNoLado(caixa, "baixo")).toEqual({ x: 100, y: 100 });
    expect(ancoraNoLado(caixa, "esquerda")).toEqual({ x: 0, y: 50 });
  });
});

describe("pontasDe com lado escolhido", () => {
  it("o lado manda, mesmo com o alvo do outro lado da folha", () => {
    const scene = cenaComTudo();
    // A imagem vai de 100 a 300 em x e de 100 a 200 em y: o meio de cima é
    // (200, 100). O alvo está à direita e embaixo, e a seta sai por cima
    // assim mesmo -- é isso que o lado escolhido significa.
    const pontas = tracadoDe(
      scene,
      { tipo: "item", id: "img", lado: "cima" },
      { x: 1000, y: 150 },
    )!;
    expect(pontas.a).toEqual({ x: 200, y: 100 });
    expect(pontas.b).toEqual({ x: 1000, y: 150 });
  });

  it("a outra ponta mira o ponto escolhido, e não o centro da caixa", () => {
    const scene = cenaComTudo();
    const pontas = tracadoDe(
      scene,
      { tipo: "item", id: "img", lado: "cima" },
      { tipo: "postit", id: "post" },
    )!;
    expect(pontas.a).toEqual({ x: 200, y: 100 });
    // Sai pela borda de CIMA do postit, virada para (200, 100).
    expect(pontas.b.y).toBe(500);
    expect(pontas.b.x).toBeCloseTo(551.02, 1);
  });
});

describe("a forma como âncora", () => {
  it("tem caixa, e responde ao clique dentro dela", () => {
    const scene = cenaComTudo();
    expect(caixaDe(scene, { tipo: "forma", id: "forma" })).toEqual({
      minX: 200,
      minY: 600,
      maxX: 300,
      maxY: 700,
    });
    expect(ligavelEm(scene, { x: 250, y: 650 })).toEqual({
      tipo: "forma",
      id: "forma",
    });
  });
});

describe("bifurcação", () => {
  it("a ponta presa numa seta vira o ponto daquela fração dela", () => {
    const scene = cenaComTudo();
    // Perto de um quarto, e não exatamente: `t` é o parâmetro da cúbica, e
    // não o comprimento percorrido. Ver `FRACOES_DA_SETA`.
    const quarto = caixaDe(scene, { tipo: "ligacao", id: "tronco", t: 0.25 })!;
    expect(quarto.minX).toBeCloseTo(25, 0);
    expect(quarto.minY).toBe(0);
    // Sem fração é o meio, e o meio é exato: a cúbica é simétrica.
    expect(caixaDe(scene, { tipo: "ligacao", id: "tronco" })?.minX).toBe(50);
  });

  it("a seta bifurcada encosta na mãe e some com ela", () => {
    const scene = cenaComTudo();
    scene.ligacoes = [
      ...scene.ligacoes!,
      {
        id: "galho",
        de: { tipo: "ligacao", id: "tronco", t: 0.25 },
        para: { x: 25, y: 200 },
      },
    ];

    const galho = setasDe(scene).find(({ ligacao }) => ligacao.id === "galho")!;
    expect(galho.a.y).toBe(0);
    expect(galho.a.x).toBeCloseTo(25, 0);
    expect(galho.b).toEqual({ x: 25, y: 200 });

    // Como `removeLigacao` faz: tira a mãe da lista e deixa a queda correr.
    expect(
      semReferencia(
        scene.ligacoes!.filter(({ id }) => id !== "tronco"),
        ["tronco"],
      ),
    ).toBeUndefined();
  });

  it("a queda se propaga: o galho do galho cai junto", () => {
    const ligacoes = [
      { id: "tronco", de: { tipo: "postit" as const, id: "a" }, para: { x: 0, y: 0 } },
      { id: "galho", de: { tipo: "ligacao" as const, id: "tronco" }, para: { x: 1, y: 1 } },
      { id: "neto", de: { tipo: "ligacao" as const, id: "galho" }, para: { x: 2, y: 2 } },
      { id: "solta", de: { x: 3, y: 3 }, para: { x: 4, y: 4 } },
    ];
    expect(semReferencia(ligacoes, ["a"])?.map((l) => l.id)).toEqual(["solta"]);
  });

  it("uma seta não pode se pendurar em quem já depende dela", () => {
    const scene = cenaComTudo();
    scene.ligacoes = [
      ...scene.ligacoes!,
      {
        id: "galho",
        de: { tipo: "ligacao", id: "tronco" },
        para: { x: 0, y: 200 },
      },
    ];

    expect(dependeDe(scene, "tronco", { tipo: "ligacao", id: "galho" })).toBe(true);
    expect(dependeDe(scene, "galho", { tipo: "ligacao", id: "tronco" })).toBe(false);
    // E é isso que a lista de candidatas do arrasto de alça usa.
    expect(
      setasLivresPara(scene, "tronco", setasDe(scene)).map(
        ({ ligacao }) => ligacao.id,
      ),
    ).toEqual([]);
    expect(
      setasLivresPara(scene, "galho", setasDe(scene)).map(
        ({ ligacao }) => ligacao.id,
      ),
    ).toEqual(["tronco"]);
  });

  it("um ciclo escrito à mão não derruba o quadro: as setas só não desenham", () => {
    const scene = cenaComTudo();
    scene.ligacoes = [
      { id: "a", de: { tipo: "ligacao", id: "b" }, para: { x: 0, y: 0 } },
      { id: "b", de: { tipo: "ligacao", id: "a" }, para: { x: 1, y: 1 } },
    ];
    expect(setasDe(scene)).toEqual([]);
  });
});

describe("ancorasDe", () => {
  it("quatro pontos numa caixa, um só no alfinete, três na seta", () => {
    const scene = cenaComTudo();

    const daImagem = ancorasDe(scene, { tipo: "item", id: "img" });
    expect(daImagem.map(({ ponta }) => ponta.lado)).toEqual([
      "cima",
      "direita",
      "baixo",
      "esquerda",
    ]);
    expect(daImagem[0]!.ponto).toEqual({ x: 200, y: 100 });

    // Caixa sem tamanho: quatro pontos empilhados seriam quatro alvos para o
    // mesmo clique.
    const doPin = ancorasDe(scene, { tipo: "pin", id: "pin" });
    expect(doPin).toEqual([
      { ponta: { tipo: "pin", id: "pin" }, ponto: { x: 1500, y: 800 } },
    ]);

    expect(
      ancorasDe(scene, { tipo: "ligacao", id: "tronco" }).map(({ ponto }) =>
        Math.round(ponto.x),
      ),
    ).toEqual([25, 50, 75]);
  });
});

describe("alvoEm", () => {
  it("prende no ponto de encaixe, inclusive vindo de fora da borda", () => {
    const scene = cenaComTudo();

    expect(alvoEm(scene, { x: 205, y: 105 }, 20)?.presa?.ponta).toEqual({
      tipo: "item",
      id: "img",
      lado: "cima",
    });
    // Dez unidades ACIMA da borda de cima: o ponto vive na borda, e é de fora
    // que se chega nele.
    expect(alvoEm(scene, { x: 200, y: 90 }, 20)?.presa?.ponta).toEqual({
      tipo: "item",
      id: "img",
      lado: "cima",
    });
  });

  it("no meio do corpo não prende ponto nenhum, mas ancora na coisa", () => {
    const scene = cenaComTudo();
    const alvo = alvoEm(scene, { x: 250, y: 150 }, 20)!;
    expect(alvo.presa).toBeNull();
    expect(alvo.ref).toEqual({ tipo: "item", id: "img" });
    expect(alvo.ancoras).toHaveLength(4);
  });

  it("acha a seta, que é fina e passa por cima de tudo", () => {
    const scene = cenaComTudo();
    const alvo = alvoEm(scene, { x: 50, y: 4 }, 20)!;
    expect(alvo.ref.tipo).toBe("ligacao");
    expect(alvo.presa?.ponta).toEqual({ tipo: "ligacao", id: "tronco", t: 0.5 });
  });

  it("no vazio não há alvo, e a ponta nasce livre", () => {
    const scene = cenaComTudo();
    expect(alvoEm(scene, { x: 900, y: 900 }, 20)).toBeNull();
    expect(pontaEm(scene, { x: 900.4, y: 900.6 }, 20)).toEqual({ x: 900, y: 901 });
  });
});

describe("a curva da seta", () => {
  it("sai perpendicular à borda que cruzou", () => {
    const scene = cenaComTudo();
    // A imagem vai de 100 a 300 em x e de 100 a 200 em y, centro (200, 150).
    // O alvo está bem abaixo e à direita: a reta até ele cruza a borda de
    // BAIXO, e é de lá que a curva sai -- para baixo, e não na diagonal.
    const tracado = tracadoDe(scene, { tipo: "item", id: "img" }, { x: 1000, y: 800 })!;
    expect(tracado.a.y).toBe(200);
    expect(tracado.c1.x).toBeCloseTo(tracado.a.x, 6);
    expect(tracado.c1.y).toBeGreaterThan(tracado.a.y);

    // E por isso o meio da seta NÃO cai na reta entre as duas pontas.
    expect(desvioDoMeio(tracado)).toBeGreaterThan(1);
  });

  it("duas que se encaram de frente continuam retas", () => {
    const scene = cenaComTudo();
    // Sai pela borda da direita, direto para um ponto na mesma altura: a
    // perpendicular da borda já é a direção do caminho.
    const tracado = tracadoDe(scene, { tipo: "item", id: "img" }, { x: 1000, y: 150 })!;
    expect(tracado.a).toEqual({ x: 300, y: 150 });
    expect(desvioDoMeio(tracado)).toBeCloseTo(0, 6);
    expect(pontoNaSeta(tracado, 0.5)).toEqual({ x: 650, y: 150 });
  });

  it("a dobra desloca o meio exatamente o que promete", () => {
    const scene = cenaComTudo();
    // Duas pontas livres, vão de 100: sem lado nenhum, a curva de fábrica é
    // uma reta, e a dobra é tudo o que move o meio.
    const reta = tracadoDe(scene, { x: 0, y: 0 }, { x: 100, y: 0 })!;
    expect(pontoNaSeta(reta, 0.5)).toEqual({ x: 50, y: 0 });

    const dobrada = tracadoDe(scene, { x: 0, y: 0 }, { x: 100, y: 0 }, { curva: 0.25 })!;
    const meio = pontoNaSeta(dobrada, 0.5);
    // 0,25 do vão de 100, perpendicular: é isto que faz a alça do meio seguir
    // o cursor sem escorregar.
    expect(meio.x).toBeCloseTo(50, 6);
    expect(meio.y).toBeCloseTo(25, 6);

    // E dobrar para o outro lado é o sinal trocado, no mesmo tanto.
    const avessa = tracadoDe(scene, { x: 0, y: 0 }, { x: 100, y: 0 }, { curva: -0.25 })!;
    expect(pontoNaSeta(avessa, 0.5).y).toBeCloseTo(-25, 6);
  });

  it("a dobra entra na cena, e a bifurcação encosta na curva", () => {
    const scene = cenaComTudo();
    scene.ligacoes = [
      { id: "tronco", de: { x: 0, y: 0 }, para: { x: 100, y: 0 }, curva: 0.25 },
    ];
    // O ponto do meio da mãe é o meio da CURVA, não o da reta.
    expect(caixaDe(scene, { tipo: "ligacao", id: "tronco" })?.minY).toBeCloseTo(25, 6);
    expect(
      ancorasDe(scene, { tipo: "ligacao", id: "tronco" }).map(({ ponto }) =>
        Math.round(ponto.y),
      ),
    ).toEqual([19, 25, 19]);
  });

  it("a medida acompanha a curva, e não a corda", () => {
    const scene = cenaComTudo();
    const dobrada = tracadoDe(scene, { x: 0, y: 0 }, { x: 100, y: 0 }, { curva: 0.25 })!;
    // Em cima da corda, no meio: longe da seta, que subiu 25.
    expect(naSeta(dobrada, { x: 50, y: 0 }).distancia).toBeCloseTo(25, 0);
    // Em cima da curva: colada nela, e na metade dela.
    const emCima = naSeta(dobrada, { x: 50, y: 25 });
    expect(emCima.distancia).toBeLessThan(0.5);
    expect(emCima.t).toBeCloseTo(0.5, 1);
  });

  it("o caminho é uma cúbica, e vem arredondado", () => {
    const scene = cenaComTudo();
    const tracado = tracadoDe(scene, { x: 0, y: 0 }, { x: 100, y: 0 })!;
    expect(caminhoDaSeta(tracado)).toMatch(/^M 0 0 C [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ 100 0$/);
  });
});

/** Quanto o meio da curva saiu da reta que liga as duas pontas. */
function desvioDoMeio(tracado: {
  a: { x: number; y: number };
  b: { x: number; y: number };
  c1: { x: number; y: number };
  c2: { x: number; y: number };
}): number {
  const meio = pontoNaSeta(tracado, 0.5);
  const vao = Math.hypot(tracado.b.x - tracado.a.x, tracado.b.y - tracado.a.y);
  const normal = {
    x: -(tracado.b.y - tracado.a.y) / vao,
    y: (tracado.b.x - tracado.a.x) / vao,
  };
  const daPonta = { x: meio.x - tracado.a.x, y: meio.y - tracado.a.y };
  return Math.abs(daPonta.x * normal.x + daPonta.y * normal.y);
}
