import { DOCUMENTO_FONTES } from "@/types/scene";

/**
 * Um degrau na escada de tamanhos de letra -- a do cartão de nota, que o postit
 * usa também.
 *
 * Uma função só para os três caminhos que sobem e descem a letra: os botões
 * A↑/A↓ do postit, os do cartão, e o Ctrl+= / Ctrl+- com o papel na mão. Eram
 * duas cópias da mesma conta, e uma terceira no atalho faria o teclado e o
 * botão darem saltos diferentes no dia em que alguém mexesse numa delas.
 *
 * O postit colado antes da escada está em 15, que não é degrau: o primeiro
 * toque leva para um degrau e de lá o gesto anda de um em um. Nas pontas a
 * escada para -- o degrau devolvido é o mesmo.
 */
export function degrauDeFonte(fonte: number, sentido: 1 | -1): number {
  const indice = DOCUMENTO_FONTES.findIndex((f) => f >= fonte);
  const atual = indice === -1 ? DOCUMENTO_FONTES.length - 1 : indice;
  const proximo = Math.min(
    Math.max(atual + sentido, 0),
    DOCUMENTO_FONTES.length - 1,
  );

  return DOCUMENTO_FONTES[proximo]!;
}
