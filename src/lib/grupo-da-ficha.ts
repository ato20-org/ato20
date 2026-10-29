import { lembrar } from "@/lib/aba-da-ficha";

/**
 * O último item da barra lateral que cada ficha mostrou: um grupo de detalhes
 * (Identidade, Perícias) ou `""`, o Principal. Ver `AbaFicha`.
 *
 * Por personagem e em `localStorage`, pelas razões da aba da ficha (ver
 * `aba-da-ficha.ts`): o mestre que conferia as perícias do Edgar volta a elas,
 * e a Mira abre em Identidade. Guarda a CHAVE do nome do grupo, e não o id: o
 * grupo que só a ficha conhece não tem id estável, e o renomeado cai no
 * primeiro, que é um estado válido.
 */
const CHAVE_DISCO = "ato20:grupo-da-ficha";

type Lembrados = Record<string, string>;

let cache: Lembrados | null = null;

/** O texto do disco como mapa. O que não for texto sai. */
export function lerGruposLembrados(cru: string | null): Lembrados {
  if (!cru) return {};

  try {
    const valor: unknown = JSON.parse(cru);
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};

    return Object.fromEntries(
      Object.entries(valor).filter((par): par is [string, string] => typeof par[1] === "string"),
    );
  } catch {
    return {};
  }
}

function lembradosDoDisco(): Lembrados {
  if (cache) return cache;

  try {
    cache = lerGruposLembrados(localStorage.getItem(CHAVE_DISCO));
  } catch {
    cache = {};
  }
  return cache;
}

/** A chave do grupo em que esta ficha deve abrir, se alguma foi lembrada. */
export function grupoLembrado(personagemId: string): string | undefined {
  return lembradosDoDisco()[personagemId];
}

export function lembrarGrupo(personagemId: string, grupo: string): void {
  cache = lembrar(lembradosDoDisco(), personagemId, grupo);

  try {
    localStorage.setItem(CHAVE_DISCO, JSON.stringify(cache));
  } catch {
    // Sem disco o grupo vale só nesta sessão.
  }
}
