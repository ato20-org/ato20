import { describe, it, expect, beforeEach } from "vitest";
import { useIniciativaStore } from "./use-iniciativa-store";

describe("useIniciativaStore", () => {
  beforeEach(() => {
    useIniciativaStore.getState().encerrar();
  });

  it("inicia combate e avança/retorna turnos corretamente", () => {
    const store = useIniciativaStore.getState();
    store.iniciar([
      { id: "guerreiro", nome: "Guerreiro", iniciativa: 15 },
      { id: "orc", nome: "Orc", iniciativa: 10 },
    ]);

    expect(useIniciativaStore.getState().estado.rodada).toBe(1);
    expect(useIniciativaStore.getState().ativo()?.id).toBe("guerreiro");

    useIniciativaStore.getState().avancarTurno();
    expect(useIniciativaStore.getState().ativo()?.id).toBe("orc");
    expect(useIniciativaStore.getState().estado.rodada).toBe(1);

    // Volta a rodada para o início
    useIniciativaStore.getState().avancarTurno();
    expect(useIniciativaStore.getState().estado.rodada).toBe(2);
    expect(useIniciativaStore.getState().ativo()?.id).toBe("guerreiro");

    useIniciativaStore.getState().voltarTurno();
    expect(useIniciativaStore.getState().estado.rodada).toBe(1);
    expect(useIniciativaStore.getState().ativo()?.id).toBe("orc");
  });

  it("adiciona e remove participantes dinamicamente", () => {
    const store = useIniciativaStore.getState();
    store.iniciar([{ id: "heroi", nome: "Herói", iniciativa: 12 }]);

    store.adicionarParticipante({
      id: "vilao",
      nome: "Vilão",
      iniciativa: 20,
    });

    const ordenados = useIniciativaStore.getState().ordenados();
    expect(ordenados.map((p) => p.id)).toEqual(["vilao", "heroi"]);

    store.removerParticipante("vilao");
    expect(useIniciativaStore.getState().ordenados().map((p) => p.id)).toEqual([
      "heroi",
    ]);
  });
});
