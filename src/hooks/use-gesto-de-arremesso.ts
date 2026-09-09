"use client";

import { useCallback, type PointerEvent as ReactPointerEvent } from "react";

import { useScreenDrag } from "@/hooks/use-screen-drag";

/**
 * Quanto o dedo tem de andar para o gesto ser pegar-e-arremessar, e não clicar.
 *
 * Quatro pixels ficam abaixo do que a mão percebe como movimento, então o
 * clique continua sendo clique mesmo com o tremor de quem clica com pressa.
 */
const LIMIAR = 4;

/**
 * A janela de tempo que decide a força do arremesso, em milissegundos.
 *
 * Uma JANELA e não os dois últimos eventos: a diferença entre dois quadros
 * consecutivos é ruído puro — um tremor de mão de dois pixels em dezesseis
 * milésimos vira cento e vinte e cinco pixels por segundo de "arremesso".
 * Noventa milésimos são uns cinco ou seis quadros, tempo suficiente para a
 * intenção aparecer e curto o bastante para não incluir a parte do arrasto em
 * que a mão ainda estava vindo.
 */
const JANELA = 90;

type Gesto = {
  /** Passou do limiar: o dado saiu do lugar e está na mão, em pixel de tela. */
  onPegar: (clientX: number, clientY: number) => void;
  /** A mão andou. Também em pixel de tela. */
  onMover: (clientX: number, clientY: number) => void;
  /** Soltou depois de ter pegado. Velocidade em pixel de tela por segundo. */
  onSoltar: (vx: number, vy: number) => void;
  /** Soltou sem nunca ter passado do limiar. */
  onClique: () => void;
};

/**
 * Pegar um dado e arremessar.
 *
 * Um hook e não dois trechos parecidos porque há dois lugares de onde se pega um
 * dado — do saquinho e da própria mesa — e os dois têm de ter o MESMO tato. Um
 * limiar diferente ou uma janela diferente num deles apareceria como "o dado da
 * mesa é mais escorregadio que o do saquinho", que é o tipo de diferença que se
 * sente sem conseguir nomear.
 *
 * O tempo vem do `timeStamp` do EVENTO, não do relógio de quando o código
 * rodou: o `useScreenDrag` entrega um movimento por quadro e o mouse manda
 * vários agrupados no mesmo quadro, então medir pelo tratador atribuiria a um
 * quadro o tempo de todos eles e subestimaria a força.
 */
export function useGestoDeArremesso() {
  const screenDrag = useScreenDrag();

  return useCallback(
    (event: ReactPointerEvent, gesto: Gesto) => {
      const rastro: Array<{ t: number; x: number; y: number }> = [
        { t: event.timeStamp, x: event.clientX, y: event.clientY },
      ];
      let pegou = false;

      const velocidade = () => {
        const fim = rastro[rastro.length - 1];
        const inicio = rastro.find((amostra) => fim.t - amostra.t <= JANELA);

        /**
         * Nenhuma amostra dentro da janela: a mão estava PARADA quando soltou.
         *
         * Parado é largar, não arremessar, e zero é a resposta certa. Havia um
         * `?? rastro[0]` aqui, e ele mentia exatamente neste caso: sem amostra
         * recente, caía na PRIMEIRA do gesto e media o arrasto inteiro como se
         * tivesse acontecido no último instante — segurar o dado quieto sobre o
         * alvo e soltar arremessava o dado para trás, na direção de onde a mão
         * tinha vindo.
         */
        if (!inicio || inicio === fim) return { vx: 0, vy: 0 };

        const dt = (fim.t - inicio.t) / 1000;
        if (dt < 0.001) return { vx: 0, vy: 0 };

        return { vx: (fim.x - inicio.x) / dt, vy: (fim.y - inicio.y) / dt };
      };

      screenDrag(event, {
        onMove: (delta, native) => {
          if (!pegou) {
            if (Math.hypot(delta.x, delta.y) < LIMIAR) return;

            pegou = true;
            gesto.onPegar(native.clientX, native.clientY);
          }

          rastro.push({ t: native.timeStamp, x: native.clientX, y: native.clientY });
          // Doze amostras cobrem a janela com folga a sessenta quadros. Guardar o
          // arrasto inteiro seria uma lista que cresce enquanto o dedo não solta.
          if (rastro.length > 12) rastro.shift();

          gesto.onMover(native.clientX, native.clientY);
        },
        onEnd: (native) => {
          if (!pegou) {
            gesto.onClique();
            return;
          }

          // A soltura entra no rastro como amostra própria. É ela que faz uma mão
          // parada medir zero: se o último movimento foi há mais que a janela,
          // não há com o que comparar, e não houve arremesso nenhum.
          rastro.push({ t: native.timeStamp, x: native.clientX, y: native.clientY });

          const { vx, vy } = velocidade();
          gesto.onSoltar(vx, vy);
        },
      });
    },
    [screenDrag],
  );
}
