"use client";

import { useRef } from "react";

/**
 * Renomear a partir de um item de menu, sem o campo morrer no mesmo quadro.
 *
 * O botão "Renomear" do menu de contexto não fazia nada, e a causa não estava
 * no botão: quem renomeia troca a linha por um `<input autoFocus>`, e essa
 * troca DESMONTA o menu — o gatilho dos três pontos vive no ramo que sai do ar.
 * Ao fechar, o menu devolve o foco ao gatilho que já não existe; o foco cai no
 * corpo do documento, o campo recebe `blur`, e o `blur` confirma e sai. O campo
 * nascia e morria entre dois quadros, e o que se via era um clique sem efeito.
 *
 * Renomear por duplo clique sempre funcionou, e é a prova: lá não há menu no
 * caminho.
 *
 * A saída é ESPERAR o menu terminar de fechar antes de trocar a linha pelo
 * campo. `onOpenChangeComplete` é o aviso de que a saída acabou — depois dele o
 * foco já foi devolvido, e o campo que nascer a seguir fica com ele.
 *
 * Referência e não estado: o pedido vive entre o clique e o fim da animação de
 * fechamento, e ninguém desenha nada com ele.
 */
export function useRenomearPeloMenu(comecar: () => void) {
  const pedido = useRef(false);

  return {
    /** No `onClick` do item do menu, no lugar de começar a renomear. */
    pedir: () => {
      pedido.current = true;
    },
    /** No `onOpenChangeComplete` do menu que tem o item. */
    aoFechar: (aberto: boolean) => {
      if (aberto || !pedido.current) return;

      pedido.current = false;
      comecar();
    },
  };
}

/**
 * F2 renomeia.
 *
 * A convenção do gerenciador de arquivos, e a mesma em toda a aplicação: cena,
 * pasta do acervo, marcador de livro. Existe porque renomear estava escondido
 * atrás de duplo clique ou de um menu de três pontos que só aparece no hover —
 * quem navega por teclado não alcançava nem um nem outro.
 *
 * `preventDefault` porque F2 não tem uso de navegador a preservar aqui, e sem
 * ele algumas webviews levam o foco embora junto.
 */
export function aoApertarF2(comecar: () => void) {
  return (evento: React.KeyboardEvent) => {
    if (evento.key !== "F2") return;

    evento.preventDefault();
    comecar();
  };
}
