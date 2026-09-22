import { beforeEach, describe, expect, it } from "vitest";

import { mesaCheia, useDadosStore } from "@/lib/store/use-dados-store";
import type { Mesa } from "@/types/dado";

const LARGADO = { x: 0, y: 0 };

/** Rola um d20 na mesa pedida, como a bancada faz ao trocar de cena. */
function rolarEm(mesa: Mesa) {
  useDadosStore.getState().definirMesa(mesa);
  return useDadosStore.getState().lancar(20, 100, 100, LARGADO);
}

const daMesa = (mesa: Mesa) =>
  useDadosStore.getState().dados.filter((dado) => dado.mesa === mesa);

beforeEach(() => {
  useDadosStore.setState({
    dados: [],
    historico: { mapa: [], quadro: [] },
    mesa: "mapa",
    succao: null,
    teto: 50,
  });
});

describe("as duas mesas de dados", () => {
  it("cada dado guarda onde caiu, e as duas mesas não se misturam", () => {
    rolarEm("mapa");
    rolarEm("mapa");
    rolarEm("quadro");

    expect(daMesa("mapa")).toHaveLength(2);
    expect(daMesa("quadro")).toHaveLength(1);
  });

  it("o histórico é por mesa, e o teto de uma não come o da outra", () => {
    rolarEm("quadro");
    // Bem mais que o teto do histórico: sem a separação, estas empurrariam a
    // do quadro para fora e a lista dele apareceria vazia.
    for (let i = 0; i < 30; i++) rolarEm("mapa");

    const { historico } = useDadosStore.getState();
    expect(historico.quadro).toHaveLength(1);
    expect(historico.mapa.length).toBeLessThanOrEqual(12);
  });

  it("recolher limpa só a mesa que está na tela", () => {
    rolarEm("mapa");
    rolarEm("mapa");
    rolarEm("quadro");

    // Sem destino é a limpeza no ato, sem espiral: é o caminho de quem não tem
    // boca de saquinho para mostrar.
    useDadosStore.getState().recolher();

    expect(daMesa("quadro")).toHaveLength(0);
    expect(daMesa("mapa")).toHaveLength(2);
  });

  it("a sucção leva só os da mesa pedida", () => {
    rolarEm("mapa");
    const noQuadro = rolarEm("quadro")!;

    useDadosStore.getState().recolher({ clientX: 0, clientY: 0 });
    expect(useDadosStore.getState().succao?.ids).toEqual([noQuadro.id]);

    useDadosStore.getState().consumirSuccao();
    expect(daMesa("quadro")).toHaveLength(0);
    expect(daMesa("mapa")).toHaveLength(1);
  });

  it("a mesa enche sozinha: o que ficou no mapa não ocupa lugar no quadro", () => {
    useDadosStore.setState({ teto: 2 });

    expect(rolarEm("mapa")).not.toBeNull();
    expect(rolarEm("mapa")).not.toBeNull();
    // Cheia no mapa...
    expect(mesaCheia()).toBe(true);
    expect(rolarEm("mapa")).toBeNull();

    // ...e vazia no quadro.
    useDadosStore.getState().definirMesa("quadro");
    expect(mesaCheia()).toBe(false);
    expect(rolarEm("quadro")).not.toBeNull();
  });
});
