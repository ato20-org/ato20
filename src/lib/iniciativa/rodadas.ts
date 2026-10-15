/**
 * A ordem da rodada: quem age, de quem é a vez, e o que aconteceu em cada
 * rodada.
 *
 * Do núcleo, e sem regra nenhuma: a ordem é a que o mestre arrumou, e não a de
 * um número rolado. Iniciativa existe em quase todo RPG, mas COMO se decide
 * muda de sistema para sistema -- d20 mais Destreza, um teste de perícia,
 * cartas, ou a mesa combina. O núcleo guarda a ordem e diz de quem é a vez; quem
 * rolar arruma a ordem pelo resultado.
 *
 * Funções puras sobre um valor, e o store só as chama: é aqui que mora o que dá
 * para errar -- a volta que fecha a rodada, a vez que não pode pular quando
 * alguém sai, o lance de três dados que é uma rolagem só --, e é isto que o
 * teste cobre.
 */

import type { FacesDado } from "@/types/dado";

/** Um dado de uma rolagem, já com o valor que a mesa soma. */
export type DadoRolado = {
  faces: FacesDado;
  valor: number;
  /** O d100 de porcentagem e afins não entram na conta. Ver `entraNaSoma`. */
  soma: boolean;
};

/**
 * O que aconteceu, sem quando nem de quem era a vez -- quem anota é
 * `registrar`, que sabe as duas coisas.
 *
 * Os nomes vão GRAVADOS, e não só o id: o histórico conta o que aconteceu, e
 * um personagem renomeado ou apagado depois não pode reescrever a rodada.
 */
export type FatoDaRodada =
  | {
      tipo: "rolagem";
      /** Quem rolou. `null` é o mestre. */
      jogador: string | null;
      /** O personagem por quem o jogador rolou, quando o celular disse. */
      personagemId: string | null;
      personagem: string | null;
      /** "Dante · Luta", quando a rolagem tem nome. */
      rotulo: string | null;
      /** Os dados de um mesmo lance entram um por vez e viram uma linha só. */
      lanceId: string | null;
      modificador: number;
      dados: DadoRolado[];
    }
  | {
      tipo: "medidor";
      personagemId: string;
      personagem: string;
      medidor: string;
      cor: string;
      /** `null` quando o medidor acabou de nascer. */
      antes: number | null;
      depois: number;
      maximo: number;
    }
  | {
      tipo: "condicao";
      personagemId: string;
      personagem: string;
      condicao: string;
      cor: string;
      /** `true` entrou, `false` saiu. */
      ligada: boolean;
    };

export type EventoDaRodada = FatoDaRodada & {
  quando: number;
  /** De quem era a vez quando aconteceu. `null` com a ordem vazia. */
  vezDe: string | null;
};

export type Rodada = {
  numero: number;
  inicio: number;
  /** `null` enquanto é a rodada corrente. */
  fim: number | null;
  eventos: EventoDaRodada[];
};

export type Iniciativa = {
  /**
   * `false` antes de começar e depois de encerrar. Encerrada, a ordem some e as
   * rodadas FICAM: a pergunta "quanto de dano o dragão levou na terceira?"
   * aparece justamente quando o combate acabou.
   */
  rodando: boolean;
  /** Ids de personagem, na ordem em que agem. */
  ordem: string[];
  /** Índice em `ordem` de quem age agora. */
  vez: number;
  /** Da primeira para a corrente. */
  rodadas: Rodada[];
};

export const SEM_INICIATIVA: Iniciativa = {
  rodando: false,
  ordem: [],
  vez: 0,
  rodadas: [],
};

function novaRodada(numero: number, agora: number): Rodada {
  return { numero, inicio: agora, fim: null, eventos: [] };
}

function fecharCorrente(rodadas: readonly Rodada[], agora: number): Rodada[] {
  const corrente = rodadas.at(-1);
  if (!corrente || corrente.fim !== null) return [...rodadas];

  return [...rodadas.slice(0, -1), { ...corrente, fim: agora }];
}

/** Abre a rodada seguinte, com a vez no topo da ordem. */
function virarRodada(iniciativa: Iniciativa, agora: number): Iniciativa {
  const numero = (iniciativa.rodadas.at(-1)?.numero ?? 0) + 1;

  return {
    ...iniciativa,
    vez: 0,
    rodadas: [...fecharCorrente(iniciativa.rodadas, agora), novaRodada(numero, agora)],
  };
}

/** Começa na rodada 1, com a vez do primeiro. Repetidos entram uma vez só. */
export function iniciar(ids: readonly string[], agora: number): Iniciativa {
  return {
    rodando: true,
    ordem: [...new Set(ids)],
    vez: 0,
    rodadas: [novaRodada(1, agora)],
  };
}

/** A vez passa ao seguinte; depois do último, abre a rodada seguinte. */
export function proximo(iniciativa: Iniciativa, agora: number): Iniciativa {
  if (!iniciativa.rodando || iniciativa.ordem.length === 0) return iniciativa;
  if (iniciativa.vez < iniciativa.ordem.length - 1)
    return { ...iniciativa, vez: iniciativa.vez + 1 };

  return virarRodada(iniciativa, agora);
}

/**
 * A vez volta ao anterior; antes do primeiro, volta à rodada anterior.
 *
 * Voltar a rodada a REABRE, e o que já tinha sido anotado na que estava
 * começando vai junto para ela: aconteceu de verdade, e foi depois do último
 * turno da rodada reaberta. Jogar fora seria apagar uma rolagem porque o mestre
 * clicou em "próximo" cedo demais.
 */
export function anterior(iniciativa: Iniciativa): Iniciativa {
  if (!iniciativa.rodando || iniciativa.ordem.length === 0) return iniciativa;
  if (iniciativa.vez > 0) return { ...iniciativa, vez: iniciativa.vez - 1 };

  const corrente = iniciativa.rodadas.at(-1);
  const previa = iniciativa.rodadas.at(-2);
  if (!corrente || !previa) return iniciativa;

  const reaberta: Rodada = {
    ...previa,
    fim: null,
    eventos: [...previa.eventos, ...corrente.eventos],
  };

  return {
    ...iniciativa,
    vez: iniciativa.ordem.length - 1,
    rodadas: [...iniciativa.rodadas.slice(0, -2), reaberta],
  };
}

/** Entra no fim da ordem: quem chega no meio do combate age por último. */
export function incluir(iniciativa: Iniciativa, id: string): Iniciativa {
  if (!iniciativa.rodando || iniciativa.ordem.includes(id)) return iniciativa;

  return { ...iniciativa, ordem: [...iniciativa.ordem, id] };
}

/**
 * Sai da ordem sem a vez pular ninguém.
 *
 * Quem estava antes da vez sai e a vez recua um, para continuar no mesmo
 * personagem. Quem saiu era o da vez: ela fica no mesmo índice, que agora é o
 * seguinte -- e, se ele era o último, a vez dá a volta e abre a rodada
 * seguinte, como o "próximo" faria.
 */
export function retirar(iniciativa: Iniciativa, id: string, agora: number): Iniciativa {
  const indice = iniciativa.ordem.indexOf(id);
  if (indice < 0) return iniciativa;

  const ordem = iniciativa.ordem.filter((cada) => cada !== id);
  const vez = indice < iniciativa.vez ? iniciativa.vez - 1 : iniciativa.vez;

  if (ordem.length === 0) return { ...iniciativa, ordem, vez: 0 };
  if (vez >= ordem.length) return virarRodada({ ...iniciativa, ordem }, agora);

  return { ...iniciativa, ordem, vez };
}

/**
 * Leva um personagem para outra posição, e a vez continua com quem ela estava.
 *
 * `para` é a posição FINAL dele, contada na ordem sem ele -- é o que o arrasto
 * sabe medir: quantos dos outros ficaram acima do ponteiro.
 */
export function mover(iniciativa: Iniciativa, id: string, para: number): Iniciativa {
  if (!iniciativa.ordem.includes(id)) return iniciativa;

  const daVez = iniciativa.ordem[iniciativa.vez];
  const outros = iniciativa.ordem.filter((cada) => cada !== id);
  const alvo = Math.min(Math.max(0, para), outros.length);
  const ordem = [...outros.slice(0, alvo), id, ...outros.slice(alvo)];

  return { ...iniciativa, ordem, vez: daVez ? ordem.indexOf(daVez) : 0 };
}

/** Fecha a rodada corrente e tira a ordem da tela. As rodadas ficam. */
export function encerrar(iniciativa: Iniciativa, agora: number): Iniciativa {
  if (!iniciativa.rodando) return iniciativa;

  return {
    rodando: false,
    ordem: [],
    vez: 0,
    rodadas: fecharCorrente(iniciativa.rodadas, agora),
  };
}

/**
 * Anota um fato na rodada corrente, com a vez de quem era.
 *
 * O dado de um lance que chega depois do primeiro entra na MESMA linha: o lance
 * de três dados da Luta é uma rolagem, e a conta (`+5`) só faz sentido sobre os
 * três juntos.
 */
export function registrar(
  iniciativa: Iniciativa,
  fato: FatoDaRodada,
  quando: number,
): Iniciativa {
  const corrente = iniciativa.rodadas.at(-1);
  if (!iniciativa.rodando || !corrente) return iniciativa;

  const ultimo = corrente.eventos.at(-1);
  const mesmoLance =
    fato.tipo === "rolagem" &&
    fato.lanceId !== null &&
    ultimo?.tipo === "rolagem" &&
    ultimo.lanceId === fato.lanceId;

  const eventos: EventoDaRodada[] = mesmoLance
    ? [...corrente.eventos.slice(0, -1), { ...ultimo, dados: [...ultimo.dados, ...fato.dados] }]
    : [...corrente.eventos, { ...fato, quando, vezDe: daVez(iniciativa) }];

  return {
    ...iniciativa,
    rodadas: [...iniciativa.rodadas.slice(0, -1), { ...corrente, eventos }],
  };
}

/** O id de quem age agora, ou `null` fora de combate ou com a ordem vazia. */
export function daVez(iniciativa: Iniciativa): string | null {
  if (!iniciativa.rodando) return null;

  return iniciativa.ordem[iniciativa.vez] ?? null;
}

/** O total de uma rolagem: os dados que somam, mais o modificador. */
export function totalDaRolagem(
  evento: Extract<FatoDaRodada, { tipo: "rolagem" }>,
): number {
  return (
    evento.dados.reduce((soma, dado) => (dado.soma ? soma + dado.valor : soma), 0) +
    evento.modificador
  );
}

/**
 * Os eventos de uma rodada em blocos por vez, na ordem em que aconteceram.
 *
 * Por blocos CONSECUTIVOS, e não um grupo por personagem: com o "anterior" a
 * vez de alguém pode voltar depois da de outro, e juntar as duas passagens
 * contaria a rodada fora da ordem.
 */
export function porVez(
  eventos: readonly EventoDaRodada[],
): Array<{ vezDe: string | null; eventos: EventoDaRodada[] }> {
  const blocos: Array<{ vezDe: string | null; eventos: EventoDaRodada[] }> = [];

  for (const evento of eventos) {
    const ultimo = blocos.at(-1);
    if (ultimo && ultimo.vezDe === evento.vezDe) ultimo.eventos.push(evento);
    else blocos.push({ vezDe: evento.vezDe, eventos: [evento] });
  }

  return blocos;
}

type Rolado = Extract<EventoDaRodada, { tipo: "rolagem" }>;

/** Quem rolou: o mestre, ou um jogador -- por um personagem ou não. */
export type Autor = Pick<Rolado, "jogador" | "personagemId" | "personagem">;

export type GrupoDaRodada =
  | { tipo: "rolagens"; autor: Autor; eventos: Rolado[] }
  | { tipo: "evento"; evento: Exclude<EventoDaRodada, Rolado> };

function mesmoAutor(a: Autor, b: Autor): boolean {
  return a.jogador === b.jogador && a.personagemId === b.personagemId;
}

/**
 * As rolagens SEGUIDAS de um mesmo autor num grupo só, e o resto solto.
 *
 * O nome de quem rolou vira o cabeçalho do grupo, e as linhas dizem só o que
 * foi rolado: "Mestre" escrito em seis linhas seguidas era o que mais se lia na
 * rodada, e o que menos informava. Medidor e condição não têm autor -- dizem
 * de QUEM mudou, e o nome já está na linha --, e por isso quebram o grupo.
 */
export function emGrupos(eventos: readonly EventoDaRodada[]): GrupoDaRodada[] {
  const grupos: GrupoDaRodada[] = [];

  for (const evento of eventos) {
    if (evento.tipo !== "rolagem") {
      grupos.push({ tipo: "evento", evento });
      continue;
    }

    const ultimo = grupos.at(-1);
    if (ultimo?.tipo === "rolagens" && mesmoAutor(ultimo.autor, evento))
      ultimo.eventos.push(evento);
    else
      grupos.push({
        tipo: "rolagens",
        autor: {
          jogador: evento.jogador,
          personagemId: evento.personagemId,
          personagem: evento.personagem,
        },
        eventos: [evento],
      });
  }

  return grupos;
}

/**
 * O rótulo sem o nome do autor na frente.
 *
 * A rolagem da ficha já nasce "Old Man · Acrobacia", e embaixo do cabeçalho
 * "Old Man" a linha repetiria o nome. Só tira quando é EXATAMENTE o autor: o
 * mestre rolando a Luta do Dante continua "Dante · Luta", porque ali o nome é
 * a informação.
 */
export function semAutorNoRotulo(rotulo: string, autor: string | null): string {
  if (!autor) return rotulo;

  const prefixo = `${autor} · `;
  return rotulo.startsWith(prefixo) ? rotulo.slice(prefixo.length) : rotulo;
}
