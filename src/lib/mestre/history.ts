export type History<T> = {
  /** Estados anteriores, do mais antigo para o mais recente. */
  past: T[];
  /** Estados desfeitos, disponíveis para refazer. */
  future: T[];
};

export const EMPTY_HISTORY: History<never> = { past: [], future: [] };

/** Teto de entradas. Um board inteiro por passo, e memória não é infinita. */
export const HISTORY_LIMIT = 60;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/**
 * Registra um estado anterior.
 *
 * `coalesce` funde a mudança na entrada que já está no topo em vez de criar
 * outra. É o que faz um arrasto inteiro virar **um** passo de desfazer: sem
 * isso, mover uma peça por dois segundos empilharia uma centena de entradas, e
 * Ctrl+Z voltaria um frame por vez.
 *
 * O futuro é sempre descartado — editar depois de desfazer abandona o galho
 * que havia sido desfeito.
 */
export function pushHistory<T>(
  history: History<T>,
  snapshot: T,
  coalesce: boolean,
  limit = HISTORY_LIMIT,
): History<T> {
  if (coalesce && history.past.length > 0) {
    // A entrada do topo já guarda o estado de antes do gesto, que é
    // exatamente onde o desfazer tem de voltar.
    return { past: history.past, future: [] };
  }

  const past = [...history.past, snapshot];

  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    future: [],
  };
}

export type Step<T> = { history: History<T>; value: T };

/** `null` quando não há para onde voltar. */
export function undoStep<T>(history: History<T>, current: T): Step<T> | null {
  const previous = history.past.at(-1);
  if (previous === undefined) return null;

  return {
    value: previous,
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, current],
    },
  };
}

/** `null` quando não há o que refazer. */
export function redoStep<T>(history: History<T>, current: T): Step<T> | null {
  const next = history.future.at(-1);
  if (next === undefined) return null;

  return {
    value: next,
    history: {
      past: [...history.past, current],
      future: history.future.slice(0, -1),
    },
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}
