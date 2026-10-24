import { describe, expect, it } from "vitest";

import { encerrar, iniciar, proximo, SEM_INICIATIVA } from "@/lib/iniciativa/rodadas";
import type { Condicao, Medidor, Personagem } from "@/types/character";
import type { EfeitoDisparado } from "@/types/efeito-disparado";
import type { CanvasItem, FogRegion, Porta, Portrait, Scene } from "@/types/scene";

import {
  daCenaAoVivo,
  daCenaNoAr,
  daEvidencia,
  dasCondicoes,
  dosDisparos,
  doCombate,
  dosMedidores,
  dosRetratos,
  juntarMedidor,
} from "./escriba";

const medidor = (atual: number, mudancas: Partial<Medidor> = {}): Medidor => ({
  id: "vida",
  nome: "Vida",
  cor: "#f00",
  estilo: "barra",
  atual,
  maximo: 20,
  escondido: false,
  ...mudancas,
});

const condicao = (id: string): Condicao => ({
  id,
  nome: "Envenenado",
  cor: "#0f0",
  icone: "veneno",
  escondido: false,
});

const personagem = (
  id: string,
  medidores: Medidor[],
  condicoes: Condicao[] = [],
): Personagem => ({ id, nome: id === "e" ? "Edgar" : id, criadoEm: 0, medidores, condicoes });

const area = (id: string, revealed: boolean, extra: Partial<FogRegion> = {}): FogRegion => ({
  id,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  revealed,
  ...extra,
});

const porta = (id: string, abertura?: number): Porta => ({
  id,
  x: 0,
  y: 0,
  comprimento: 50,
  angulo: 0,
  ...(abertura === undefined ? {} : { abertura }),
});

const peca = (id: string, extra: Partial<CanvasItem> = {}): CanvasItem => ({
  id,
  assetId: "a",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  rotation: 0,
  z: 1,
  locked: false,
  ...extra,
});

const cena = (extra: Partial<Scene> = {}): Scene =>
  ({ id: "c1", name: "Taverna", items: [], fog: [], portas: [], ...extra }) as Scene;

const nomes = { item: () => "Baú do capitão", peca: () => "Barril" };

describe("daCenaNoAr", () => {
  it("só quando a cena no ar muda, com o nome dela", () => {
    expect(daCenaNoAr("a", "a", () => "x")).toEqual([]);
    expect(daCenaNoAr(null, "a", () => "Taverna")).toEqual([
      { tipo: "cena", cenaId: "a", cena: "Taverna" },
    ]);
    expect(daCenaNoAr("a", null, () => "x")).toEqual([{ tipo: "cena", cenaId: null, cena: null }]);
  });
});

describe("doCombate", () => {
  const nomeDe = (id: string) => id.toUpperCase();

  it("começo, rodada nova e fim", () => {
    const comecou = iniciar(["a", "b"], 1);
    expect(doCombate(SEM_INICIATIVA, comecou, nomeDe)).toEqual([
      { tipo: "combate", fase: "inicio", ordem: ["A", "B"] },
    ]);

    const vezDoB = proximo(comecou, 2);
    expect(doCombate(comecou, vezDoB, nomeDe)).toEqual([]);

    const rodada2 = proximo(vezDoB, 3);
    expect(doCombate(vezDoB, rodada2, nomeDe)).toEqual([
      { tipo: "combate", fase: "rodada", rodada: 2 },
    ]);

    expect(doCombate(rodada2, encerrar(rodada2, 4), nomeDe)).toEqual([
      { tipo: "combate", fase: "fim", rodadas: 2 },
    ]);
  });
});

describe("dosMedidores", () => {
  it("só o valor que mudou, com o nome congelado", () => {
    const antes = [personagem("e", [medidor(12)])];
    const depois = [personagem("e", [medidor(5)])];

    expect(dosMedidores(antes, depois)).toEqual([
      {
        tipo: "medidor",
        personagemId: "e",
        personagem: "Edgar",
        medidor: "Vida",
        cor: "#f00",
        antes: 12,
        depois: 5,
        maximo: 20,
      },
    ]);
  });

  it("arrumar a ficha e o medidor que nasceu não são acontecimento", () => {
    const antes = [personagem("e", [medidor(12)])];

    expect(dosMedidores(antes, [personagem("e", [medidor(12, { maximo: 30, cor: "#00f" })])])).toEqual(
      [],
    );
    expect(dosMedidores([personagem("e", [])], [personagem("e", [medidor(5)])])).toEqual([]);
    expect(dosMedidores(null, [personagem("e", [medidor(5)])])).toEqual([]);
  });
});

describe("dasCondicoes", () => {
  it("entrou e saiu, de quem já estava no elenco", () => {
    const antes = [personagem("e", [], [condicao("x")])];
    const depois = [personagem("e", [], [condicao("y")])];

    expect(dasCondicoes(antes, depois).map((fato) => [fato.alvoId, fato.ligada])).toEqual([
      ["e", true],
      ["e", false],
    ]);
  });

  it("quem chega ao elenco já com condições não ganhou nada agora", () => {
    expect(dasCondicoes([], [personagem("g", [], [condicao("x")])])).toEqual([]);
  });
});

describe("daCenaAoVivo", () => {
  it("névoa revelada e escondida, sem a dinâmica", () => {
    const antes = cena({ fog: [area("a", false), area("d", false, { dinamica: true })] });
    const depois = cena({ fog: [area("a", true), area("d", true, { dinamica: true })] });

    expect(daCenaAoVivo(antes, depois, nomes)).toEqual([
      { tipo: "mostrado", o: "nevoa-revelada", cena: "Taverna" },
    ]);
  });

  it("porta aberta e fechada, e não a que nasceu", () => {
    const antes = cena({ portas: [porta("p"), porta("q", 90)] });
    const depois = cena({ portas: [porta("p", 90), porta("q"), porta("nova", 90)] });

    expect(daCenaAoVivo(antes, depois, nomes)).toEqual([
      { tipo: "mostrado", o: "porta-aberta", cena: "Taverna" },
      { tipo: "mostrado", o: "porta-fechada", cena: "Taverna" },
    ]);
  });

  it("item da campanha que aparece e some do mapa; token e escondido não", () => {
    const bau = peca("bau", { itemId: "i1" });
    const token = peca("t", { itemId: "i2", personagemId: "e" });
    const escondido = peca("esc", { itemId: "i3", escondido: true });

    const entrou = daCenaAoVivo(cena(), cena({ items: [bau, token, escondido] }), nomes);
    expect(entrou).toEqual([
      {
        tipo: "item",
        acao: "no-mapa",
        itemId: "i1",
        item: "Baú do capitão",
        cenaId: "c1",
        cena: "Taverna",
      },
    ]);

    const mostrouOEscondido = daCenaAoVivo(
      cena({ items: [escondido] }),
      cena({ items: [{ ...escondido, escondido: false }] }),
      nomes,
    );
    expect(mostrouOEscondido.map((fato) => fato.tipo === "item" && fato.acao)).toEqual(["no-mapa"]);

    const saiu = daCenaAoVivo(cena({ items: [bau] }), cena({ items: [] }), nomes);
    expect(saiu.map((fato) => fato.tipo === "item" && fato.acao)).toEqual(["fora-do-mapa"]);
  });

  it("condição de objeto", () => {
    const antes = cena({ items: [peca("b")] });
    const depois = cena({ items: [peca("b", { condicoes: [condicao("fogo")] })] });

    expect(daCenaAoVivo(antes, depois, nomes)).toEqual([
      {
        tipo: "condicao",
        alvo: "objeto",
        alvoId: "b",
        nome: "Barril",
        condicao: "Envenenado",
        cor: "#0f0",
        ligada: true,
      },
    ]);
  });

  it("troca de cena não compara um mapa com o outro", () => {
    const antes = cena({ portas: [porta("p")] });
    const depois = cena({ id: "c2", portas: [porta("p", 90)] });

    expect(daCenaAoVivo(antes, depois, nomes)).toEqual([]);
    expect(daCenaAoVivo(undefined, depois, nomes)).toEqual([]);
  });
});

describe("daEvidencia", () => {
  it("o que entra em evidência, e não o que sai", () => {
    const nome = () => "Mapa do tesouro";

    expect(daEvidencia(null, { assetId: "a", since: 1 }, nome)).toEqual([
      { tipo: "mostrado", o: "evidencia", nome: "Mapa do tesouro" },
    ]);
    expect(daEvidencia({ assetId: "a", since: 1 }, null, nome)).toEqual([]);
    expect(daEvidencia({ assetId: "a", since: 1 }, { assetId: "a", since: 1 }, nome)).toEqual([]);
    expect(
      daEvidencia(null, { item: { nome: "Anel", descricao: "" }, since: 2 }, nome),
    ).toEqual([{ tipo: "mostrado", o: "item", nome: "Anel" }]);
  });
});

describe("dosRetratos", () => {
  const retrato = (id: string, visible: boolean): Portrait =>
    ({ id, personagemId: id, assetId: "a", x: 0, y: 0, width: 1, height: 1, visible }) as Portrait;

  it("só o que entrou na fila", () => {
    const fatos = dosRetratos(
      [retrato("a", true), retrato("b", false)],
      [retrato("a", true), retrato("b", true), retrato("c", false)],
      (r) => r.id.toUpperCase(),
    );

    expect(fatos).toEqual([{ tipo: "mostrado", o: "retrato", nome: "B" }]);
  });
});

describe("juntarMedidor", () => {
  const mudanca = (antes: number, depois: number) => ({
    tipo: "medidor" as const,
    personagemId: "e",
    personagem: "Edgar",
    medidor: "Vida",
    cor: "#f00",
    antes,
    depois,
    maximo: 20,
  });

  it("o primeiro antes fica, o último depois vale", () => {
    const um = juntarMedidor(undefined, mudanca(12, 11));
    const dois = juntarMedidor(um!, mudanca(11, 5));

    expect(dois).toMatchObject({ antes: 12, depois: 5 });
  });

  it("caiu e voltou ao mesmo número: não aconteceu", () => {
    expect(juntarMedidor(mudanca(12, 7), mudanca(7, 12))).toBeNull();
  });
});

describe("dosDisparos", () => {
  const tiro = (id: string, de: { x: number; y: number }, para: { x: number; y: number }, cenaId = "c1"): EfeitoDisparado => ({
    id,
    cenaId,
    efeito: "bola-de-fogo",
    cor: "#f60",
    forma: "linha",
    de,
    para,
    tamanho: 1,
    impacto: 1,
    voo: 500,
    quando: 1,
  });
  const edgar = peca("t1", { personagemId: "edgar", x: 0, y: 0, width: 10, height: 10 });
  const goblin = peca("t2", { personagemId: "gob", x: 100, y: 0, width: 10, height: 10 });
  const noAr = cena({ items: [edgar, goblin] });
  const nomesDoTiro = {
    efeito: () => "Bola de fogo",
    peca: (p: CanvasItem) => (p.personagemId === "edgar" ? "Edgar" : "Goblin"),
  };

  it("quem disparou, o efeito e em quem caiu, com os ids para a ficha", () => {
    expect(dosDisparos([], [tiro("a", { x: 5, y: 5 }, { x: 105, y: 5 })], noAr, nomesDoTiro)).toEqual([
      {
        tipo: "disparo",
        efeito: "Bola de fogo",
        de: "Edgar",
        deId: "edgar",
        em: "Goblin",
        emId: "gob",
        cena: "Taverna",
      },
    ]);
  });

  it("a ponta no chão fica sem alvo, e o tiro já visto não volta", () => {
    const visto = tiro("a", { x: 5, y: 5 }, { x: 50, y: 50 });
    const novo = tiro("b", { x: 5, y: 5 }, { x: 50, y: 50 });

    const fatos = dosDisparos([visto], [novo, visto], noAr, nomesDoTiro);
    expect(fatos).toHaveLength(1);
    expect(fatos[0]).not.toHaveProperty("em");
  });

  it("fora da cena no ar é o mestre testando o efeito", () => {
    expect(
      dosDisparos([], [tiro("a", { x: 5, y: 5 }, { x: 105, y: 5 }, "outra")], noAr, nomesDoTiro),
    ).toEqual([]);
    expect(dosDisparos([], [tiro("a", { x: 5, y: 5 }, { x: 105, y: 5 })], undefined, nomesDoTiro)).toEqual(
      [],
    );
  });
});
