"use client";

type Ponto = { x: number; y: number };
type Conversor = (clientX: number, clientY: number) => Ponto;

let naTela: { clientX: number; clientY: number } | null = null;
let conversor: Conversor | null = null;

/**
 * Onde o mouse está sobre o palco do Mestre, para quem age por tecla.
 *
 * O atalho não recebe evento de ponteiro: o N chega pelo `keydown`, e o
 * teclado não sabe onde o mouse está. O palco anota a posição de TELA a cada
 * movimento, e a conversão para a cena só acontece na hora da tecla -- com a
 * caixa do plano daquele instante, e não a do último movimento: entre um e
 * outro a roda pode ter ampliado o palco sem o mouse sair do lugar.
 *
 * Variável de módulo, e não store: ninguém desenha a partir disto, e um
 * `setState` por movimento de mouse acordaria quem assinasse sem motivo.
 */
export function anotarPonteiro(clientX: number, clientY: number): void {
  naTela = { clientX, clientY };
}

/** O mouse saiu do palco -- para a coluna, para uma janela por cima. */
export function esquecerPonteiro(): void {
  naTela = null;
}

/**
 * O palco registra o `toScene` dele. Devolve a limpeza, para o efeito que
 * registra desfazer só o próprio registro, e não o de um palco que já o
 * substituiu.
 */
export function registrarConversor(novo: Conversor): () => void {
  conversor = novo;
  return () => {
    if (conversor === novo) conversor = null;
  };
}

/** O ponto da cena sob o mouse, ou `null` se ele não está sobre o palco. */
export function ponteiroNaCena(): Ponto | null {
  if (!naTela || !conversor) return null;
  return conversor(naTela.clientX, naTela.clientY);
}

/**
 * Onde o mouse está, em pixel de TELA, ou `null` fora do palco. Para quem
 * desenha controle na tela no lugar do cursor -- a roda de pings do `'`.
 */
export function ponteiroNaTela(): { x: number; y: number } | null {
  return naTela ? { x: naTela.clientX, y: naTela.clientY } : null;
}
