"use client";

import { useRef } from "react";

import { useScreenDrag } from "@/hooks/use-screen-drag";
import { cn } from "@/lib/utils";

/**
 * A divisão entre duas regiões, arrastável.
 *
 * Fina e sem preenchimento até o ponteiro chegar: uma faixa visível entre cada
 * par de regiões viraria uma grade cinza atravessando a tela, e o que ela
 * precisa é ser encontrável, não vista. A área de acerto é maior que o traço —
 * `-m` negativa avança sobre as duas vizinhas, senão pegar uma linha de 1 pixel
 * seria pontaria.
 *
 * Não guarda o tamanho: reporta o arrasto em pixels de tela e quem decide o que
 * fazer com eles é o store, que sabe se aquilo é largura em pixels (coluna) ou
 * fração de altura (grupos). Um divisor que soubesse a diferença precisaria de
 * dois modos.
 */
export function Splitter({
  direcao,
  rotulo,
  aoArrastar,
  aoSoltar,
}: {
  /** `vertical` divide lado a lado (move largura); `horizontal`, empilhado. */
  direcao: "vertical" | "horizontal";
  rotulo: string;
  /** Delta acumulado desde o começo do gesto, em pixels de tela. */
  aoArrastar: (delta: { x: number; y: number }) => void;
  aoSoltar: () => void;
}) {
  const startDrag = useScreenDrag();

  /**
   * Se o gesto já mexeu em algo.
   *
   * Existe para o clique seco não gravar: `aoSoltar` grava no disco, e um
   * toque sem arrasto — que acontece ao encostar no divisor procurando o
   * cursor — seria uma escrita em `localStorage` sem nada para escrever.
   */
  const mexeu = useRef(false);

  return (
    <div
      role="separator"
      aria-orientation={direcao}
      aria-label={rotulo}
      className={cn(
        "hover:bg-primary/40 active:bg-primary/60 relative z-10 shrink-0 touch-none transition-colors",
        direcao === "vertical"
          ? "-mx-0.5 w-1 cursor-col-resize"
          : "-my-0.5 h-1 cursor-row-resize",
      )}
      onPointerDown={(event) => {
        mexeu.current = false;

        startDrag(event, {
          onMove: (delta) => {
            mexeu.current = true;
            aoArrastar(delta);
          },
          onEnd: () => {
            if (mexeu.current) aoSoltar();
          },
        });
      }}
    />
  );
}
