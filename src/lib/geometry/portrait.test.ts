import { describe, expect, it } from "vitest";

import type { Medidor } from "@/types/character";
import type { Portrait, UniaoDeRetratos } from "@/types/scene";

import {
  areaMaisProxima,
  filasDeUnioes,
  FOLGA_ENTRE_LINHAS,
  caixaDaComposicao,
  pecaNoRecorte,
  LARGURA_DOS_MEDIDORES,
  larguraDaColuna,
  larguraNaFila,
  retratosDaCena,
} from "./portrait";

/** A proporção do plano, que converte altura de retrato em largura de coluna. */
const PLANE_ASPECT = 1080 / 1920;

/** A coluna de um retrato do helper acima: 0.3 de altura. */
const COLUNA = 0.3 * LARGURA_DOS_MEDIDORES * PLANE_ASPECT;

function medidor(id: string, escondido = false): Medidor {
  return {
    id,
    nome: "Vida",
    cor: "#ef4444",
    estilo: "barra",
    atual: 7,
    maximo: 10,
    escondido,
  };
}

/** Retrato em fração da câmera: um terço da largura, um terço da altura. */
function retrato(id: string, extra: Partial<Portrait> = {}): Portrait {
  return {
    id,
    personagemId: id,
    assetId: `asset-${id}`,
    x: 0,
    y: 0,
    width: 0.2,
    height: 0.3,
    visible: true,
    ...extra,
  };
}

function uniao(
  id: string,
  retratos: string[],
  extra: Partial<UniaoDeRetratos> = {},
): UniaoDeRetratos {
  return {
    id,
    nome: id,
    cor: "#ef4444",
    ancora: "baixo-centro",
    folga: 0.015,
    retratos,
    ...extra,
  };
}

describe("filasDeUnioes", () => {
  it("duas uniões na mesma área empilham, a segunda atrás da primeira", () => {
    const posicoes = filasDeUnioes(
      [uniao("u1", ["a"]), uniao("u2", ["b"])],
      [retrato("a"), retrato("b")],
    );

    const primeira = posicoes.find((posicao) => posicao.id === "a");
    const segunda = posicoes.find((posicao) => posicao.id === "b");

    // Área de baixo: a segunda fica MAIS ALTA na tela, ou seja, `y` menor.
    expect(segunda!.y).toBeLessThan(primeira!.y);
    expect(primeira!.y - segunda!.y).toBeCloseTo(0.3 + FOLGA_ENTRE_LINHAS);
  });

  it("nas áreas de cima a pilha cresce para baixo", () => {
    const posicoes = filasDeUnioes(
      [
        uniao("u1", ["a"], { ancora: "cima-centro" }),
        uniao("u2", ["b"], { ancora: "cima-centro" }),
      ],
      [retrato("a"), retrato("b")],
    );

    const primeira = posicoes.find((posicao) => posicao.id === "a");
    const segunda = posicoes.find((posicao) => posicao.id === "b");

    expect(segunda!.y).toBeGreaterThan(primeira!.y);
  });

  it("uniões em áreas diferentes não empilham", () => {
    const posicoes = filasDeUnioes(
      [
        uniao("u1", ["a"], { ancora: "baixo-esquerda" }),
        uniao("u2", ["b"], { ancora: "baixo-direita" }),
      ],
      [retrato("a"), retrato("b")],
    );

    const [primeira, segunda] = posicoes;

    expect(primeira.y).toBeCloseTo(segunda.y);
    expect(primeira.x).toBeLessThan(segunda.x);
  });

  it("quem está fora do ar não ocupa vaga na linha", () => {
    const posicoes = filasDeUnioes(
      [uniao("u1", ["a", "b", "c"])],
      [retrato("a"), retrato("b", { visible: false }), retrato("c")],
    );

    expect(posicoes.map((posicao) => posicao.id)).toEqual(["a", "c"]);
  });

  it("união inteira apagada não ocupa altura na pilha", () => {
    const comApagada = filasDeUnioes(
      [uniao("u1", ["a"]), uniao("u2", ["b"])],
      [retrato("a", { visible: false }), retrato("b")],
    );
    const sozinha = filasDeUnioes([uniao("u2", ["b"])], [retrato("b")]);

    expect(comApagada).toEqual(sozinha);
  });

  it("a altura da linha é a do maior membro", () => {
    const posicoes = filasDeUnioes(
      [uniao("u1", ["a", "b"]), uniao("u2", ["c"])],
      [
        retrato("a", { height: 0.2 }),
        retrato("b", { height: 0.5 }),
        retrato("c"),
      ],
    );

    const primeira = posicoes.find((posicao) => posicao.id === "a");
    const segunda = posicoes.find((posicao) => posicao.id === "c");

    // As duas linhas alinham pela BASE, e a segunda se afasta 0,5 -- a altura
    // do chefe --, e não 0,2, que é a do capanga ao lado dele.
    const baseDaPrimeira = primeira!.y + 0.2;
    const baseDaSegunda = segunda!.y + 0.3;

    expect(baseDaPrimeira - baseDaSegunda).toBeCloseTo(0.5 + FOLGA_ENTRE_LINHAS);
  });

  it("a ordem da união é a ordem da fila", () => {
    const daDireita = filasDeUnioes([uniao("u1", ["b", "a"])], [
      retrato("a"),
      retrato("b"),
    ]);

    const primeiro = daDireita.find((posicao) => posicao.id === "b");
    const segundo = daDireita.find((posicao) => posicao.id === "a");

    expect(primeiro!.x).toBeLessThan(segundo!.x);
  });

  it("membro que não é retrato nenhum é ignorado", () => {
    const posicoes = filasDeUnioes([uniao("u1", ["a", "sumido"])], [retrato("a")]);

    expect(posicoes.map((posicao) => posicao.id)).toEqual(["a"]);
  });

  it("retrato solto não recebe posição", () => {
    const posicoes = filasDeUnioes([uniao("u1", ["a"])], [retrato("a"), retrato("z")]);

    expect(posicoes.map((posicao) => posicao.id)).toEqual(["a"]);
  });
});

describe("larguraNaFila", () => {
  it("sem medidor é a largura da figura, e nada mais", () => {
    expect(larguraNaFila(retrato("a"))).toBeCloseTo(0.2);
  });

  it("com medidor soma a coluna, medida pela ALTURA do retrato", () => {
    const com = retrato("a", { medidores: [medidor("m1")] });

    expect(larguraNaFila(com)).toBeCloseTo(0.2 + COLUNA);
  });

  it("a coluna não cresce com o número de medidores", () => {
    // Eles empilham para BAIXO. É o que faz a fila do Mestre e a da mesa
    // concordarem na única conta que ela usa -- ver `MedidoresDoRetrato`.
    const um = retrato("a", { medidores: [medidor("m1")] });
    const tres = retrato("a", {
      medidores: [medidor("m1"), medidor("m2"), medidor("m3")],
    });

    expect(larguraNaFila(tres)).toBeCloseTo(larguraNaFila(um));
  });

  it("dois retratos de mesma altura pedem a mesma coluna, larguras diferentes", () => {
    // Retrato deitado e retrato em pé: a fila alinha ROSTOS, então a coluna
    // sai da altura. Medida pela largura, a panorâmica teria uma coluna três
    // vezes maior para escrever as mesmas duas palavras.
    const empe = retrato("a", { width: 0.1, medidores: [medidor("m1")] });
    const deitado = retrato("b", { width: 0.5, medidores: [medidor("m1")] });

    expect(larguraNaFila(deitado) - deitado.width).toBeCloseTo(
      larguraNaFila(empe) - empe.width,
    );
  });
});

describe("a fila reserva lugar para a coluna", () => {
  it("o vizinho começa depois do retrato MAIS a coluna", () => {
    const posicoes = filasDeUnioes(
      [uniao("u1", ["a", "b"])],
      [retrato("a", { medidores: [medidor("m1")] }), retrato("b")],
    );

    const a = posicoes.find((posicao) => posicao.id === "a")!;
    const b = posicoes.find((posicao) => posicao.id === "b")!;

    expect(b.x - a.x).toBeCloseTo(0.2 + COLUNA + 0.015);
  });

  it("sem medidor a fila é a de antes, encostada pela folga", () => {
    const posicoes = filasDeUnioes(
      [uniao("u1", ["a", "b"])],
      [retrato("a"), retrato("b")],
    );

    const a = posicoes.find((posicao) => posicao.id === "a")!;
    const b = posicoes.find((posicao) => posicao.id === "b")!;

    expect(b.x - a.x).toBeCloseTo(0.2 + 0.015);
  });

  it("medidor escondido conta para quem o recebeu na lista", () => {
    // O palco do Mestre pede a lista inteira, a mesa recebe filtrada -- então
    // um personagem só de medidor escondido reserva coluna lá e não aqui. A
    // divergência é um VÃO a mais na TV, nunca uma sobreposição.
    const soOculto = retrato("a", { medidores: [medidor("m1", true)] });

    expect(larguraNaFila(soOculto)).toBeCloseTo(0.2 + COLUNA);
    expect(larguraNaFila({ ...soOculto, medidores: [] })).toBeCloseTo(0.2);
  });
});

describe("pecaNoRecorte", () => {
  /**
   * Um retrato de 100 no meio de um recorte de 500, com 200 de cada lado.
   * A coluna pede 40. Tudo na mesma unidade -- é o que a função promete.
   */
  const folgado = {
    coluna: 40,
    largura: 100,
    folgaEsquerda: 200,
    folgaDireita: 200,
  };

  it("com espaço de sobra, fica onde pediu", () => {
    expect(pecaNoRecorte({ ...folgado, desejado: 105 })).toBe(105);
    expect(pecaNoRecorte({ ...folgado, desejado: -45 })).toBe(-45);
  });

  it("encostado na borda direita, a coluna para dentro do recorte", () => {
    // Só 10 sobram à direita, e a coluna pede 40: sem a trava ela terminaria
    // 30 além da borda -- e filho que passa da caixa de um plano é o que
    // derruba o palco no WebKitGTK.
    const apertado = { ...folgado, folgaDireita: 10, desejado: 105 };

    const left = pecaNoRecorte(apertado);

    expect(left + apertado.coluna).toBeLessThanOrEqual(
      apertado.largura + apertado.folgaDireita,
    );
  });

  it("encostado na borda esquerda, idem", () => {
    const apertado = {
      ...folgado,
      folgaEsquerda: 5,
      desejado: -45,
    };

    expect(pecaNoRecorte(apertado)).toBeGreaterThanOrEqual(
      -apertado.folgaEsquerda,
    );
  });

  it("retrato ocupando a câmera inteira não deixa a coluna escapar", () => {
    // O caso que o feed de dados aceita perder: não há lado bom. Aqui ela
    // encosta sobre a figura, que é o pior que pode acontecer DENTRO do plano.
    const cheio = {
      coluna: 40,
      largura: 500,
      folgaEsquerda: 0,
      folgaDireita: 0,
    };

    for (const desejado of [-45, 505]) {
      const left = pecaNoRecorte({ ...cheio, desejado });

      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + cheio.coluna).toBeLessThanOrEqual(cheio.largura);
    }
  });

  it("coluna maior que o recorte encosta na esquerda em vez de espalhar NaN", () => {
    const impossivel = {
      coluna: 900,
      largura: 100,
      folgaEsquerda: 20,
      folgaDireita: 20,
      desejado: 105,
    };

    expect(pecaNoRecorte(impossivel)).toBe(-20);
  });
});

describe("larguraDaColuna", () => {
  it("é a mesma conta que a fila usa para reservar o lugar", () => {
    const com = retrato("a", { medidores: [medidor("m1")] });

    expect(larguraNaFila(com) - com.width).toBeCloseTo(
      larguraDaColuna(com.height),
    );
  });
});

describe("caixaDaComposicao", () => {
  it("sem medidor, a composição é a figura", () => {
    expect(caixaDaComposicao(retrato("a"))).toEqual({
      recuo: 0,
      largura: 0.2,
    });
  });

  it("medidor no automático reserva à direita", () => {
    const com = retrato("a", { medidores: [medidor("m1")] });

    expect(caixaDaComposicao(com)).toEqual({
      recuo: 0,
      largura: 0.2 + COLUNA,
    });
  });

  it("medidores desligados não reservam nada", () => {
    const com = retrato("a", {
      medidores: [medidor("m1")],
      layout: { medidores: false },
    });

    expect(caixaDaComposicao(com).largura).toBeCloseTo(0.2);
  });

  it("peça jogada para a esquerda vira RECUO, não largura à toa", () => {
    // `x: -0.5` põe a coluna meia figura antes da borda esquerda dela. A fila
    // precisa saber disso, senão a barra sai por baixo do vizinho.
    const com = retrato("a", {
      medidores: [medidor("m1")],
      layout: { lugarDosMedidores: { x: -0.5, y: 0 } },
    });

    const caixa = caixaDaComposicao(com);

    expect(caixa.recuo).toBeCloseTo(0.1);
    expect(caixa.largura).toBeCloseTo(0.1 + 0.2);
  });

  it("dados no automático não reservam largura", () => {
    // Embaixo eles não disputam largura com ninguém, e reservar deixaria um vão
    // permanente ao lado de todo retrato da mesa -- inclusive sem dado nenhum.
    const com = retrato("a", { layout: { lugarDosDados: undefined } });

    expect(caixaDaComposicao(com).largura).toBeCloseTo(0.2);
  });

  it("dados com lugar escolhido reservam", () => {
    const com = retrato("a", {
      layout: { lugarDosDados: { x: 1.1, y: 0 } },
    });

    // 1,1 de início mais 0,65 de fileira, tudo em larguras de figura.
    expect(caixaDaComposicao(com).largura).toBeCloseTo(0.2 * (1.1 + 0.65));
  });
});

describe("a fila anda pela caixa, e a figura fica dentro dela", () => {
  it("peça à esquerda empurra a figura para a direita", () => {
    const esquerdo = retrato("a", {
      medidores: [medidor("m1")],
      layout: { lugarDosMedidores: { x: -0.5, y: 0 } },
    });

    const posicoes = filasDeUnioes(
      [uniao("u1", ["a", "b"], { ancora: "baixo-esquerda" })],
      [esquerdo, retrato("b")],
    );

    const a = posicoes.find((posicao) => posicao.id === "a")!;

    // A caixa começa na margem; a figura começa um recuo depois dela.
    expect(a.x).toBeCloseTo(0.03 + 0.1);
  });

  it("o vizinho começa depois da caixa inteira, não da figura", () => {
    const esquerdo = retrato("a", {
      medidores: [medidor("m1")],
      layout: { lugarDosMedidores: { x: -0.5, y: 0 } },
    });

    const posicoes = filasDeUnioes(
      [uniao("u1", ["a", "b"], { ancora: "baixo-esquerda" })],
      [esquerdo, retrato("b")],
    );

    const b = posicoes.find((posicao) => posicao.id === "b")!;

    // Margem + caixa de `a` (0,3) + folga.
    expect(b.x).toBeCloseTo(0.03 + 0.3 + 0.015);
  });
});

describe("retratosDaCena resolve o layout", () => {
  const itens = [{ personagemId: "a" }];
  const fichas = [{ id: "a", retrato: "asset-a" }];

  it("sem padrão nem próprio, mostra tudo", () => {
    const [saida] = retratosDaCena([retrato("a")], itens, fichas);

    expect(saida?.layout).toEqual({
      retrato: true,
      medidores: true,
      dados: true,
      escalaMedidores: 1,
      escalaDados: 1,
    });
  });

  it("o próprio vence o padrão, campo a campo", () => {
    const guardado = retrato("a", { layout: { retrato: false } });

    const [saida] = retratosDaCena([guardado], itens, fichas, [], false, {
      retrato: true,
      medidores: false,
      dados: true,
      escalaMedidores: 1,
      escalaDados: 1,
    });

    // `retrato` veio do registro, `medidores` da sessão, `dados` de nenhum dos
    // dois -- é o `LAYOUT_PADRAO` por baixo.
    expect(saida?.layout).toEqual({
      retrato: false,
      medidores: false,
      dados: true,
      escalaMedidores: 1,
      escalaDados: 1,
    });
  });

  it("o que sai é completo, mesmo com o registro sem layout nenhum", () => {
    // A TV não sabe que existe padrão de sessão: ela lê o campo e desenha.
    const [saida] = retratosDaCena([retrato("a")], itens, fichas, [], false, {
      retrato: false,
      medidores: true,
      dados: false,
      escalaMedidores: 1,
      escalaDados: 1,
    });

    expect(saida?.layout).toEqual({
      retrato: false,
      medidores: true,
      dados: false,
      escalaMedidores: 1,
      escalaDados: 1,
    });
  });
});

describe("areaMaisProxima", () => {
  it("canto de baixo à esquerda", () => {
    expect(areaMaisProxima([retrato("a", { x: 0.02, y: 0.62 })])).toBe(
      "baixo-esquerda",
    );
  });

  it("canto de cima à direita", () => {
    expect(areaMaisProxima([retrato("a", { x: 0.75, y: 0.03 })])).toBe(
      "cima-direita",
    );
  });

  it("mede pelo centro da caixa que envolve os dois", () => {
    // Um bem à esquerda e outro bem à direita: o meio é o centro.
    const area = areaMaisProxima([
      retrato("a", { x: 0.05, y: 0.6 }),
      retrato("b", { x: 0.75, y: 0.6 }),
    ]);

    expect(area).toBe("baixo-centro");
  });

  it("lista vazia devolve o padrão", () => {
    expect(areaMaisProxima([])).toBe("baixo-centro");
  });
});
