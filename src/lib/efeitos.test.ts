import { describe, expect, it } from "vitest";

import {
  camadasDaFigura,
  definicaoDoEfeito,
  EFEITOS_DE_FABRICA,
  efeitoValido,
  luzDosEfeitos,
  nivelDoExterno,
  copiaParaACampanha,
  particulasDosEfeitos,
  TAMANHO_DO_EXTERNO,
  urlDaImagemDaCampanha,
  tamanhoNoPlano,
} from "./efeitos";

describe("EFEITOS_DE_FABRICA", () => {
  it("são as pastas de src/efeitos, descobertas, em ordem de título", () => {
    // Em ordem de título: "Congelado", "Em chamas", "Envenenado", "Molhado",
    // "Sangrando".
    expect(EFEITOS_DE_FABRICA.map((efeito) => efeito.id)).toEqual([
      "congelado",
      "chamas",
      "envenenado",
      "molhado",
      "sangrando",
    ]);
    expect(definicaoDoEfeito("chamas")?.origem).toMatchObject({ app: "chamas" });
  });

  it("a partícula de imagem sai pintada na cor da condição, girando, com o sprite", () => {
    const deFora = {
      "x/simbolo": {
        id: "x/simbolo",
        titulo: "Símbolo",
        origem: { plugin: "x", versao: "1" },
        particulas: {
          quantidade: 6,
          imagem: "simbolo.webp",
          pintar: true,
          giro: 120,
          quadros: { colunas: 4, total: 8 },
        },
      },
    };
    const particulas = particulasDosEfeitos([{ efeito: "x/simbolo", cor: "#a855f7" }], deFora);

    expect(particulas).toMatchObject({
      imagem: "/plugin/x/simbolo.webp?v=1",
      pintar: true,
      cor: "#a855f7",
      giro: 120,
      quadros: { colunas: 4, total: 8 },
    });
  });

  it("os climas de antes saíram: a condição que os aponta fica só com o selo", () => {
    for (const id of ["aura", "tingido", "translucido", "tremendo", "apagado"]) {
      expect(definicaoDoEfeito(id)).toBeUndefined();
    }
  });

  it("tem ids únicos e com a forma que o Rust aceita", () => {
    const ids = EFEITOS_DE_FABRICA.map((efeito) => efeito.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(efeitoValido)).toBe(true);
  });
});

describe("efeitoValido", () => {
  it("aceita um slug ou dois, como `efeito_valido`", () => {
    expect(efeitoValido("aura")).toBe(true);
    expect(efeitoValido("ordem-paranormal/sangue")).toBe(true);

    expect(efeitoValido("")).toBe(false);
    expect(efeitoValido("Aura")).toBe(false);
    expect(efeitoValido("/aura")).toBe(false);
    expect(efeitoValido("a/b/c")).toBe(false);
    expect(efeitoValido(7)).toBe(false);
  });
});

describe("camadasDaFigura", () => {
  const climas = {
    "x/tingido": { id: "x/tingido", titulo: "Tingido", figura: { tinta: 0.5 } },
    "x/aura": { id: "x/aura", titulo: "Aura", figura: { halo: true } },
    "x/apagado": { id: "x/apagado", titulo: "Apagado", figura: { cinza: true } },
  };

  it("a tinta é na cor da condição, na força do efeito", () => {
    expect(camadasDaFigura([{ efeito: "x/tingido", cor: "#22c55e" }], climas)).toEqual({
      tinta: { cor: "#22c55e", forca: 0.5 },
      cinza: false,
      translucido: false,
      tremor: false,
    });
  });

  it("a primeira que pede uma camada fica com ela", () => {
    // Hoje chega um pedido só; isto é o que deixa voltar a compor.
    const camadas = camadasDaFigura(
      [
        { efeito: "x/aura", cor: "#f59e0b" },
        { efeito: "x/aura", cor: "#a855f7" },
        { efeito: "x/apagado", cor: "#ef4444" },
      ],
      climas,
    );

    expect(camadas.halo).toBe("#f59e0b");
    expect(camadas.cinza).toBe(true);
  });

  it("acha o efeito de plugin no que veio de fora", () => {
    const deFora = {
      "ordem/sangrando": { id: "ordem/sangrando", titulo: "Sangrando", figura: { tinta: 0.8, tremor: true } },
    };

    expect(camadasDaFigura([{ efeito: "ordem/sangrando", cor: "#ef4444" }], deFora)).toEqual({
      tinta: { cor: "#ef4444", forca: 0.8 },
      cinza: false,
      translucido: false,
      tremor: true,
    });
  });

  it("o que veio de fora não toma o lugar da fábrica, nem acha herança de objeto", () => {
    const deFora = { chamas: { id: "chamas", titulo: "Falsa", figura: { cinza: true } } };

    expect(definicaoDoEfeito("chamas", deFora)?.titulo).toBe("Em chamas");
    expect(definicaoDoEfeito("toString", {})).toBeUndefined();
  });

  it("id que o catálogo não conhece não ocupa camada", () => {
    expect(camadasDaFigura([{ efeito: "plugin/nada", cor: "#fff" }])).toEqual({
      cinza: false,
      translucido: false,
      tremor: false,
    });
  });
});

describe("camadasDaFigura com imagem", () => {
  const sangue = {
    "ordem/em-chamas": {
      id: "ordem/em-chamas",
      titulo: "Em chamas",
      origem: { plugin: "ordem", versao: "1.2.0" },
      externo: { imagem: "fx/fogo.webp", lado: "frente" as const, animacao: { tipo: "flutuar" as const } },
      interno: { textura: "fx/brasa.png", forca: 0.4 },
    },
  };

  it("resolve o externo e a textura com o endereço do daemon e os padrões", () => {
    // Fora do Tauri (a TV, o celular, o teste): o daemon serve em `/plugin`.
    const camadas = camadasDaFigura([{ efeito: "ordem/em-chamas", cor: "#f59e0b" }], sangue);

    expect(camadas.textura).toEqual({ url: "/plugin/ordem/fx/brasa.png?v=1.2.0", forca: 0.4 });
    expect(camadas.externo).toEqual({
      url: "/plugin/ordem/fx/fogo.webp?v=1.2.0",
      niveis: [],
      tamanho: TAMANHO_DO_EXTERNO,
      lado: "frente",
      ancora: "centro",
      opacidade: 1,
      animacao: { tipo: "flutuar", periodo: 2, intensidade: 0.5 },
    });
  });

  it("efeito com imagem e sem origem não desenha o externo", () => {
    // A fábrica não tem de onde puxar arquivo.
    const semOrigem = {
      "x/y": { id: "x/y", titulo: "Y", externo: { imagem: "fogo.png" } },
    };

    expect(camadasDaFigura([{ efeito: "x/y", cor: "#fff" }], semOrigem).externo).toBeUndefined();
  });
});

describe("tamanhoNoPlano", () => {
  const caixa = { x: 900, y: 500, width: 100, height: 100, rotation: 0 };

  it("no meio do mapa, o tamanho pedido inteiro", () => {
    expect(tamanhoNoPlano(caixa, 2, "centro")).toBe(2);
  });

  it("encostado na borda, encolhe até tocar nela", () => {
    // 40 até a borda esquerda: o externo centrado cresce 50 de cada lado com
    // o tamanho 2, e só cabe até 1 + 2*40/100.
    const naBorda = { ...caixa, x: 40 };

    expect(tamanhoNoPlano(naBorda, 2, "centro")).toBeCloseTo(1.8);
  });

  it("a âncora na base só cresce para cima", () => {
    // Encostado no chão do mapa: crescendo dos pés, não passa dele.
    const noChao = { ...caixa, y: 1080 - 100 };

    expect(tamanhoNoPlano(noChao, 2, "base")).toBe(2);
    expect(tamanhoNoPlano(noChao, 2, "centro")).toBe(1);
  });

  it("girado, a quina conta", () => {
    // A 45°, a quina do externo chega mais longe que o lado.
    const girado = { ...caixa, x: 60, rotation: 45 };

    expect(tamanhoNoPlano(girado, 2, "centro")).toBeLessThan(tamanhoNoPlano({ ...girado, rotation: 0 }, 2, "centro"));
  });

  it("item que já está fora do plano fica no tamanho dele", () => {
    expect(tamanhoNoPlano({ ...caixa, x: -30 }, 2, "centro")).toBe(1);
  });

  it("pedido menor que a figura não depende do plano", () => {
    expect(tamanhoNoPlano({ ...caixa, x: -30 }, 0.5, "centro")).toBe(0.5);
  });
});

describe("luzDosEfeitos", () => {
  it("as chamas de fábrica acendem um fogo na cor da condição", () => {
    expect(luzDosEfeitos([{ efeito: "chamas", cor: "#f59e0b" }])).toEqual({
      raio: 2.5,
      cor: "#f59e0b",
      intensidade: 0.85,
      efeito: "fogo",
    });
  });

  it("a cor da luz do pack vence a da condição, e o número torto é preso", () => {
    const deFora = {
      "ordem/tocha": {
        id: "ordem/tocha",
        titulo: "Tocha",
        luz: { raio: 99, cor: "#ABC", intensidade: 3, efeito: "explodindo" as never },
      },
    };

    expect(luzDosEfeitos([{ efeito: "ordem/tocha", cor: "#fff" }], deFora)).toEqual({
      raio: 10,
      cor: "#aabbcc",
      intensidade: 1,
    });
  });

  it("efeito sem luz não acende nada, e a mesma lista dá a mesma luz", () => {
    const pedidos = [{ efeito: "chamas", cor: "#f59e0b" }];

    expect(luzDosEfeitos([{ efeito: "tingido", cor: "#fff" }])).toBeUndefined();
    expect(luzDosEfeitos(pedidos)).toBe(luzDosEfeitos(pedidos));
  });
});

describe("o fogo de fábrica", () => {
  const externo = camadasDaFigura([{ efeito: "chamas", cor: "#3b82f6" }]).externo!;

  it("vem da pasta do app, com quadros, mipmaps, cores da condição, máscara e profundidade", () => {
    expect(externo.niveis.map((nivel) => nivel.lado)).toEqual([128, 256, 512]);
    expect(externo.niveis[0]!.url).toContain("chamas-128.webp");
    expect(externo.quadros).toEqual({ colunas: 4, total: 16, fps: 14 });
    // A cor da CONDIÇÃO: o mesmo fogo, azul.
    expect(externo.cores).toEqual({ cor: "#3b82f6" });
    expect(externo.mascara).toContain("mascara.webp");
    expect(externo.profundidade).toContain("profundidade.webp");
  });

  it("o mipmap é o menor que cobre o tamanho na tela, ou o maior", () => {
    expect(nivelDoExterno(externo, 60)).toContain("chamas-128");
    expect(nivelDoExterno(externo, 200)).toContain("chamas-256");
    expect(nivelDoExterno(externo, 300)).toContain("chamas-512");
    expect(nivelDoExterno(externo, 4000)).toContain("chamas-512");
  });

  it("grade torta vira imagem parada, e não meio quadro", () => {
    const torto = {
      "x/fumaca": {
        id: "x/fumaca",
        titulo: "Fumaça",
        origem: { plugin: "x", versao: "1" },
        externo: { imagem: "f.webp", quadros: { colunas: 3, total: 10, fps: 12 } },
      },
    };

    expect(camadasDaFigura([{ efeito: "x/fumaca", cor: "#fff" }], torto).externo!.quadros).toBeUndefined();
  });
});

describe("particulasDosEfeitos", () => {
  it("as fagulhas do fogo saem na cor da condição, com os padrões preenchidos", () => {
    const particulas = particulasDosEfeitos([{ efeito: "chamas", cor: "#3b82f6" }]);

    expect(particulas).toMatchObject({ quantidade: 10, cor: "#3b82f6", direcao: 270 });
    expect(particulas!.emissor.ancora).toBe("base");
    expect(particulas!.imagem).toBeUndefined();
  });

  it("efeito sem partícula, ou com quantidade torta, não solta nada", () => {
    const deFora = {
      "x/nada": { id: "x/nada", titulo: "Nada", particulas: { quantidade: 0 } },
    };

    expect(particulasDosEfeitos([{ efeito: "x/nada", cor: "#fff" }], deFora)).toBeUndefined();
  });
});

describe("os efeitos da campanha", () => {
  it("a imagem do acervo vira o endereço do daemon, relativo fora do Mestre", () => {
    const daCampanha = {
      "campanha/brasa": {
        id: "campanha/brasa",
        titulo: "Brasa",
        origem: { acervo: true as const },
        externo: { imagem: "a1b2c3d4-0000-4000-8000-000000000000" },
        particulas: { quantidade: 4, imagem: "../../etc/passwd" },
      },
    };

    expect(camadasDaFigura([{ efeito: "campanha/brasa", cor: "#fff" }], daCampanha).externo!.url).toBe(
      "/asset/a1b2c3d4-0000-4000-8000-000000000000",
    );
    // Id que não parece id de arquivo não vira caminho nenhum: o brilho redondo.
    expect(particulasDosEfeitos([{ efeito: "campanha/brasa", cor: "#fff" }], daCampanha)!.imagem).toBeUndefined();
  });
});

describe("a condição que configura o fogo de fábrica", () => {
  const copia = copiaParaACampanha(definicaoDoEfeito("chamas")!, "campanha/a1b2c3d4", "Em chamas");

  it("vira um efeito da campanha, com a arte apontando para o pack", () => {
    expect(copia.id).toBe("campanha/a1b2c3d4");
    expect(copia.origem).toBeUndefined();
    expect(copia.externo!.imagem).toBe("fabrica:chamas/chamas-512.webp");
    expect(copia.externo!.mipmaps!["128"]).toBe("fabrica:chamas/chamas-128.webp");
    expect(copia.externo!.mascara).toBe("fabrica:chamas/mascara.webp");
    // O que não é imagem fica como era.
    expect(copia.externo!.cores).toBe("condicao");
    expect(copia.luz).toEqual(definicaoDoEfeito("chamas")!.luz);
  });

  it("e desenha igual: a arte do pack resolve pelo endereço do build", () => {
    const daCampanha = { [copia.id]: { ...copia, origem: { acervo: true as const } } };
    const externo = camadasDaFigura([{ efeito: copia.id, cor: "#3b82f6" }], daCampanha).externo!;

    expect(externo.niveis.map((nivel) => nivel.lado)).toEqual([128, 256, 512]);
    expect(externo.niveis[0]!.url).toContain("chamas-128.webp");
    expect(externo.cores).toEqual({ cor: "#3b82f6" });
  });

  it("a referência de plugin e a torta", () => {
    expect(urlDaImagemDaCampanha("plugin:ordem@1.2.0/fx/fogo.webp")).toBe("/plugin/ordem/fx/fogo.webp?v=1.2.0");
    expect(urlDaImagemDaCampanha("fabrica:nao-existe/x.webp")).toBeNull();
    expect(urlDaImagemDaCampanha("plugin:../x")).toBeNull();
  });
});

describe("o congelado de fábrica", () => {
  const pedidos = [{ efeito: "congelado", cor: "#3b82f6" }];

  it("azula, trinca e treme a figura", () => {
    const camadas = camadasDaFigura(pedidos);

    expect(camadas.tinta).toEqual({ cor: "#3b82f6", forca: 0.35 });
    expect(camadas.tremor).toBe(true);
    expect(camadas.textura!.url).toContain("rachaduras.png");
    expect(camadas.textura!.forca).toBeCloseTo(0.85);
  });

  it("solta cristais: o sprite em laço, girando, na cor do gelo", () => {
    const particulas = particulasDosEfeitos(pedidos)!;

    expect(particulas.imagem).toContain("cristal.png");
    expect(particulas.quadros).toEqual({ colunas: 4, total: 4, fps: 8 });
    expect(particulas.pintar).toBe(false);
    expect(particulas.giro).toBe(60);
  });
});

describe("o envenenado de fábrica", () => {
  const pedidos = [{ efeito: "envenenado", cor: "#22c55e" }];

  it("enche a figura de verde e acende o halo, na cor da condição", () => {
    const camadas = camadasDaFigura(pedidos);

    expect(camadas.tinta).toEqual({ cor: "#22c55e", forca: 0.55 });
    expect(camadas.halo).toBe("#22c55e");
    expect(camadas.tremor).toBe(false);
  });

  it("a névoa sobe dos pés, atrás da figura: cinza na rampa da condição", () => {
    const externo = camadasDaFigura(pedidos).externo!;

    expect(externo.cores).toEqual({ cor: "#22c55e" });
    expect(externo.quadros).toEqual({ colunas: 4, total: 24, fps: 8 });
    expect(externo.niveis.map((nivel) => nivel.lado)).toEqual([128, 256]);
    expect(externo.ancora).toBe("base");
    // Sem profundidade, por medida: ela parte a névoa em duas camadas.
    expect(externo.profundidade).toBeUndefined();
    expect(externo.lado).toBe("atras");
  });

  it("solta caveirinhas: o sprite em laço, de pé, já verdes", () => {
    const particulas = particulasDosEfeitos(pedidos)!;

    expect(particulas.imagem).toContain("caveira.png");
    expect(particulas.quadros).toEqual({ colunas: 4, total: 4, fps: 6 });
    expect(particulas.pintar).toBe(false);
    expect(particulas.giro).toBe(0);
  });
});

describe("o sangrando de fábrica", () => {
  const pedidos = [{ efeito: "sangrando", cor: "#dc2626" }];

  it("avermelha de leve e abre os talhos por dentro da figura", () => {
    const camadas = camadasDaFigura(pedidos);

    expect(camadas.tinta).toEqual({ cor: "#dc2626", forca: 0.15 });
    expect(camadas.textura!.url).toContain("feridas.png");
    expect(camadas.textura!.forca).toBeCloseTo(0.9);
    expect(camadas.halo).toBeUndefined();
  });

  it("a poça aos pés é parada: uma imagem só, na rampa da condição", () => {
    const externo = camadasDaFigura(pedidos).externo!;

    expect(externo.quadros).toBeUndefined();
    expect(externo.animacao).toBeUndefined();
    expect(externo.cores).toEqual({ cor: "#dc2626" });
    expect(externo.lado).toBe("atras");
    expect(externo.niveis.map((nivel) => nivel.lado)).toEqual([128, 256, 512]);
  });

  it("as gotas caem, e o sprite toca uma vez ao longo da queda", () => {
    const particulas = particulasDosEfeitos(pedidos)!;

    expect(particulas.imagem).toContain("gota.png");
    expect(particulas.direcao).toBe(90);
    expect(particulas.quadros).toEqual({ colunas: 4, total: 4 });
    expect(particulas.pintar).toBe(false);
  });
});

describe("o molhado de fábrica", () => {
  const pedidos = [{ efeito: "molhado", cor: "#0ea5e9" }];

  it("azula a figura e prende gotas d'água na pele", () => {
    const camadas = camadasDaFigura(pedidos);

    expect(camadas.tinta).toEqual({ cor: "#0ea5e9", forca: 0.25 });
    expect(camadas.textura!.url).toContain("gotas.png");
    expect(camadas.textura!.forca).toBeCloseTo(0.9);
  });

  it("a poça aos pés é parada, por medida: uma imagem só, na rampa da condição", () => {
    const externo = camadasDaFigura(pedidos).externo!;

    expect(externo.quadros).toBeUndefined();
    expect(externo.cores).toEqual({ cor: "#0ea5e9" });
    expect(externo.lado).toBe("atras");
    expect(externo.niveis.map((nivel) => nivel.lado)).toEqual([128, 256, 512]);
  });

  it("os pingos caem, e o sprite toca uma vez ao longo da queda", () => {
    const particulas = particulasDosEfeitos(pedidos)!;

    expect(particulas.imagem).toContain("pingo.png");
    expect(particulas.direcao).toBe(90);
    expect(particulas.quadros).toEqual({ colunas: 4, total: 4 });
    expect(particulas.pintar).toBe(false);
  });
});
