import { describe, expect, it } from "vitest";

import type { Portrait, UniaoDeRetratos } from "@/types/scene";

import {
  ajustarUniao,
  desfazerUniao,
  juntarNaUniao,
  moverNaUniao,
  normalizarUnioes,
  tirarDaUniao,
  uniaoDaFilaAntiga,
  uniaoDoRetrato,
  unirRetratos,
} from "./unioes";

/** Um retrato qualquer, no canto de baixo à esquerda. */
function retrato(id: string, x = 0.05, y = 0.6): Portrait {
  return {
    id,
    personagemId: id,
    assetId: `asset-${id}`,
    x,
    y,
    width: 0.2,
    height: 0.34,
    visible: true,
  };
}

/** Uma união pronta, para as funções que só mexem na lista. */
function uniao(id: string, retratos: string[]): UniaoDeRetratos {
  return {
    id,
    nome: `União ${id}`,
    cor: "#ef4444",
    ancora: "baixo-centro",
    folga: 0.015,
    retratos,
  };
}

describe("unirRetratos", () => {
  it("cria a união na área mais perto de onde os retratos estão", () => {
    const heroi = retrato("a", 0.05, 0.6);
    const outro = retrato("b", 0.2, 0.6);

    const [nova] = unirRetratos([], ["a", "b"], [heroi, outro]);

    expect(nova.ancora).toBe("baixo-esquerda");
    expect(nova.retratos).toEqual(["a", "b"]);
  });

  it("tira os membros da união anterior, e descarta a que esvaziou", () => {
    const antes = [uniao("u1", ["a", "b"]), uniao("u2", ["c"])];

    const depois = unirRetratos(antes, ["b", "c"], [retrato("b"), retrato("c")]);

    // `u2` tinha só o `c`: some. `u1` fica com `a` sozinho.
    expect(depois.map((atual) => atual.id)).toEqual(["u1", depois[1].id]);
    expect(depois[0].retratos).toEqual(["a"]);
    expect(depois[1].retratos).toEqual(["b", "c"]);
  });

  it("a ordem dos ids vira a ordem da fila", () => {
    const [nova] = unirRetratos(
      [],
      ["c", "a", "b"],
      [retrato("a"), retrato("b"), retrato("c")],
    );

    expect(nova.retratos).toEqual(["c", "a", "b"]);
  });

  it("dá nome e cor diferentes dos que já estão em uso", () => {
    const antes = unirRetratos([], ["a"], [retrato("a")]);
    const depois = unirRetratos(antes, ["b"], [retrato("b")]);

    expect(depois[1].nome).not.toBe(depois[0].nome);
    expect(depois[1].cor).not.toBe(depois[0].cor);
  });

  it("união de um retrato só é válida", () => {
    const so = unirRetratos([], ["a"], [retrato("a")]);

    expect(so).toHaveLength(1);
    expect(so[0].retratos).toEqual(["a"]);
  });
});

describe("juntarNaUniao", () => {
  it("acrescenta no fim sem mexer na área nem no nome", () => {
    const antes = [{ ...uniao("u1", ["a"]), ancora: "cima-direita" as const }];

    const [depois] = juntarNaUniao(antes, "u1", ["b"]);

    expect(depois.retratos).toEqual(["a", "b"]);
    expect(depois.ancora).toBe("cima-direita");
  });

  it("um membro que já era da união não aparece duas vezes", () => {
    const [depois] = juntarNaUniao([uniao("u1", ["a", "b"])], "u1", ["a"]);

    expect(depois.retratos).toEqual(["b", "a"]);
  });
});

describe("tirarDaUniao e desfazerUniao", () => {
  it("tirar o último membro descarta a união", () => {
    expect(tirarDaUniao([uniao("u1", ["a"])], "a")).toEqual([]);
  });

  it("desfazer some com a união e deixa as outras", () => {
    const depois = desfazerUniao([uniao("u1", ["a"]), uniao("u2", ["b"])], "u1");

    expect(depois.map((atual) => atual.id)).toEqual(["u2"]);
  });
});

describe("moverNaUniao", () => {
  it("mover para baixo desconta a própria saída", () => {
    // [a,b,c,d] com `a` largado depois de `c` -- a linha de queda marca 3.
    const [depois] = moverNaUniao(
      [uniao("u1", ["a", "b", "c", "d"])],
      "a",
      "u1",
      3,
    );

    expect(depois.retratos).toEqual(["b", "c", "a", "d"]);
  });

  it("mover para cima usa o índice como veio", () => {
    const [depois] = moverNaUniao(
      [uniao("u1", ["a", "b", "c"])],
      "c",
      "u1",
      1,
    );

    expect(depois.retratos).toEqual(["a", "c", "b"]);
  });

  it("leva um solto para dentro de uma união", () => {
    const [depois] = moverNaUniao([uniao("u1", ["a", "b"])], "z", "u1", 1);

    expect(depois.retratos).toEqual(["a", "z", "b"]);
  });

  it("índice além do fim cai no fim", () => {
    const [depois] = moverNaUniao([uniao("u1", ["a", "b"])], "z", "u1", 99);

    expect(depois.retratos).toEqual(["a", "b", "z"]);
  });
});

describe("ajustarUniao", () => {
  it("prende a folga ao intervalo permitido", () => {
    const [depois] = ajustarUniao([uniao("u1", ["a"])], "u1", { folga: 5 });

    expect(depois.folga).toBeLessThanOrEqual(0.06);
  });

  it("troca só a união pedida", () => {
    const depois = ajustarUniao([uniao("u1", ["a"]), uniao("u2", ["b"])], "u2", {
      nome: "Inimigos",
    });

    expect(depois[0].nome).toBe("União u1");
    expect(depois[1].nome).toBe("Inimigos");
  });
});

describe("normalizarUnioes", () => {
  it("descarta membro que não é retrato conhecido", () => {
    const depois = normalizarUnioes([uniao("u1", ["a", "fantasma"])], ["a"]);

    expect(depois[0].retratos).toEqual(["a"]);
  });

  it("um retrato em duas uniões fica na primeira", () => {
    const depois = normalizarUnioes(
      [uniao("u1", ["a", "b"]), uniao("u2", ["b", "c"])],
      ["a", "b", "c"],
    );

    expect(depois[0].retratos).toEqual(["a", "b"]);
    expect(depois[1].retratos).toEqual(["c"]);
  });

  it("união que esvaziou na limpeza some", () => {
    expect(normalizarUnioes([uniao("u1", ["sumido"])], ["a"])).toEqual([]);
  });

  it("âncora inválida vira o padrão", () => {
    const depois = normalizarUnioes(
      [{ ...uniao("u1", ["a"]), ancora: "meio-do-nada" }],
      ["a"],
    );

    expect(depois[0].ancora).toBe("baixo-centro");
  });

  it("lixo no lugar da lista devolve vazio", () => {
    expect(normalizarUnioes("uma string qualquer")).toEqual([]);
    expect(normalizarUnioes(null)).toEqual([]);
  });

  it("sem lista de conhecidos, mantém os membros", () => {
    const depois = normalizarUnioes([uniao("u1", ["a", "b"])]);

    expect(depois[0].retratos).toEqual(["a", "b"]);
  });
});

describe("uniaoDaFilaAntiga", () => {
  it("a fila ligada vira uma união com todos, menos os que estavam soltos", () => {
    const [migrada] = uniaoDaFilaAntiga(
      [retrato("a"), retrato("b"), retrato("c")],
      ["c"],
      "cima-esquerda",
      0.02,
    );

    expect(migrada.retratos).toEqual(["a", "b"]);
    expect(migrada.ancora).toBe("cima-esquerda");
    expect(migrada.folga).toBeCloseTo(0.02);
  });

  it("todos soltos não produz união nenhuma", () => {
    expect(
      uniaoDaFilaAntiga([retrato("a")], ["a"], "baixo-centro", 0.015),
    ).toEqual([]);
  });
});

describe("uniaoDoRetrato", () => {
  it("acha a união do membro, e devolve nulo para o solto", () => {
    const lista = [uniao("u1", ["a"]), uniao("u2", ["b"])];

    expect(uniaoDoRetrato(lista, "b")?.id).toBe("u2");
    expect(uniaoDoRetrato(lista, "z")).toBeNull();
  });
});
