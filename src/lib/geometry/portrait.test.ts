import { describe, expect, it } from "vitest";

import type { Portrait, UniaoDeRetratos } from "@/types/scene";

import {
  areaMaisProxima,
  filasDeUnioes,
  FOLGA_ENTRE_LINHAS,
} from "./portrait";

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
