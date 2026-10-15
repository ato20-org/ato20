import { describe, expect, it } from "vitest";
import {
  adicionarParticipante,
  avancarTurno,
  encerrarCombate,
  iniciarCombate,
  participanteAtivo,
  participantesOrdenados,
  removerParticipante,
  voltarTurno,
  type ParticipanteDeTurno,
} from "./iniciativa";

describe("Motor Lógico de Iniciativa e Combate", () => {
  const p1: ParticipanteDeTurno = { id: "heroi-1", nome: "Guerreiro", iniciativa: 18 };
  const p2: ParticipanteDeTurno = { id: "monstro-1", nome: "Goblin 1", iniciativa: 12 };
  const p3: ParticipanteDeTurno = { id: "monstro-2", nome: "Goblin 2", iniciativa: 12, desempate: 14 };

  it("ordena participantes por iniciativa decrescente e desempate", () => {
    const estado = iniciarCombate([p2, p1, p3]);

    expect(estado.rodada).toBe(1);
    expect(estado.indiceAtivo).toBe(0);
    // Heroi (18) primeiro, depois Goblin 2 (12 com desempate 14), depois Goblin 1 (12 sem desempate)
    expect(estado.ordem).toEqual(["heroi-1", "monstro-2", "monstro-1"]);
  });

  it("avança turnos e incrementa a rodada ao final do ciclo", () => {
    let estado = iniciarCombate([p1, p2]);
    expect(estado.rodada).toBe(1);
    expect(estado.indiceAtivo).toBe(0);

    // Turno do Goblin
    estado = avancarTurno(estado);
    expect(estado.rodada).toBe(1);
    expect(estado.indiceAtivo).toBe(1);

    // Volta para o Guerreiro e vira para a Rodada 2
    estado = avancarTurno(estado);
    expect(estado.rodada).toBe(2);
    expect(estado.indiceAtivo).toBe(0);
  });

  it("permite voltar turnos e retroceder a rodada", () => {
    let estado = iniciarCombate([p1, p2]);
    estado = avancarTurno(estado); // rodada 1, indice 1
    estado = avancarTurno(estado); // rodada 2, indice 0

    estado = voltarTurno(estado);
    expect(estado.rodada).toBe(1);
    expect(estado.indiceAtivo).toBe(1);
  });

  it("adiciona combatente novo mantendo o turno atual preservado", () => {
    let estado = iniciarCombate([p1, p2]);
    // Guerreiro ativo
    const novo: ParticipanteDeTurno = { id: "mago-1", nome: "Mago", iniciativa: 22 };
    estado = adicionarParticipante(estado, novo);

    // Mago tem maior iniciativa (vai para o índice 0), mas o turno do Guerreiro (agora índice 1) é preservado
    expect(estado.ordem).toEqual(["mago-1", "heroi-1", "monstro-1"]);
    expect(estado.indiceAtivo).toBe(1);
    expect(estado.ordem[estado.indiceAtivo]).toBe("heroi-1");
  });

  it("remove participante e ajusta ponteiros sem crash", () => {
    let estado = iniciarCombate([p1, p2, p3]);
    estado = avancarTurno(estado); // rodada 1, Goblin 2 ativo

    // Remove quem estava ativo
    estado = removerParticipante(estado, "monstro-2");
    expect(estado.ordem).toEqual(["heroi-1", "monstro-1"]);
    expect(estado.ordem[estado.indiceAtivo]).toBe("monstro-1");

    // Remove todos os restantes
    estado = removerParticipante(estado, "heroi-1");
    estado = removerParticipante(estado, "monstro-1");
    expect(estado.rodada).toBe(0);
    expect(estado.ordem).toHaveLength(0);
  });

  it("encerra o combate zerando o estado", () => {
    let estado = iniciarCombate([p1, p2]);
    estado = encerrarCombate();
    expect(estado.rodada).toBe(0);
    expect(estado.ordem).toHaveLength(0);
  });

  it("retorna participante ativo e participantes ordenados corretamente", () => {
    const estado = iniciarCombate([p2, p1]);
    expect(participanteAtivo(estado)?.id).toBe("heroi-1");

    const ordenados = participantesOrdenados(estado);
    expect(ordenados.map((p) => p.id)).toEqual(["heroi-1", "monstro-1"]);

    const estadoVazio = encerrarCombate();
    expect(participanteAtivo(estadoVazio)).toBeNull();
    expect(participantesOrdenados(estadoVazio)).toEqual([]);
  });
});

