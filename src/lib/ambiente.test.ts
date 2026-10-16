import { describe, expect, it } from "vitest";

import {
  AMBIENTE_DO_MESTRE,
  ambienteDaCena,
  ambientesDosPlugins,
  ambientesProntos,
  COR_DO_AMBIENTE,
  direcaoDoSentido,
  EFEITOS_DE_AMBIENTE,
  planoDaCamada,
  sentidoDaDirecao,
} from "@/lib/ambiente";
import { EFEITOS_PARA_A_FIGURA, especieDoEfeito } from "@/lib/efeitos";
import type { DefinicaoDeEfeito } from "@/types/efeito";

const TELA = { largura: 1920, altura: 1080 };

function chuva(extra: Partial<NonNullable<DefinicaoDeEfeito["ambiente"]>> = {}): DefinicaoDeEfeito {
  return {
    id: "campanha/chuva",
    titulo: "Chuva",
    origem: { acervo: true },
    ambiente: {
      cor: "#a9c1db",
      camadas: [
        { imagem: "fabrica:chuva/chuva-longe-512.webp", escala: 0.3, opacidade: 0.5 },
        { imagem: "fabrica:chuva/chuva-perto-512.webp", escala: 0.7, opacidade: 0.8 },
      ],
      veu: { opacidade: 0.2 },
      relampago: { intervalo: 10, forca: 0.5 },
      ...extra,
    },
  };
}

function deFora(efeito: DefinicaoDeEfeito) {
  return { [efeito.id]: efeito };
}

describe("espécie", () => {
  it("o ambiente vence as outras, mesmo com área e disparo", () => {
    expect(especieDoEfeito({ ambiente: { camadas: [] }, area: { cor: "#fff" } })).toBe("ambiente");
    expect(especieDoEfeito({ ambiente: { camadas: [] }, disparo: { forma: "linha" } })).toBe("ambiente");
  });

  it("os seis de fábrica são ambientes, e nenhum vai ao seletor da condição", () => {
    expect(EFEITOS_DE_AMBIENTE.map((efeito) => efeito.id).sort()).toEqual([
      "brasas",
      "chuva",
      "cinzas",
      "neblina",
      "neve",
      "tempestade",
    ]);
    expect(EFEITOS_PARA_A_FIGURA.some((efeito) => especieDoEfeito(efeito) === "ambiente")).toBe(false);
  });

  it("todo ambiente de fábrica resolve com as camadas que declara", () => {
    for (const pronto of EFEITOS_DE_AMBIENTE) {
      const resolvido = ambienteDaCena({ efeito: pronto.id });
      expect(resolvido, pronto.id).not.toBeNull();
      expect(resolvido!.camadas, pronto.id).toHaveLength(pronto.ambiente!.camadas.length);
    }
  });

  it("os prontos são os de fábrica e os dos plugins; o da campanha fica de fora", () => {
    const doPlugin = { ...chuva(), id: "ordem/chuva-de-sangue", origem: { plugin: "ordem", versao: "1" } };
    const fora = { ...deFora(doPlugin), ...deFora(chuva()) };

    expect(ambientesDosPlugins(fora).map((efeito) => efeito.id)).toEqual(["ordem/chuva-de-sangue"]);
    expect(ambientesProntos(fora)).toHaveLength(EFEITOS_DE_AMBIENTE.length + 1);
  });
});

describe("ambienteDaCena", () => {
  it("sem ambiente, efeito desconhecido ou efeito que não é de ambiente: nada", () => {
    expect(ambienteDaCena(undefined)).toBeNull();
    expect(ambienteDaCena({ efeito: "campanha/sumiu" })).toBeNull();
    expect(ambienteDaCena({ efeito: "chamas" })).toBeNull();
  });

  it("inteiro, com a cor do ambiente nas camadas que pedem", () => {
    const efeito = chuva({
      camadas: [{ imagem: "fabrica:chuva/chuva-longe-512.webp", cores: "condicao" }],
    });
    const resolvido = ambienteDaCena({ efeito: efeito.id }, deFora(efeito))!;

    expect(resolvido.camadas).toHaveLength(1);
    expect(resolvido.camadas[0]!.imagem.cores).toEqual({ cor: "#a9c1db" });
    expect(resolvido.camadas[0]!.escala).toBe(0.5);
    expect(resolvido.camadas[0]!.direcao).toBe(90);
    // Sem cor própria, o véu é da cor do ambiente.
    expect(resolvido.veu).toEqual({ cor: "#a9c1db", opacidade: 0.2 });
    expect(resolvido.relampago).toEqual({ intervalo: 10, cor: "#e0f2fe", forca: 0.5 });
    expect(resolvido.vento).toBe(0);
  });

  it("a intensidade corta as camadas da frente e esmaece o resto", () => {
    const efeito = chuva();
    const inteira = ambienteDaCena({ efeito: efeito.id }, deFora(efeito))!;
    const garoa = ambienteDaCena({ efeito: efeito.id, intensidade: 0.4 }, deFora(efeito))!;

    expect(inteira.camadas).toHaveLength(2);
    expect(garoa.camadas).toHaveLength(1);
    expect(garoa.camadas[0]!.escala).toBe(0.3);
    expect(garoa.camadas[0]!.opacidade).toBeCloseTo(0.5 * (0.4 + 0.6 * 0.4));
    expect(garoa.veu!.opacidade).toBeCloseTo(0.2 * 0.4);
    expect(garoa.relampago!.forca).toBeCloseTo(0.5 * 0.4);
  });

  it("o Mestre vê a metade de tudo", () => {
    const efeito = chuva();
    const mestre = ambienteDaCena({ efeito: efeito.id }, deFora(efeito), AMBIENTE_DO_MESTRE)!;

    expect(mestre.camadas[1]!.opacidade).toBeCloseTo(0.8 * AMBIENTE_DO_MESTRE);
    expect(mestre.veu!.opacidade).toBeCloseTo(0.2 * AMBIENTE_DO_MESTRE);
  });

  it("número podre é preso, e cor torta cai no padrão", () => {
    const efeito = chuva({
      cor: "azul",
      camadas: [
        {
          imagem: "fabrica:chuva/chuva-longe-512.webp",
          escala: 99,
          velocidade: -3,
          opacidade: Number.NaN,
          balanco: 7,
        },
      ],
      veu: { opacidade: 5 },
    });
    const resolvido = ambienteDaCena({ efeito: efeito.id, intensidade: 50, vento: -9 }, deFora(efeito))!;
    const [camada] = resolvido.camadas;

    expect(camada!.escala).toBe(2);
    expect(camada!.velocidade).toBe(0);
    expect(camada!.opacidade).toBe(1);
    expect(camada!.balanco).toBe(0.5);
    expect(resolvido.veu).toEqual({ cor: COR_DO_AMBIENTE, opacidade: 0.8 });
    expect(resolvido.vento).toBe(-1);
  });

  it("a camada sem imagem que se ache fica de fora, e só o véu já desenha", () => {
    const efeito = chuva({ camadas: [{ imagem: "" }], relampago: undefined });
    const resolvido = ambienteDaCena({ efeito: efeito.id }, deFora(efeito))!;

    expect(resolvido.camadas).toEqual([]);
    expect(resolvido.veu).toBeDefined();
    expect(ambienteDaCena({ efeito: efeito.id }, deFora({ ...efeito, ambiente: { camadas: [] } }))).toBeNull();
  });
});

describe("planoDaCamada", () => {
  const camada = { escala: 0.5, direcao: 90, velocidade: 1, balanco: 0 };

  it("a chuva reta: laço vertical de um ladrilho, a caixa cobre a tela e sobra um ladrilho em cima", () => {
    const plano = planoDaCamada(camada, TELA);

    expect(plano.lado).toBe(540);
    expect(plano.eixo).toBe("y");
    expect(plano.passo).toBe(540);
    expect(plano.inclinacao).toBe(0);
    expect(plano.duracao).toBeCloseTo(0.5);
    expect(plano.caixa.top).toBe(-540);
    expect(plano.caixa.height).toBe(1080 + 540);
    expect(plano.caixa.left).toBeLessThanOrEqual(0);
    expect(plano.caixa.left + plano.caixa.width).toBeGreaterThanOrEqual(1920);
    expect(plano.balanco).toBeNull();
  });

  it("subindo, o passo é para cima e a sobra fica embaixo", () => {
    const plano = planoDaCamada({ ...camada, direcao: 270 }, TELA);

    expect(plano.passo).toBe(-540);
    expect(plano.caixa.top).toBe(0);
    expect(plano.caixa.height).toBe(1080 + 540);
  });

  it("inclinada, o skew alarga a caixa para o lado que ele empurra", () => {
    // 100 graus desce puxando para a esquerda.
    const plano = planoDaCamada({ ...camada, direcao: 100 }, TELA);
    const tangente = Math.tan((plano.inclinacao * Math.PI) / 180);

    expect(plano.inclinacao).toBeCloseTo(-10);
    // Cada linha y da tela vem de x - y·tan; com tan negativo, a caixa vai além da direita.
    expect(plano.caixa.left).toBeLessThanOrEqual(0);
    expect(plano.caixa.left + plano.caixa.width).toBeGreaterThanOrEqual(1920 - 1080 * tangente);
  });

  it("o vento inclina o que cai, para o lado dele, e vira junto no que sobe", () => {
    expect(planoDaCamada(camada, TELA, 1).inclinacao).toBeCloseTo(25);
    expect(planoDaCamada(camada, TELA, -1).inclinacao).toBeCloseTo(-25);
    expect(planoDaCamada({ ...camada, direcao: 270 }, TELA, 1).inclinacao).toBeCloseTo(-25);
    // Nunca passa de 45: a caixa ficaria larga demais.
    expect(planoDaCamada({ ...camada, direcao: 135 }, TELA, -1).inclinacao).toBe(-45);
  });

  it("a neblina vai de lado, e o vento a empurra até virar de sentido", () => {
    const neblina = { escala: 1, direcao: 0, velocidade: 0.05, balanco: 0 };

    const parada = planoDaCamada(neblina, TELA);
    expect(parada.eixo).toBe("x");
    expect(parada.passo).toBe(1080);
    expect(parada.caixa.left).toBe(-1080);
    expect(parada.caixa.width).toBe(1920 + 1080);

    const contra = planoDaCamada(neblina, TELA, -1);
    expect(contra.passo).toBe(-1080);
    expect(contra.caixa.left).toBe(0);
    expect(contra.duracao).toBeCloseTo(1 / 0.15);
  });

  it("velocidade zero é camada parada", () => {
    expect(planoDaCamada({ ...camada, velocidade: 0 }, TELA).duracao).toBeNull();
  });

  it("o balanço é em ladrilhos, e a caixa cresce junto para nunca descobrir a borda", () => {
    const reta = planoDaCamada(camada, TELA);
    const balanca = planoDaCamada({ ...camada, balanco: 0.1 }, TELA);

    expect(balanca.balanco).toEqual({ amplitude: 54, periodo: 4.5 });
    expect(balanca.caixa.width - reta.caixa.width).toBe(2 * 54);
  });

  it("o ladrilho é inteiro: fração abre fresta na emenda", () => {
    expect(Number.isInteger(planoDaCamada({ ...camada, escala: 0.333 }, TELA).lado)).toBe(true);
  });
});

describe("a direção no editor", () => {
  it("ida e volta, nos quatro sentidos", () => {
    for (const sentido of ["baixo", "cima", "direita", "esquerda"] as const) {
      for (const inclinacao of [-30, 0, 15]) {
        expect(sentidoDaDirecao(direcaoDoSentido(sentido, inclinacao))).toEqual({ sentido, inclinacao });
      }
    }
  });

  it("cai um pouco para a direita é menos de 90 graus", () => {
    expect(direcaoDoSentido("baixo", 10)).toBe(80);
    expect(sentidoDaDirecao(100)).toEqual({ sentido: "baixo", inclinacao: -10 });
    expect(sentidoDaDirecao(-90)).toEqual({ sentido: "cima", inclinacao: 0 });
  });
});
