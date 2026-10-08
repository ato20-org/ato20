/**
 * A última aba que cada ficha mostrou.
 *
 * POR PERSONAGEM, ao contrário das seções fechadas (ver `useSecoesStore`): a
 * seção fechada é arrumação da mão -- "eu não uso Arquivos" vale para todas --,
 * e a aba é onde se parou NAQUELE personagem. O mestre que conferia o
 * inventário do Edgar e foi abrir a Mira para ver a vida dela volta ao Edgar no
 * inventário, e a Mira na Ficha.
 *
 * Em `localStorage`, como a posição das janelas: é memória de bancada, e não
 * arquivo de campanha. Lido na hora em que a ficha abre, e não por um store
 * hidratado num efeito: hidratar depois do primeiro render faria a ficha nascer
 * na aba Ficha e pular para a lembrada um quadro depois.
 */
export type AbaDaFicha = "ficha" | "inventario" | "arquivos";

export const ABAS_DA_FICHA: readonly AbaDaFicha[] = [
  "ficha",
  "inventario",
  "arquivos",
];

const CHAVE_DISCO = "ato20:aba-da-ficha";

/**
 * Quantas fichas lembram a aba.
 *
 * A chave é uma só para todas as campanhas e os ids são uuid, então a lista
 * cresceria para sempre com personagens que já não existem -- o mesmo teto da
 * posição das janelas.
 */
export const LEMBRADAS = 100;

/** Id do personagem para a aba, da mais antiga para a mais recente. */
export type Lembradas = Record<string, AbaDaFicha>;

/** O texto do disco como mapa. O que não for aba conhecida sai. */
export function lerLembradas(cru: string | null): Lembradas {
  if (!cru) return {};

  try {
    const valor: unknown = JSON.parse(cru);
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};

    const lidas: Lembradas = {};
    for (const [id, aba] of Object.entries(valor)) {
      if (ABAS_DA_FICHA.includes(aba as AbaDaFicha)) {
        lidas[id] = aba as AbaDaFicha;
      }
    }
    return lidas;
  } catch {
    // Chave escrita à mão ou JSON quebrado: toda ficha volta à aba Ficha, que
    // é um estado válido, em vez de a janela não abrir.
    return {};
  }
}

/**
 * O mapa com esta ficha lembrada, e no fim da fila.
 *
 * Tirar e repor é o que faz a ordem de inserção valer como "mais recente por
 * último", e o corte do teto levar as que não se abrem há mais tempo.
 */
export function lembrar(
  lembradas: Lembradas,
  personagemId: string,
  aba: AbaDaFicha,
): Lembradas {
  const resto = Object.entries(lembradas).filter(([id]) => id !== personagemId);
  const ordem = [...resto, [personagemId, aba] as const];

  return Object.fromEntries(ordem.slice(-LEMBRADAS));
}

/**
 * A cópia do disco nesta sessão.
 *
 * Lida na primeira pergunta, e não na carga do módulo: este arquivo entra no
 * build estático, onde `localStorage` não existe.
 */
let cache: Lembradas | null = null;

function lembradasDoDisco(): Lembradas {
  if (cache) return cache;

  try {
    cache = lerLembradas(localStorage.getItem(CHAVE_DISCO));
  } catch {
    cache = {};
  }
  return cache;
}

/** A aba em que esta ficha deve abrir. */
export function abaLembrada(personagemId: string): AbaDaFicha {
  return lembradasDoDisco()[personagemId] ?? "ficha";
}

/** Grava a aba desta ficha. */
export function lembrarAba(personagemId: string, aba: AbaDaFicha): void {
  cache = lembrar(lembradasDoDisco(), personagemId, aba);

  try {
    localStorage.setItem(CHAVE_DISCO, JSON.stringify(cache));
  } catch {
    // Sem disco a aba vale só nesta sessão, e isso é melhor que a troca de
    // aba falhar.
  }
}
