"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Um campo que renomeia: grava ao sair, desiste no Escape.
 *
 * As três saídas de um renome são o mesmo gesto visto de ângulos diferentes, e
 * estavam escritas em cada tela que renomeia — a linha do personagem, a da
 * aparência, o nome do grupo de retratos. Três cópias da mesma regra é a terceira
 * que um dia esquece uma das saídas, e o sintoma aparece longe da causa.
 *
 * - **Clicar fora** grava. Vale também quando o foco NÃO se move: o palco trata
 *   o `pointerdown` dele por conta própria, e o clique no mapa não tirava o foco
 *   do campo — o nome ficava por gravar, com o cursor piscando num campo já
 *   deixado para trás. Daí o ouvinte no DOCUMENTO e na CAPTURA, antes de quem
 *   quer que vá receber o gesto. É o mesmo conserto do texto do postit.
 * - **Enter** sai do campo, e quem grava é o `blur`: um caminho só para as duas
 *   saídas do teclado, em vez de duas que um dia divergem.
 * - **Escape** desiste, e o nome digitado morre ali. Sem isto o `blur` que vem
 *   atrás gravava assim mesmo, e desistir virava confirmar.
 *
 * Nome vazio ou igual ao que já era sai sem escrever: renomear para nada não é
 * um pedido, é um campo limpo por engano.
 */
export function useCampoDeNome({
  nome,
  aoGravar,
  aoSair,
}: {
  nome: string;
  aoGravar: (nome: string) => void;
  /** Chamado ao terminar, gravando ou não. É onde a tela fecha o campo. */
  aoSair?: () => void;
}) {
  /** O que está sendo digitado. `null` é "ninguém está digitando". */
  const [rascunho, setRascunho] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const desistindo = useRef(false);

  const terminar = useCallback(
    (valor: string | null) => {
      const desistiu = desistindo.current;
      desistindo.current = false;

      // `null` é "já terminou", e acontece de verdade: o clique fora grava e
      // zera o rascunho, e o `blur` que vem logo atrás chegaria aqui para
      // gravar o mesmo nome uma segunda vez.
      if (valor !== null) {
        setRascunho(null);

        const limpo = valor.trim();
        if (!desistiu && limpo && limpo !== nome) aoGravar(limpo);
      }

      aoSair?.();
    },
    [nome, aoGravar, aoSair],
  );

  useEffect(() => {
    if (rascunho === null) return;

    function foraDaqui(event: PointerEvent) {
      const alvo = event.target;
      if (!(alvo instanceof Node)) return;
      if (campo.current?.contains(alvo)) return;

      campo.current?.blur();
      terminar(rascunho);
    }

    document.addEventListener("pointerdown", foraDaqui, true);
    return () => document.removeEventListener("pointerdown", foraDaqui, true);
  }, [rascunho, terminar]);

  return {
    ref: campo,
    value: rascunho ?? nome,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setRascunho(event.target.value),
    // O `blur` é o único que grava. Os outros dois o provocam.
    onBlur: () => terminar(rascunho),
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") {
        desistindo.current = true;
        event.currentTarget.blur();
      }
    },
  };
}
