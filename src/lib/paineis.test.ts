import { describe, expect, it } from "vitest";

import {
  abrir,
  abrirEm,
  ativar,
  chaveDoConteudo,
  fecharAba,
  fecharConteudo,
  lerPaineis,
  PAINEIS_PADRAO,
  podar,
  soltar,
  type ConteudoDoPainel,
  type Paineis,
  type PainelLateral,
} from "./paineis";

const nota = (id: string): ConteudoDoPainel => ({ tipo: "nota", notaId: id });
const livro = (id: string): ConteudoDoPainel => ({
  tipo: "livro",
  livroId: id,
  titulo: id.toUpperCase(),
});

/** O resumo legível da fileira: `mapa`, ou as chaves das abas de cada painel. */
function resumo(estado: Paineis): string[] {
  return estado.ordem.map((painel) =>
    painel.tipo === "mapa" ? "mapa" : painel.abas.map(chaveDoConteudo).join("+"),
  );
}

function lateral(estado: Paineis, indice: number): PainelLateral {
  const painel = estado.ordem[indice];
  if (!painel || painel.tipo !== "abas") throw new Error(`sem painel lateral em ${indice}`);
  return painel;
}

const soma = (estado: Paineis) =>
  estado.fracoes.reduce((total, fracao) => total + fracao, 0);

describe("abrir", () => {
  it("a primeira nota nasce num painel à direita do mapa, meio a meio", () => {
    const estado = abrir(PAINEIS_PADRAO, nota("a"));

    expect(resumo(estado)).toEqual(["mapa", "nota:a"]);
    expect(estado.fracoes).toEqual([0.5, 0.5]);
  });

  it("outra nota vira aba no painel de notas, e fica à vista", () => {
    const estado = abrir(abrir(PAINEIS_PADRAO, nota("a")), nota("b"));

    expect(resumo(estado)).toEqual(["mapa", "nota:a+nota:b"]);
    expect(lateral(estado, 1).ativa).toBe("nota:b");
  });

  it("um livro abre painel próprio, e o terceiro painel leva um terço", () => {
    const estado = abrir(abrir(PAINEIS_PADRAO, nota("a")), livro("phb"));

    expect(resumo(estado)).toEqual(["mapa", "livro:phb", "nota:a"]);
    expect(estado.fracoes.map((f) => Number(f.toFixed(3)))).toEqual([0.333, 0.333, 0.333]);
    expect(soma(estado)).toBeCloseTo(1);
  });

  it("cheio, o que não tem painel do tipo vira aba no último lateral", () => {
    // Dois painéis de livro (um arrancado do outro) e o mapa: não há vaga nem
    // painel de nota.
    let estado = abrir(abrir(PAINEIS_PADRAO, livro("phb")), livro("dmg"));
    estado = soltar(
      estado,
      { tipo: "aba", painelId: lateral(estado, 1).id, chave: "livro:dmg" },
      { painel: lateral(estado, 1).id, zona: "direita" },
    );
    expect(resumo(estado)).toEqual(["mapa", "livro:phb", "livro:dmg"]);

    estado = abrir(estado, nota("a"));

    expect(resumo(estado)).toEqual(["mapa", "livro:phb", "livro:dmg+nota:a"]);
  });

  it("o que já está aberto só vem à frente", () => {
    const antes = abrir(abrir(PAINEIS_PADRAO, nota("a")), nota("b"));
    const depois = abrir(antes, nota("a"));

    expect(resumo(depois)).toEqual(resumo(antes));
    expect(lateral(depois, 1).ativa).toBe("nota:a");
  });
});

describe("fecharAba", () => {
  it("passa a vez para a vizinha da direita", () => {
    let estado = abrir(abrir(abrir(PAINEIS_PADRAO, nota("a")), nota("b")), nota("c"));
    const painel = lateral(estado, 1).id;
    estado = ativar(estado, painel, "nota:b");

    estado = fecharAba(estado, painel, "nota:b");

    expect(resumo(estado)).toEqual(["mapa", "nota:a+nota:c"]);
    expect(lateral(estado, 1).ativa).toBe("nota:c");
  });

  it("o painel sem aba some e devolve a largura", () => {
    let estado = abrir(abrir(PAINEIS_PADRAO, nota("a")), livro("phb"));

    estado = fecharConteudo(estado, "livro:phb");

    expect(resumo(estado)).toEqual(["mapa", "nota:a"]);
    expect(soma(estado)).toBeCloseTo(1);
    expect(estado.fracoes[0]).toBeCloseTo(0.5);
  });
});

describe("soltar", () => {
  it("o livro vai para a esquerda do mapa, levando a largura", () => {
    let estado = abrir(PAINEIS_PADRAO, livro("phb"));
    estado = { ...estado, fracoes: [0.7, 0.3] };

    estado = soltar(
      estado,
      { tipo: "painel", painelId: lateral(estado, 1).id },
      { painel: "mapa", zona: "esquerda" },
    );

    expect(resumo(estado)).toEqual(["livro:phb", "mapa"]);
    expect(estado.fracoes).toEqual([0.3, 0.7]);
  });

  it("o mapa também anda, mas não vira aba", () => {
    const estado = abrir(PAINEIS_PADRAO, livro("phb"));
    const id = lateral(estado, 1).id;

    expect(resumo(soltar(estado, { tipo: "mapa" }, { painel: id, zona: "direita" }))).toEqual([
      "livro:phb",
      "mapa",
    ]);
    expect(soltar(estado, { tipo: "mapa" }, { painel: id, zona: "centro" })).toBe(estado);
    expect(
      soltar(estado, { tipo: "painel", painelId: id }, { painel: "mapa", zona: "centro" }),
    ).toBe(estado);
  });

  it("no centro de outro painel, junta como abas", () => {
    let estado = abrir(abrir(PAINEIS_PADRAO, nota("a")), livro("phb"));
    const doLivro = lateral(estado, 1).id;
    const daNota = lateral(estado, 2).id;

    estado = soltar(estado, { tipo: "painel", painelId: daNota }, { painel: doLivro, zona: "centro" });

    expect(resumo(estado)).toEqual(["mapa", "livro:phb+nota:a"]);
    expect(lateral(estado, 1).ativa).toBe("nota:a");
    expect(soma(estado)).toBeCloseTo(1);
  });

  it("uma aba arrancada para a borda vira painel, se houver vaga", () => {
    let estado = abrir(abrir(PAINEIS_PADRAO, nota("a")), nota("b"));
    const id = lateral(estado, 1).id;

    estado = soltar(
      estado,
      { tipo: "aba", painelId: id, chave: "nota:b" },
      { painel: "mapa", zona: "esquerda" },
    );

    expect(resumo(estado)).toEqual(["nota:b", "mapa", "nota:a"]);
  });

  it("sem vaga, a aba arrancada fica onde estava", () => {
    const estado = abrir(abrir(abrir(PAINEIS_PADRAO, nota("a")), livro("phb")), nota("b"));
    expect(estado.ordem).toHaveLength(3);
    const daNota = estado.ordem.find(
      (painel): painel is PainelLateral => painel.tipo === "abas" && painel.abas.length === 2,
    )!;

    expect(
      soltar(
        estado,
        { tipo: "aba", painelId: daNota.id, chave: "nota:b" },
        { painel: "mapa", zona: "esquerda" },
      ),
    ).toBe(estado);
  });
});

const quadro = (id: string): ConteudoDoPainel => ({ tipo: "quadro", sceneId: id });

describe("abrirEm", () => {
  it("na borda do mapa nasce um painel daquele lado", () => {
    expect(resumo(abrirEm(PAINEIS_PADRAO, quadro("q"), { painel: "mapa", zona: "esquerda" }))).toEqual([
      "quadro:q",
      "mapa",
    ]);
    expect(resumo(abrirEm(PAINEIS_PADRAO, nota("a"), { painel: "mapa", zona: "direita" }))).toEqual([
      "mapa",
      "nota:a",
    ]);
  });

  it("no centro de um painel lateral vira aba dele; no do mapa, nada", () => {
    const estado = abrir(PAINEIS_PADRAO, livro("phb"));
    const id = lateral(estado, 1).id;

    expect(resumo(abrirEm(estado, nota("a"), { painel: id, zona: "centro" }))).toEqual([
      "mapa",
      "livro:phb+nota:a",
    ]);
    expect(abrirEm(estado, nota("a"), { painel: "mapa", zona: "centro" })).toBe(estado);
  });

  it("cheio, a borda de um lateral vira aba dele, e a do mapa não aceita", () => {
    const estado = abrirEm(
      abrir(PAINEIS_PADRAO, livro("phb")),
      nota("a"),
      { painel: "mapa", zona: "esquerda" },
    );
    expect(estado.ordem).toHaveLength(3);
    const doLivro = lateral(estado, 2).id;

    expect(resumo(abrirEm(estado, quadro("q"), { painel: doLivro, zona: "direita" }))).toEqual([
      "nota:a",
      "mapa",
      "livro:phb+quadro:q",
    ]);
    expect(abrirEm(estado, quadro("q"), { painel: "mapa", zona: "direita" })).toBe(estado);
  });

  it("já aberto, muda de lugar em vez de abrir outro", () => {
    const estado = abrir(abrir(PAINEIS_PADRAO, nota("a")), nota("b"));

    const depois = abrirEm(estado, nota("b"), { painel: "mapa", zona: "esquerda" });

    expect(resumo(depois)).toEqual(["nota:b", "mapa", "nota:a"]);
  });
});

describe("podar", () => {
  it("fecha só as notas que não existem mais, e não toca nos livros", () => {
    let estado = abrir(abrir(abrir(PAINEIS_PADRAO, nota("a")), nota("b")), livro("phb"));

    estado = podar(estado, "nota", (conteudo) => conteudo.tipo === "nota" && conteudo.notaId === "a");

    expect(resumo(estado)).toEqual(["mapa", "livro:phb", "nota:a"]);
  });
});

describe("lerPaineis", () => {
  it("devolve o que foi gravado, com as frações fechando em um", () => {
    const gravado = abrir(abrir(PAINEIS_PADRAO, nota("a")), livro("phb"));
    const lido = lerPaineis(JSON.parse(JSON.stringify({ ...gravado, fracoes: [2, 1, 1] })));

    expect(resumo(lido)).toEqual(resumo(gravado));
    expect(lido.fracoes).toEqual([0.5, 0.25, 0.25]);
  });

  it("sem mapa, com dois, ou com painel demais, volta ao padrão", () => {
    const lateral = { tipo: "abas", id: "p", abas: [nota("a")], ativa: "nota:a" };

    expect(lerPaineis({ ordem: [lateral], fracoes: [1] })).toBe(PAINEIS_PADRAO);
    expect(lerPaineis({ ordem: [{ tipo: "mapa" }, { tipo: "mapa" }], fracoes: [1, 1] })).toBe(
      PAINEIS_PADRAO,
    );
    expect(
      lerPaineis({
        ordem: [{ tipo: "mapa" }, lateral, { ...lateral, id: "q" }, { ...lateral, id: "r" }],
        fracoes: [1, 1, 1, 1],
      }),
    ).toBe(PAINEIS_PADRAO);
  });

  it("lixo vira o padrão", () => {
    expect(lerPaineis(null)).toBe(PAINEIS_PADRAO);
    expect(lerPaineis({ ordem: [{ tipo: "mapa" }], fracoes: [Number.NaN] })).toBe(PAINEIS_PADRAO);
    expect(lerPaineis("x")).toBe(PAINEIS_PADRAO);
  });
});
