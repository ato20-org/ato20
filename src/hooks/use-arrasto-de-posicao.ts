"use client";

import { useRef, useState, type ComponentProps } from "react";

/**
 * Quanto uma seta anda na faixa, em segundos.
 *
 * Cinco por seta, trinta com Shift, e a faixa inteira com Home e End. Um passo
 * de um segundo obrigaria a segurar a tecla para atravessar a música.
 */
const PASSO_S = 5;
const PASSO_COM_SHIFT_S = 30;

/**
 * Acompanhar — e às vezes arrastar — a posição de uma faixa.
 *
 * Saiu de dentro do `TrackWave` quando o painel de sons ganhou uma linha por
 * canal: a onda do pé e a barrinha do painel desenham coisas diferentes, mas o
 * gesto é o mesmo, e captura de ponteiro é justamente o tipo de coisa que não
 * se quer consertar em dois lugares.
 *
 * Sem `onSeek` a barra só MOSTRA: perde o foco, o cursor e os eventos, e vira
 * um `progressbar` para o leitor de tela em vez de um controle que não faz
 * nada. É o caso do ambiente, que toca em loop — ninguém procura o instante
 * 1:12 da chuva.
 */
export function useArrastoDePosicao({
  rotulo,
  position,
  duration,
  onSeek,
}: {
  /** O que está tocando, para o leitor de tela dizer de quem é a posição. */
  rotulo: string;
  position: number;
  duration: number;
  /** Ausente = a barra só acompanha. */
  onSeek?: (segundos: number) => void;
}): {
  ref: React.RefObject<HTMLDivElement | null>;
  /** O instante a DESENHAR: o do dedo enquanto ele arrasta, o real fora disso. */
  mostrado: number;
  /** Onde ele cai na barra, de 0 a 1. */
  fracao: number;
  /** A duração já chegou. Antes dela não há fração que signifique alguma coisa. */
  conhecida: boolean;
  /** Para o `<div>` da barra. O componente põe o resto: ref, classe e filhos. */
  props: ComponentProps<"div">;
} {
  const ref = useRef<HTMLDivElement>(null);

  /**
   * Instante que o dedo está arrastando.
   *
   * Enquanto existe, manda na aparência: sem isso o `timeupdate`, que chega
   * quatro vezes por segundo, empurraria a posição de volta para debaixo do
   * cursor a cada atualização.
   */
  const [arrastando, setArrastando] = useState<number | null>(null);

  const conhecida = duration > 0;
  const navegavel = Boolean(onSeek) && conhecida;
  const mostrado = arrastando ?? position;
  const fracao = conhecida ? Math.min(1, Math.max(0, mostrado / duration)) : 0;

  function instanteDoEvento(clientX: number): number | null {
    const trilha = ref.current;
    if (!trilha || !navegavel) return null;

    const { left, width } = trilha.getBoundingClientRect();
    if (width === 0) return null;

    return Math.min(1, Math.max(0, (clientX - left) / width)) * duration;
  }

  const comum = {
    "aria-label": `Posição de ${rotulo}`,
    "aria-valuemin": 0,
    "aria-valuemax": Math.round(duration),
    "aria-valuenow": Math.round(mostrado),
    "aria-valuetext": `${Math.round(mostrado)} de ${Math.round(duration)} segundos`,
  } satisfies ComponentProps<"div">;

  // Só mostra: nada de foco nem de eventos. Um `slider` que não busca seria uma
  // promessa falsa para quem navega por teclado.
  if (!onSeek) {
    return { ref, mostrado, fracao, conhecida, props: { ...comum, role: "progressbar" } };
  }

  return {
    ref,
    mostrado,
    fracao,
    conhecida,
    props: {
      ...comum,
      // `role="slider"` de propósito. É um controle personalizado, e sem isso
      // ele seria invisível para teclado e leitor de tela — as setas movem, e é
      // a única forma de buscar sem mouse.
      //
      // Continua `slider` mesmo sem duração, e não `progressbar`: a faixa é
      // navegável, só que os metadados ainda não chegaram. `aria-disabled` diz
      // isso sem trocar o que o controle É no meio do carregamento.
      role: "slider",
      tabIndex: conhecida ? 0 : -1,
      "aria-disabled": !conhecida,

      onPointerDown: (event) => {
        if (event.button !== 0) return;

        const instante = instanteDoEvento(event.clientX);
        if (instante === null) return;

        // `setPointerCapture`: o arraste continua valendo se o cursor sair da
        // barra, que é o que acontece sempre que alguém arrasta rápido.
        event.currentTarget.setPointerCapture(event.pointerId);
        setArrastando(instante);
      },

      onPointerMove: (event) => {
        if (arrastando === null) return;

        const instante = instanteDoEvento(event.clientX);
        if (instante !== null) setArrastando(instante);
      },

      onPointerUp: (event) => {
        if (arrastando === null) return;

        event.currentTarget.releasePointerCapture(event.pointerId);
        onSeek(arrastando);
        setArrastando(null);
      },

      onKeyDown: (event) => {
        if (!conhecida) return;

        const passo = event.shiftKey ? PASSO_COM_SHIFT_S : PASSO_S;

        const alvo =
          event.key === "ArrowRight"
            ? position + passo
            : event.key === "ArrowLeft"
              ? position - passo
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? duration
                  : null;

        if (alvo === null) return;

        event.preventDefault();
        onSeek(Math.min(duration, Math.max(0, alvo)));
      },
    },
  };
}
