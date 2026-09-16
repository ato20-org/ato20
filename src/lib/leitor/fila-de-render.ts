/**
 * A fila dos pedidos de desenho ao worker do pdf.js.
 *
 * O worker desenha uma pagina por vez, e antes desta fila cada folha em vista
 * pedia a sua assim que entrava: num degrau de zoom eram doze pedidos de uma
 * vez, e a pagina sob os olhos esperava atras das outras onze. Medido no
 * cenario `leitor` do `/perf`, pagina 21 a 300%: 391 ms ate a pagina lida,
 * 730 ms ate todas -- e a lida nao era a primeira a chegar.
 *
 * Aqui os pedidos entram com uma PRIORIDADE (a distancia ate a pagina que o
 * mestre esta lendo) e saem na ordem dela. Nao decodifica um pixel a menos;
 * muda o que chega primeiro, que e o que a mesa percebe.
 *
 * Concorrencia 1, e foi medido: com 2 em voo a pagina lida ficou DUAS vezes
 * mais lenta (78 -> 167 ms a 200%, 82 -> 173 ms a 300%), porque o segundo
 * pedido disputa o worker com ela, e o tempo ate todas nao mudou. A hipotese
 * de a thread principal pintar um canvas enquanto o worker decodifica o
 * proximo nao paga: o gargalo e o worker, nao a pintura.
 *
 * Modulo puro, sem DOM e sem pdf.js: e o que permite testa-lo no vitest.
 */

export type Cancelar = () => void;

type Pedido = {
  chave: string;
  prioridade: number;
  /** Ordem de chegada, para desempatar prioridades iguais sem embaralhar. */
  ordem: number;
  executar: () => Promise<unknown>;
};

export type FilaDeRender = {
  /**
   * Enfileira. Devolve como desistir: antes de comecar, o pedido sai da fila;
   * depois, quem cancela e o proprio `executar` (a `RenderTask` do pdf.js), e
   * a fila so espera ele terminar.
   */
  pedir: (chave: string, prioridade: number, executar: () => Promise<unknown>) => Cancelar;
  /** Muda a prioridade de quem ainda espera. Quem ja comecou nao volta. */
  repriorizar: (chave: string, prioridade: number) => void;
  /** Quantos esperam. Para o teste e para o HUD. */
  esperando: () => number;
  /** Quantos estao em voo. */
  emVoo: () => number;
};

export function criarFila(concorrencia = 1): FilaDeRender {
  const espera: Pedido[] = [];
  let ativos = 0;
  let sequencia = 0;

  const proximo = () => {
    if (ativos >= concorrencia || espera.length === 0) return;

    // O menor numero primeiro; empate pela chegada. A fila e curta -- uma
    // duzia de folhas --, e uma varredura por saida custa menos que manter um
    // heap para isso.
    let escolhido = 0;
    for (let i = 1; i < espera.length; i += 1) {
      const a = espera[i];
      const b = espera[escolhido];
      if (a.prioridade < b.prioridade || (a.prioridade === b.prioridade && a.ordem < b.ordem)) {
        escolhido = i;
      }
    }

    const [pedido] = espera.splice(escolhido, 1);
    ativos += 1;

    // Rejeicao e caminho normal: cancelar uma `RenderTask` rejeita a promessa
    // dela, e isso nao pode parar a fila.
    void pedido.executar().then(terminou, terminou);
  };

  const terminou = () => {
    ativos -= 1;
    proximo();
  };

  return {
    pedir(chave, prioridade, executar) {
      const pedido: Pedido = { chave, prioridade, ordem: sequencia++, executar };
      espera.push(pedido);
      // Sincrono: com o worker livre, o primeiro pedido nao espera um tick.
      proximo();

      return () => {
        const i = espera.indexOf(pedido);
        if (i !== -1) espera.splice(i, 1);
      };
    },

    repriorizar(chave, prioridade) {
      for (const pedido of espera) {
        if (pedido.chave === chave) pedido.prioridade = prioridade;
      }
    },

    esperando: () => espera.length,
    emVoo: () => ativos,
  };
}

/** A fila do leitor: uma so, porque o worker e um so. */
export const filaDoLeitor = criarFila(1);
