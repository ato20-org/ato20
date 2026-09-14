"use client";

import { useRef, useState } from "react";
import { GripHorizontal, GripVertical } from "lucide-react";

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
 * Encontrável passou a ser uma alça de verdade, e não só um realce de fundo: a
 * pílula com o traço aparece quando a mão chega perto e diz, sem texto, que
 * aquilo se arrasta e para que lado. Ela aparece por APROXIMAÇÃO justamente
 * para a regra do parágrafo acima continuar valendo — em repouso, a tela segue
 * sem grade nenhuma.
 *
 * Não guarda o tamanho: reporta o arrasto em pixels de tela e quem decide o que
 * fazer com eles é o store, que sabe se aquilo é largura em pixels (coluna) ou
 * fração de altura (grupos). Um divisor que soubesse a diferença precisaria de
 * dois modos.
 */
export function Splitter({
  direcao,
  rotulo,
  aparente = false,
  aoArrastar,
  aoSoltar,
}: {
  /** `vertical` divide lado a lado (move largura); `horizontal`, empilhado. */
  direcao: "vertical" | "horizontal";
  rotulo: string;
  /**
   * Acende a alça sem o ponteiro estar em cima dela.
   *
   * Quem decide é a COLUNA: encostar em qualquer lugar dela acende os divisores
   * que ela tem. Aproximar-se de um fio de 16 pixels ainda era pontaria -- e a
   * alça existe justamente para quem não sabe que há divisor ali, que é quem
   * nunca vai passar o ponteiro por cima dele por acaso.
   */
  aparente?: boolean;
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

  /**
   * Se o gesto está em curso.
   *
   * Estado, e não só `:active`: o ponteiro sai da faixa assim que o arrasto
   * começa a valer -- é esse o objetivo dele --, e `:active` de CSS acompanha o
   * elemento sob o cursor, não o gesto. Sem isto a alça apagava no primeiro
   * pixel de movimento.
   */
  const [arrastando, setArrastando] = useState(false);

  const Grip = direcao === "vertical" ? GripVertical : GripHorizontal;

  return (
    <div
      role="separator"
      aria-orientation={direcao}
      aria-label={rotulo}
      data-arrastando={arrastando ? "" : undefined}
      data-aparente={aparente ? "" : undefined}
      className={cn(
        "group hover:bg-primary/40 active:bg-primary/60 data-arrastando:bg-primary/60 relative z-10 flex shrink-0 touch-none items-center justify-center transition-colors",
        // Dez pixels de espaço PRÓPRIO, e nenhuma margem negativa.
        //
        // A margem negativa era o defeito: ela fazia a faixa avançar sobre os
        // dois vizinhos, e o que estava na beirada deles -- o topo da tira de
        // abas de baixo -- ficava debaixo do divisor. Com espaço próprio, o
        // divisor não empresta pixel de ninguém, e a alça tem folga para caber
        // inteira sem encostar no que vem depois.
        //
        // O alcance não depende mais da largura desta faixa: a alça acende com
        // o ponteiro em qualquer lugar da coluna, e o alvo do arrasto é ELA.
        direcao === "vertical"
          ? "w-2.5 cursor-col-resize"
          : "h-2.5 cursor-row-resize",
      )}
      onPointerDown={(event) => {
        mexeu.current = false;
        setArrastando(true);

        startDrag(event, {
          onMove: (delta) => {
            mexeu.current = true;
            aoArrastar(delta);
          },
          onEnd: () => {
            setArrastando(false);
            if (mexeu.current) aoSoltar();
          },
        });
      }}
    >
      {/* A alça, que só aparece quando a mão chega perto.

          Some em repouso porque uma pílula em cada divisor seria uma grade
          atravessando a tela: com as duas colunas cheias são cinco divisores, e
          cinco alças acesas competem com o mapa, que é o que o mestre está
          olhando.

          Pega o arrasto quando está À VISTA, e só então: o `pointerdown` nela
          borbulha para a faixa, que é quem escuta. Apagada ela volta a ser
          `pointer-events-none` -- uma alça invisível capturando clique seria o
          mesmo defeito da faixa larga, escondido.

          Continua acesa enquanto arrasta -- o ponteiro sai da faixa no meio do
          gesto, e a alça apagando no meio do arrasto pareceria ter soltado. */}
      <span
        aria-hidden
        className={cn(
          "bg-muted text-muted-foreground pointer-events-none absolute grid place-items-center rounded-full border opacity-0 shadow-sm transition-opacity",
          "group-hover:pointer-events-auto group-hover:opacity-100",
          "group-data-aparente:pointer-events-auto group-data-aparente:opacity-100",
          "group-data-arrastando:pointer-events-auto group-data-arrastando:opacity-100",
          "motion-reduce:transition-none",
          direcao === "vertical" ? "h-7 w-3.5" : "h-3.5 w-7",
        )}
      >
        <Grip className="size-3" />
      </span>
    </div>
  );
}
