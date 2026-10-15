import { describe, expect, it } from "vitest";

import {
  SEM_INICIATIVA,
  anterior,
  daVez,
  emGrupos,
  encerrar,
  incluir,
  iniciar,
  mover,
  podeMoverNaVez,
  porVez,
  proximo,
  registrar,
  retirar,
  semAutorNoRotulo,
  totalDaRolagem,
  vezNaMesa,
  type FatoDaRodada,
} from "@/lib/iniciativa/rodadas";

const condicao = (personagem: string): FatoDaRodada => ({
  tipo: "condicao",
  personagemId: personagem,
  personagem,
  condicao: "Caído",
  cor: "#f00",
  ligada: true,
});

const dado = (
  lanceId: string | null,
  valor: number,
  modificador = 0,
): Extract<FatoDaRodada, { tipo: "rolagem" }> => ({
  tipo: "rolagem",
  jogador: null,
  personagemId: null,
  personagem: null,
  rotulo: lanceId ? "Dante · Luta" : null,
  lanceId,
  modificador,
  dados: [{ faces: 20, valor, soma: true }],
});

describe("iniciar", () => {
  it("abre a rodada 1 com a vez do primeiro, sem repetidos", () => {
    const ini = iniciar(["a", "b", "a", "c"], 100);

    expect(ini.rodando).toBe(true);
    expect(ini.ordem).toEqual(["a", "b", "c"]);
    expect(daVez(ini)).toBe("a");
    expect(ini.rodadas).toEqual([{ numero: 1, inicio: 100, fim: null, eventos: [] }]);
  });
});

describe("proximo e anterior", () => {
  it("passa a vez e, depois do último, abre a rodada seguinte", () => {
    let ini = iniciar(["a", "b"], 0);
    ini = proximo(ini, 10);
    expect(daVez(ini)).toBe("b");

    ini = proximo(ini, 20);
    expect(daVez(ini)).toBe("a");
    expect(ini.rodadas.map((rodada) => [rodada.numero, rodada.fim])).toEqual([
      [1, 20],
      [2, null],
    ]);
  });

  it("antes do primeiro reabre a rodada anterior, levando o que já foi anotado", () => {
    let ini = proximo(proximo(iniciar(["a", "b"], 0), 1), 2);
    ini = registrar(ini, condicao("a"), 3);

    ini = anterior(ini);

    expect(daVez(ini)).toBe("b");
    expect(ini.rodadas).toHaveLength(1);
    expect(ini.rodadas[0]?.fim).toBeNull();
    expect(ini.rodadas[0]?.eventos).toHaveLength(1);
  });

  it("não volta antes do primeiro turno da rodada 1", () => {
    const ini = iniciar(["a", "b"], 0);

    expect(anterior(ini)).toBe(ini);
  });
});

describe("incluir e retirar", () => {
  it("quem entra no meio age por último", () => {
    const ini = incluir(iniciar(["a", "b"], 0), "c");

    expect(ini.ordem).toEqual(["a", "b", "c"]);
    expect(incluir(ini, "a")).toBe(ini);
  });

  it("tirar alguém antes da vez não muda de quem é a vez", () => {
    const ini = retirar(proximo(iniciar(["a", "b", "c"], 0), 1), "a", 2);

    expect(ini.ordem).toEqual(["b", "c"]);
    expect(daVez(ini)).toBe("b");
  });

  it("tirar o da vez passa a vez ao seguinte", () => {
    const ini = retirar(proximo(iniciar(["a", "b", "c"], 0), 1), "b", 2);

    expect(daVez(ini)).toBe("c");
    expect(ini.rodadas).toHaveLength(1);
  });

  it("tirar o último na vez dele abre a rodada seguinte", () => {
    let ini = proximo(proximo(iniciar(["a", "b", "c"], 0), 1), 2);
    ini = retirar(ini, "c", 3);

    expect(daVez(ini)).toBe("a");
    expect(ini.rodadas.map((rodada) => rodada.numero)).toEqual([1, 2]);
  });
});

describe("mover", () => {
  it("leva para a posição final, e a vez fica com quem estava", () => {
    let ini = proximo(iniciar(["a", "b", "c", "d"], 0), 1);
    ini = mover(ini, "d", 0);

    expect(ini.ordem).toEqual(["d", "a", "b", "c"]);
    expect(daVez(ini)).toBe("b");
  });

  it("prende a posição dentro da lista", () => {
    const ini = mover(iniciar(["a", "b", "c"], 0), "a", 99);

    expect(ini.ordem).toEqual(["b", "c", "a"]);
  });
});

describe("registrar", () => {
  it("anota com a vez de quem era", () => {
    const ini = registrar(proximo(iniciar(["a", "b"], 0), 1), condicao("a"), 5);

    expect(ini.rodadas[0]?.eventos[0]).toMatchObject({ quando: 5, vezDe: "b" });
  });

  it("junta os dados de um mesmo lance numa linha só", () => {
    let ini = iniciar(["a"], 0);
    ini = registrar(ini, dado("lance-1", 12, 5), 1);
    ini = registrar(ini, dado("lance-1", 7, 5), 2);
    ini = registrar(ini, dado(null, 3), 3);

    const eventos = ini.rodadas[0]?.eventos ?? [];
    expect(eventos).toHaveLength(2);
    expect(eventos[0]?.tipo === "rolagem" && totalDaRolagem(eventos[0])).toBe(24);
  });

  it("não anota fora de combate", () => {
    expect(registrar(SEM_INICIATIVA, condicao("a"), 1)).toBe(SEM_INICIATIVA);
  });
});

describe("encerrar", () => {
  it("tira a ordem e guarda as rodadas fechadas", () => {
    const ini = encerrar(proximo(iniciar(["a"], 0), 1), 9);

    expect(ini.rodando).toBe(false);
    expect(ini.ordem).toEqual([]);
    expect(ini.rodadas.map((rodada) => rodada.fim)).toEqual([1, 9]);
  });
});

describe("porVez", () => {
  it("separa em blocos consecutivos", () => {
    let ini = iniciar(["a", "b"], 0);
    ini = registrar(ini, condicao("x"), 1);
    ini = proximo(ini, 2);
    ini = registrar(ini, condicao("y"), 3);
    ini = anterior(ini);
    ini = registrar(ini, condicao("z"), 4);

    expect(porVez(ini.rodadas[0]?.eventos ?? []).map((bloco) => bloco.vezDe)).toEqual([
      "a",
      "b",
      "a",
    ]);
  });
});

describe("emGrupos", () => {
  const doJogador = (lanceId: string): FatoDaRodada => ({
    ...dado(lanceId, 10),
    jogador: "Mig",
    personagemId: "old",
    personagem: "Old Man",
  });

  it("junta as rolagens seguidas do mesmo autor, e medidor e condição quebram", () => {
    let ini = iniciar(["a"], 0);
    ini = registrar(ini, dado(null, 1), 1);
    ini = registrar(ini, dado(null, 2), 2);
    ini = registrar(ini, doJogador("l1"), 3);
    ini = registrar(ini, doJogador("l2"), 4);
    ini = registrar(ini, condicao("a"), 5);
    ini = registrar(ini, doJogador("l3"), 6);

    const grupos = emGrupos(ini.rodadas[0]?.eventos ?? []);
    expect(
      grupos.map((grupo) =>
        grupo.tipo === "rolagens"
          ? `${grupo.autor.personagem ?? "mestre"}:${grupo.eventos.length}`
          : grupo.evento.tipo,
      ),
    ).toEqual(["mestre:2", "Old Man:2", "condicao", "Old Man:1"]);
  });
});

describe("semAutorNoRotulo", () => {
  it("tira o nome do autor só quando é ele na frente", () => {
    expect(semAutorNoRotulo("Old Man · Acrobacia", "Old Man")).toBe("Acrobacia");
    expect(semAutorNoRotulo("Dante · Luta", "Old Man")).toBe("Dante · Luta");
    expect(semAutorNoRotulo("Dante · Luta", null)).toBe("Dante · Luta");
  });
});

describe("podeMoverNaVez", () => {
  it("fora de combate todos andam; em combate, só o da vez", () => {
    expect(podeMoverNaVez(vezNaMesa(SEM_INICIATIVA), "a")).toBe(true);

    const vez = vezNaMesa(proximo(iniciar(["a", "b"], 0), 1));
    expect(vez).toEqual({ vezDe: "b", rodada: 1 });
    expect(podeMoverNaVez(vez, "b")).toBe(true);
    expect(podeMoverNaVez(vez, "a")).toBe(false);
  });

  it("com a ordem vazia o mapa fica livre", () => {
    expect(podeMoverNaVez(vezNaMesa(iniciar([], 0)), "a")).toBe(true);
  });
});
