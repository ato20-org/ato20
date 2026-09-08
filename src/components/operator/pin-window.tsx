"use client";

import { PinNote } from "@/components/operator/pin-note";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import {
  CARTAO_Z,
  LARGURA_PX,
  usePinWindowStore,
  type PinNoteWindow,
} from "@/lib/store/use-pin-window-store";
import type { MapPin } from "@/types/scene";

/**
 * A nota de um ponto, fixa sobre o mapa e arrastável.
 *
 * O `Popover` do alfinete serve a olhada rápida — abre, lê, fecha ao clicar
 * fora. Este cartão serve o outro uso, que é conduzir a cena com a nota à
 * vista: ali o mestre move tokens, revela áreas e enquadra a câmera, e cada um
 * desses cliques fecharia o popover.
 *
 * ## Posição no mapa, tamanho na tela
 *
 * Vive DENTRO do palco, então sua posição é em unidades de cena e ele viaja
 * junto quando o mapa desloca ou amplia — é o que mantém a nota ao lado do
 * ponto dela em vez de parada enquanto o mapa corre por baixo.
 *
 * Mas ele desfaz a escala do palco (`scale(1/escala)`), então não cresce nem
 * encolhe com o zoom. As duas coisas juntas de propósito: escalar junto seria
 * mais fiel a um quadro branco, e deixaria a nota ilegível a 30% e gigantesca
 * a 400%. O que está aqui é texto de preparação para ser lido durante a
 * sessão, não um adesivo.
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

  const mover = usePinWindowStore((state) => state.mover);
  const fechar = usePinWindowStore((state) => state.fechar);
  const trazerPraFrente = usePinWindowStore((state) => state.trazerPraFrente);

  return (
    <div
      className="bg-popover text-popover-foreground absolute rounded-lg border p-3 shadow-lg"
      style={{
        // O deslocamento é em pixels de tela e a posição em unidades de cena:
        // dividir pela escala é a conversão entre os dois.
        left: pin.x + nota.dx / escala,
        top: pin.y + nota.dy / escala,
        width: LARGURA_PX,
        // Desfaz a escala do palco a partir do canto de cima: com a origem no
        // centro, mudar o zoom moveria o cartão além de redimensioná-lo, e
        // `left`/`top` deixariam de apontar para o canto dele.
        transform: `scale(${1 / escala})`,
        transformOrigin: "0 0",
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
      <PinNote
        sceneId={sceneId}
        pin={pin}
        indice={indice}
        onClose={() => fechar(pin.id)}
        onDesafixar={() => fechar(pin.id)}
        onArrastar={(event) => {
          // O cabeçalho é a alça, mas contém o campo de título e os botões. Sem
          // esta guarda, tentar posicionar o cursor no meio do título
          // arrastaria o cartão e o clique nunca chegaria ao campo.
          if ((event.target as HTMLElement).closest("input, button, textarea")) return;

          const origem = { dx: nota.dx, dy: nota.dy };

          startDrag(event, {
            // `delta` vem em unidades de cena; o deslocamento guardado é em
            // pixels de tela. Multiplicar pela escala fecha a conta, e é o que
            // faz o cartão seguir o cursor na mesma velocidade em qualquer
            // zoom.
            onMove: (delta) =>
              mover(pin.id, origem.dx + delta.x * escala, origem.dy + delta.y * escala),
          });
        }}
      />
    </div>
  );
}
