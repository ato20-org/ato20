export interface ParticipanteDeTurno {
  id: string;
  nome: string;
  iniciativa: number;
  desempate?: number;
  escondido?: boolean;
}

export interface EstadoDeCombate {
  /** Número da rodada atual (0 = combate encerrado/inativo, 1 = primeira rodada). */
  rodada: number;
  /** Índice do participante cujo turno está ativo atualmente dentro de `ordem`. */
  indiceAtivo: number;
  /** Lista ordenada de IDs dos participantes por ordem de iniciativa. */
  ordem: string[];
  /** Mapa de dados de cada participante indexado por ID. */
  participantes: Record<string, ParticipanteDeTurno>;
}

/** Compara dois participantes para ordenar decrescente por iniciativa. */
export function compararIniciativa(
  a: ParticipanteDeTurno,
  b: ParticipanteDeTurno,
): number {
  if (b.iniciativa !== a.iniciativa) {
    return b.iniciativa - a.iniciativa;
  }
  const desempateA = a.desempate ?? 0;
  const desempateB = b.desempate ?? 0;
  if (desempateB !== desempateA) {
    return desempateB - desempateA;
  }
  return a.nome.localeCompare(b.nome);
}

/** Cria um estado de combate zerado/inativo. */
export function estadoDeCombateVazio(): EstadoDeCombate {
  return {
    rodada: 0,
    indiceAtivo: 0,
    ordem: [],
    participantes: {},
  };
}

/** Inicia um combate ordenando os participantes e começando na Rodada 1. */
export function iniciarCombate(
  lista: readonly ParticipanteDeTurno[],
): EstadoDeCombate {
  if (lista.length === 0) {
    return estadoDeCombateVazio();
  }

  const ordenados = [...lista].sort(compararIniciativa);
  const ordem = ordenados.map((p) => p.id);
  const participantes: Record<string, ParticipanteDeTurno> = {};

  for (const p of ordenados) {
    participantes[p.id] = { ...p };
  }

  return {
    rodada: 1,
    indiceAtivo: 0,
    ordem,
    participantes,
  };
}

/** Avança o turno para o próximo combatente da ordem, virando a rodada quando chega ao fim. */
export function avancarTurno(estado: EstadoDeCombate): EstadoDeCombate {
  if (estado.ordem.length === 0 || estado.rodada === 0) {
    return estado;
  }

  const proximoIndice = estado.indiceAtivo + 1;
  if (proximoIndice >= estado.ordem.length) {
    return {
      ...estado,
      rodada: estado.rodada + 1,
      indiceAtivo: 0,
    };
  }

  return {
    ...estado,
    indiceAtivo: proximoIndice,
  };
}

/** Retorna para o turno anterior, decrementando a rodada caso esteja no primeiro participante. */
export function voltarTurno(estado: EstadoDeCombate): EstadoDeCombate {
  if (estado.ordem.length === 0 || estado.rodada === 0) {
    return estado;
  }

  if (estado.indiceAtivo > 0) {
    return {
      ...estado,
      indiceAtivo: estado.indiceAtivo - 1,
    };
  }

  if (estado.rodada > 1) {
    return {
      ...estado,
      rodada: estado.rodada - 1,
      indiceAtivo: estado.ordem.length - 1,
    };
  }

  return estado;
}

/**
 * Adiciona um participante ao combate em andamento, inserindo-o na posição correta
 * da iniciativa e mantendo o combatente atual com o turno ativo.
 */
export function adicionarParticipante(
  estado: EstadoDeCombate,
  novo: ParticipanteDeTurno,
): EstadoDeCombate {
  const atualId = estado.ordem[estado.indiceAtivo];
  const novaLista = [
    ...Object.values(estado.participantes).filter((p) => p.id !== novo.id),
    novo,
  ].sort(compararIniciativa);

  const novaOrdem = novaLista.map((p) => p.id);
  const novosParticipantes: Record<string, ParticipanteDeTurno> = {};
  for (const p of novaLista) {
    novosParticipantes[p.id] = { ...p };
  }

  // Preservar quem estava agindo no momento
  const novoIndice = atualId ? novaOrdem.indexOf(atualId) : 0;

  return {
    rodada: Math.max(1, estado.rodada),
    indiceAtivo: novoIndice >= 0 ? novoIndice : 0,
    ordem: novaOrdem,
    participantes: novosParticipantes,
  };
}

/** Remove um participante do combate e ajusta o ponteiro do turno se necessário. */
export function removerParticipante(
  estado: EstadoDeCombate,
  id: string,
): EstadoDeCombate {
  if (!estado.participantes[id]) {
    return estado;
  }

  const atualId = estado.ordem[estado.indiceAtivo];
  const novaOrdem = estado.ordem.filter((item) => item !== id);

  if (novaOrdem.length === 0) {
    return estadoDeCombateVazio();
  }

  const novosParticipantes = { ...estado.participantes };
  delete novosParticipantes[id];

  let novoIndice: number;
  if (atualId === id) {
    // Quem estava no turno foi removido: passa o turno para quem agora ocupa o mesmo índice
    novoIndice = Math.min(estado.indiceAtivo, novaOrdem.length - 1);
  } else {
    novoIndice = Math.max(0, novaOrdem.indexOf(atualId));
  }

  return {
    ...estado,
    indiceAtivo: novoIndice,
    ordem: novaOrdem,
    participantes: novosParticipantes,
  };
}

/** Encerra o combate. */
export function encerrarCombate(): EstadoDeCombate {
  return estadoDeCombateVazio();
}

/** Retorna o participante que está no turno ativo no momento, ou null se não houver. */
export function participanteAtivo(
  estado: EstadoDeCombate,
): ParticipanteDeTurno | null {
  if (estado.ordem.length === 0 || estado.rodada === 0) return null;
  const id = estado.ordem[estado.indiceAtivo];
  return id ? (estado.participantes[id] ?? null) : null;
}

/** Retorna a lista de participantes na ordem exata de turnos. */
export function participantesOrdenados(
  estado: EstadoDeCombate,
): ParticipanteDeTurno[] {
  return estado.ordem
    .map((id) => estado.participantes[id])
    .filter((p): p is ParticipanteDeTurno => Boolean(p));
}
