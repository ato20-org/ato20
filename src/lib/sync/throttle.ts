export type TrailingThrottle<T> = {
  /** Agenda ou dispara, respeitando o intervalo. */
  run: (value: T) => void;
  /** Dispara agora o que estiver pendente. */
  flush: () => void;
  cancel: () => void;
};

/**
 * Throttle que **nunca perde o último valor**.
 *
 * Um throttle comum descarta o que chega dentro da janela. Aplicado a um
 * arrasto, isso significa que a posição final do item é justamente a que se
 * perde: a mesa fica vendo a peça um passo atrás de onde o mestre soltou.
 *
 * Aqui o primeiro valor sai na hora e o último de cada janela sai no fim dela,
 * então o estado final sempre chega.
 */
export function createTrailingThrottle<T>(
  intervalMs: number,
  apply: (value: T) => void,
): TrailingThrottle<T> {
  let lastRunAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: T } | null = null;

  function fire(value: T) {
    lastRunAt = Date.now();
    apply(value);
  }

  function firePending() {
    timer = undefined;
    if (!pending) return;

    const { value } = pending;
    pending = null;
    fire(value);
  }

  return {
    run(value) {
      const elapsed = Date.now() - lastRunAt;

      if (elapsed >= intervalMs) {
        clearTimeout(timer);
        timer = undefined;
        pending = null;
        fire(value);
        return;
      }

      pending = { value };
      // Só o primeiro agendamento da janela define o instante do disparo; os
      // seguintes apenas substituem o valor pendente.
      timer ??= setTimeout(firePending, intervalMs - elapsed);
    },

    flush() {
      clearTimeout(timer);
      firePending();
    },

    cancel() {
      clearTimeout(timer);
      timer = undefined;
      pending = null;
    },
  };
}
