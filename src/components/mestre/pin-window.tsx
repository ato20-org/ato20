"use client";

import { useEffect, useRef } from "react";

import { PinNote } from "@/components/mestre/pin-note";
import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import {
  CARTAO_Z,
  LARGURA_PX,
  usePinWindowStore,
  type PinNoteWindow,
} from "@/lib/store/use-pin-window-store";
import type { MapPin } from "@/types/scene";

/**
 * A nota de um ponto, sobre o mapa e arrastável.
 *
 * É o único jeito de a nota aparecer: clicar no alfinete abre isto. Antes
 * havia um popover no caminho, e um botão dentro dele fixava o cartão — o
 * mesmo cartão, um passo depois. Caiu porque o uso normal é conduzir a cena
 * com a nota à vista, e mover um token, revelar uma área ou enquadrar a câmera
 * são cliques no mapa que fechavam o popover.
 *
 * ## Posição no mapa, tamanho na tela
 *
 * Vive DENTRO do palco, então sua posição é em unidades de cena e ele viaja
 * junto quando o mapa desloca ou amplia — é o que mantém a nota ao lado do
 * ponto dela em vez de parada enquanto o mapa corre por baixo.
 *
 * Mas o CONTEÚDO desfaz a ampliação do plano, então não cresce nem encolhe com
 * o zoom. As duas coisas juntas de propósito: escalar junto seria mais fiel a um
 * quadro branco, e deixaria a nota ilegível a 30% e gigantesca a 400%. O que
 * está aqui é texto de preparação para ser lido durante a sessão, não um
 * adesivo.
 *
 * ## Duas camadas, e por que não uma
 *
 * A de fora leva a POSIÇÃO, em unidade de cena; a de dentro leva o cartão, com a
 * ampliação do plano desfeita. É o mesmo arranjo das alças de transformação, e
 * não enfeite: com `transform: scale(1 / escala)` num elemento só, tudo que o
 * cartão mede por dentro é computado já multiplicado pelo `zoom` do plano, passa
 * pelo piso de um pixel, e só então o `scale` reduz de volta. A 30%, a borda de
 * 1px é computada em 0,3px, sobe para 1px no piso e volta multiplicada por 3,33.
 *
 * ## E a compensação alterna junto com o plano
 *
 * O plano amplia de duas formas -- `zoom` com a câmera parada, `transform`
 * enquanto ela se move --, e a camada de dentro desfaz a que estiver valendo.
 * Compensar sempre com `zoom` dá a geometria certa parada e erra no gesto: `zoom`
 * age no LAYOUT e `transform` não, então a conta passa a ser feita contra um
 * mecanismo que não é o que ampliou. O sintoma era o cartão se desmanchando ao
 * arrastar o mapa ou ampliar, e se recompondo assim que tudo parava.
 *
 * É a mesma alternância que o `SceneStage` faz nos dois planos, e pelo mesmo
 * motivo. Ver `ampliacaoNoLayout`.
 */
export function PinWindow({
  sceneId,
  pin,
  indice,
  nota,
  escala,
  /** Posição na pilha de notas abertas; 0 é a mais atrás. */
  ordem,
}: {
  sceneId: string;
  pin: MapPin;
  indice: number;
  nota: PinNoteWindow;
  escala: number;
  ordem: number;
}) {
  const startDrag = useSceneDrag();
  const { ampliacaoNoLayout } = useSceneScale();

  const cartao = useRef<HTMLDivElement>(null);

  /**
   * Tocar em qualquer lugar fora do cartão tira o foco dos campos dele.
   *
   * O navegador faria isso sozinho, e não faz: o `preventDefault` do
   * `useSceneDrag` existe para o arrasto não arrastar seleção de texto, e como
   * efeito colateral o foco não se move. Então deslocar o mapa, pegar um token
   * ou marcar vários no vazio deixava o cursor piscando dentro da nota -- e o
   * que se digitasse depois, inclusive atalho de tecla, ia para o campo em vez
   * de ir para o palco. É o mesmo remédio que o papel do postit já toma, pela
   * mesma razão, e lá está a nota longa sobre o porquê.
   *
   * Na CAPTURA, e no documento: o gesto tem de ser lido antes de quem quer que
   * o receba, e "fora do cartão" inclui a barra de ferramentas, os painéis
   * laterais e qualquer coisa que nem esteja no palco.
   *
   * Sem guarda de "está focado": a condição é lida do próprio documento a cada
   * gesto, e um cartão sem foco nenhum não faz nada aqui. Guardá-la em estado
   * custaria um render por entrada e saída de campo para poupar um `contains`.
   */
  useEffect(() => {
    function foraDaqui(event: PointerEvent) {
      const alvo = event.target;
      if (!(alvo instanceof Node)) return;
      if (cartao.current?.contains(alvo)) return;

      const ativo = document.activeElement;
      if (ativo instanceof HTMLElement && cartao.current?.contains(ativo))
        ativo.blur();
    }

    document.addEventListener("pointerdown", foraDaqui, true);

    return () => document.removeEventListener("pointerdown", foraDaqui, true);
  }, []);

  const mover = usePinWindowStore((state) => state.mover);
  const guardar = usePinWindowStore((state) => state.guardar);
  const fechar = usePinWindowStore((state) => state.fechar);
  const trazerPraFrente = usePinWindowStore((state) => state.trazerPraFrente);

  return (
    <div
      className="absolute"
      style={{
        // O deslocamento é em pixels de tela e a posição em unidades de cena:
        // dividir pela escala é a conversão entre os dois.
        left: pin.x + nota.dx / escala,
        top: pin.y + nota.dy / escala,
        zIndex: CARTAO_Z + ordem,
      }}
      // Mexer em qualquer lugar do cartão o traz para a frente. É o que se
      // espera, e sem isso duas notas sobrepostas obrigariam a achar uma alça
      // específica para desempilhar.
      //
      // Na fase de captura, para acontecer antes do arrasto do cabeçalho — que
      // chama `stopPropagation`.
      onPointerDownCapture={() => trazerPraFrente(pin.id)}
    >
      <div
        ref={cartao}
        // `pointer-events-auto` porque o plano dos controles desliga o ponteiro
        // para não cobrir o mapa, que mora no plano de baixo. A regra do
        // `globals.css` religa só `button`, `a`, `input` e `textarea` -- o que
        // deixava o cartão com os campos e os botões vivos e o resto morto.
        //
        // O cabeçalho é a alça de arrasto e é uma `div`, então ele caía
        // justamente no lado morto: o cartão não tinha como ser movido, e o
        // clique que o traz para a frente só chegava quando se acertava um
        // campo. É o mesmo `pointer-events-auto` que o papel do postit declara,
        // pela mesma razão.
        // O mesmo cromo da janela da bancada (`InnerWindow`): fundo, borda,
        // canto e sombra iguais, sem padding aqui -- o cabeçalho colado na
        // borda e o corpo com o próprio recuo são do `PinNote`. O cartão do
        // ponto já era uma janela em tudo menos na cara, e duas caras para a
        // mesma coisa faziam o mestre procurar o X em lugares diferentes.
        className="bg-popover text-popover-foreground pointer-events-auto flex flex-col overflow-hidden rounded-lg border shadow-2xl"
        style={{
          width: LARGURA_PX,
          // A partir do canto de cima quando é `transform`: com a origem no
          // centro, mudar o zoom moveria o cartão além de redimensioná-lo, e o
          // `left`/`top` de fora deixaria de apontar para o canto dele.
          ...(ampliacaoNoLayout
            ? emPixelDeTela(escala)
            : { transform: `scale(${1 / escala})`, transformOrigin: "0 0" }),
        }}
      >
        <PinNote
          sceneId={sceneId}
          pin={pin}
          indice={indice}
          onClose={() => fechar(pin.id)}
          onArrastar={(event) => {
            // O cabeçalho é a alça, mas contém o campo de título e os botões.
            // Sem esta guarda, tentar posicionar o cursor no meio do título
            // arrastaria o cartão e o clique nunca chegaria ao campo.
            if ((event.target as HTMLElement).closest("input, button, textarea"))
              return;

            const origem = { dx: nota.dx, dy: nota.dy };

            startDrag(event, {
              // `delta` vem em unidades de cena; o deslocamento guardado é em
              // pixels de tela. Multiplicar pela escala fecha a conta, e é o
              // que faz o cartão seguir o cursor na mesma velocidade em
              // qualquer zoom.
              onMove: (delta) =>
                mover(
                  pin.id,
                  origem.dx + delta.x * escala,
                  origem.dy + delta.y * escala,
                ),
              // Só no fim: é aqui que a posição passa a valer para as próximas
              // aberturas deste ponto. Guardar a cada quadro do arrasto seriam
              // dezenas de escritas em disco por gesto.
              onEnd: () => guardar(pin.id),
            });
          }}
        />
      </div>
    </div>
  );
}
