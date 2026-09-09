"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { PinTethers } from "@/components/operator/pin-tethers";
import { PinWindow } from "@/components/operator/pin-window";
import { useSceneScale } from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { ALFINETE_Z, usePinWindowStore } from "@/lib/store/use-pin-window-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import { SCENE_HEIGHT, SCENE_WIDTH, type Scene } from "@/types/scene";

/**
 * Tamanho do alfinete, em pixels de TELA.
 *
 * Dividido pelo `scale` do palco na hora de posicionar, como fazem as alças de
 * transformação. Sem isso o alfinete cresceria com o zoom e um mapa a 400%
 * teria marcadores do tamanho de um token.
 */
const ALFINETE_PX = 22;

/**
 * Quanto o ponteiro precisa andar, em pixels de tela, para o gesto deixar de
 * ser um clique e passar a ser um arrasto.
 *
 * Existe porque os dois gestos começam iguais e moram no mesmo alvo: clicar
 * abre a nota, arrastar move o ponto. Sem folga, a mão que treme ao clicar
 * moveria o ponto alguns pixels e não abriria nada — e o mestre veria um
 * clique que "não funcionou" e mexeu o mapa de lugar.
 */
const LIMIAR_PX = 4;

/**
 * Os pontos de anotação do mestre, sobre a cena.
 *
 * Mora aqui, no Operador, e NÃO no `SceneLayer`. É deliberado: o `SceneLayer` é
 * o mesmo componente no Assistir, na Plateia e na miniatura, e um ponto de
 * anotação desenhado por ele apareceria na TV virada para a mesa. A separação
 * é a barreira estrutural — a outra é `sceneForTable`, que tira os pontos do
 * quadro publicado. Vazar a preparação do mestre exigiria errar as duas.
 *
 * Não tem alças de redimensionar nem entra na seleção do palco: um ponto é uma
 * coordenada, não uma caixa. É por isso que ele também não usa o
 * `use-selection-store` — lá as seleções são mutuamente exclusivas porque
 * disputam o mesmo gizmo, e nada disso vale aqui.
 *
 * ## Clicar abre, arrastar só arrasta
 *
 * Os dois gestos disputam o mesmo alvo, e o clique é o que abre a nota. Ele
 * chega depois do `pointerup`, então o arrasto pede `mantemClique` para ele
 * existir e uma guarda para ele ser ignorado quando o gesto passou do limiar.
 *
 * A guarda é uma referência, não um relógio: comparar instantes acertaria na
 * média e erraria no gesto lento.
 *
 * Este alvo já foi gatilho de `Popover`, e o cartão abria ali antes de poder
 * ser fixado. O intermediário caiu: um popover que fecha ao primeiro clique no
 * mapa não serve a uma nota que existe para ser lida ENQUANTO se mexe no mapa,
 * e o botão de fixar era só o pedágio entre o cartão que fecha e o que fica.
 * Sem ele, o `<button>` volta a ser um botão comum — e Enter e Espaço, que o
 * base-ui dava de graça, vêm do próprio elemento.
 */
export function PinLayer({
  scene,
  panMode,
}: {
  scene: Scene;
  /** Espaço segurado: o arrasto pertence ao deslocamento da cena. */
  panMode: boolean;
}) {
  const { scale } = useSceneScale();
  const startDrag = useSceneDrag();
  const updatePin = useSceneStore((state) => state.updatePin);

  const abertas = usePinWindowStore((state) => state.notas);
  const abrir = usePinWindowStore((state) => state.abrir);

  /**
   * O gesto atual virou arrasto.
   *
   * Referência e não estado: ela é escrita durante o gesto e lida no `onClick`
   * que vem depois dele, e nenhuma das duas coisas precisa redesenhar nada. Como estado, o `set` do meio do arrasto renderizaria a
   * camada inteira por frame.
   */
  const arrastou = useRef(false);

  /** Qual alfinete está sendo arrastado agora, só para o cursor. */
  const [arrastando, setArrastando] = useState<string | null>(null);

  const pins = scene.pins;
  if (!pins || pins.length === 0 || scale === 0) return null;

  const lado = ALFINETE_PX / scale;

  function iniciarGesto(event: ReactPointerEvent, pinId: string, origemX: number, origemY: number) {
    // Zera antes de tudo: sem isto, um arrasto deixaria a guarda levantada e o
    // PRÓXIMO clique — um clique de verdade — seria engolido.
    arrastou.current = false;

    // Com espaço segurado o gesto é da cena, não do alfinete. Sem `return`
    // aqui o `stopPropagation` do arrasto comeria o deslocamento.
    if (panMode) return;

    startDrag(event, {
      // O clique tem de sobreviver ao gesto: é ele que abre a nota.
      mantemClique: true,
      onMove: (delta) => {
        if (!arrastou.current && Math.hypot(delta.x, delta.y) * scale < LIMIAR_PX) return;

        if (!arrastou.current) {
          arrastou.current = true;
          setArrastando(pinId);
        }

        // Preso ao plano: um ponto solto fora dele ficaria invisível e sem
        // nenhum jeito de ser pego de volta.
        updatePin(scene.id, pinId, {
          x: Math.round(Math.min(Math.max(origemX + delta.x, 0), SCENE_WIDTH)),
          y: Math.round(Math.min(Math.max(origemY + delta.y, 0), SCENE_HEIGHT)),
        });
      },
      onEnd: () => setArrastando(null),
    });
  }

  return (
    <>
      {/* O laço passa por baixo do alfinete e do cartão, e por cima dos itens
          do mapa. Quem garante isso é o `z-index` de cada um, não a ordem
          aqui: os itens da cena carregam o `z` deles e venceriam qualquer
          camada sem número. Ver a escada em `use-pin-window-store`. */}
      <PinTethers pins={pins} notas={abertas} escala={scale} />

      {pins.map((pin, index) => {
        const aberta = abertas.some((nota) => nota.pinId === pin.id);

        return (
          <button
            key={pin.id}
            type="button"
            // Título no `title` além do cartão: passar o mouse pelos alfinetes
            // é como se acha o certo num mapa com doze deles, e abrir cada um
            // para descobrir qual é seria pior.
            title={pin.title || `Ponto ${index + 1}`}
            aria-label={pin.title || `Ponto ${index + 1}`}
            className={cn(
              "absolute grid place-items-center rounded-full bg-amber-400 font-semibold text-amber-950 tabular-nums shadow-md select-none",
              // Anel escuro: sobre mapa claro um círculo âmbar sem contorno
              // some, e é a única coisa na tela que o mestre precisa achar
              // rápido.
              "ring-2 ring-neutral-900/70",
              // Nota na tela: o alfinete diz isso, para o mestre não procurar
              // um cartão que está atrás de outros três.
              aberta && "ring-primary ring-[3px]",
              arrastando === pin.id ? "cursor-grabbing" : "cursor-grab",
            )}
            style={{
              left: pin.x,
              top: pin.y,
              width: lado,
              height: lado,
              // Centrado no ponto: o marcador é um círculo, e um círculo não
              // tem ponta que indique onde ele crava.
              transform: "translate(-50%, -50%)",
              fontSize: lado * 0.5,
              // A numeração é do desenho, não do texto: sem isto o número
              // herda a altura de linha do palco e sai descentrado.
              lineHeight: 1,
              // Sem `preventDefault` no pointerdown — ele mataria o clique —,
              // é isto que impede o toque de rolar a tela durante o arrasto.
              touchAction: "none",
              // Acima da névoa e dos itens do mapa, abaixo das alças de
              // transformação. Ver a escada em `use-pin-window-store`.
              zIndex: ALFINETE_Z,
            }}
            onPointerDown={(event) => iniciarGesto(event, pin.id, pin.x, pin.y)}
            onClick={() => {
              // O clique que fecha um arrasto não é um clique: sem esta
              // guarda, mover o ponto abriria a nota dele no fim do gesto.
              if (arrastou.current) return;

              // `abrir` já cobre o caso de a nota estar na tela: ela vem para
              // a frente. É a resposta útil para "onde foi a nota deste
              // ponto?" quando ela está atrás de outras.
              abrir(pin.id);
            }}
          >
            {index + 1}
          </button>
        );
      })}

      {/* Por último: os cartões ficam por cima dos alfinetes e do resto do
          palco. Cada um carrega o próprio `zIndex`, para o empilhamento entre
          eles seguir a ordem em que foram tocados. */}
      {abertas.map((nota, index) => {
        const indice = pins.findIndex((pin) => pin.id === nota.pinId);

        // Ponto apagado, ou nota de outra cena: não desenha, e a entrada morre
        // sozinha quando a campanha fechar.
        if (indice < 0) return null;

        return (
          <PinWindow
            key={nota.pinId}
            sceneId={scene.id}
            pin={pins[indice]}
            indice={indice + 1}
            nota={nota}
            escala={scale}
            ordem={index}
          />
        );
      })}
    </>
  );
}
