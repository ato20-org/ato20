"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";

import { PinNote } from "@/components/operator/pin-note";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useSceneScale } from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
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
 * ser um toque e passar a ser um arrasto.
 *
 * Existe porque os dois gestos começam iguais e moram no mesmo alvo: tocar
 * abre a nota, arrastar move o alfinete. Sem folga, a mão que treme ao clicar
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
 */
export function PinLayer({
  scene,
  abertoId,
  onAbrir,
  panMode,
}: {
  scene: Scene;
  /** Qual nota está aberta. `null` = nenhuma. */
  abertoId: string | null;
  onAbrir: (pinId: string | null) => void;
  /** Espaço segurado: o arrasto pertence ao deslocamento da cena. */
  panMode: boolean;
}) {
  const { scale } = useSceneScale();
  const startDrag = useSceneDrag();
  const updatePin = useSceneStore((state) => state.updatePin);

  /**
   * O elemento do alfinete aberto, para o painel se ancorar nele.
   *
   * Um `Popover` para a camada inteira, e não um por alfinete: só uma nota
   * fica aberta, e N painéis montados custariam N consultas ao acervo para
   * mostrar um. A âncora explícita é o que permite isso — ver `PopoverContent`.
   */
  const [ancora, setAncora] = useState<HTMLElement | null>(null);

  /** Qual alfinete está sendo arrastado agora, só para o cursor. */
  const [arrastando, setArrastando] = useState<string | null>(null);

  const pins = scene.pins;
  if (!pins || pins.length === 0 || scale === 0) return null;

  const lado = ALFINETE_PX / scale;

  function alternar(pinId: string, elemento: HTMLElement) {
    if (abertoId === pinId) {
      onAbrir(null);
      return;
    }

    setAncora(elemento);
    onAbrir(pinId);
  }

  function iniciarGesto(event: ReactPointerEvent, pinId: string, origemX: number, origemY: number) {
    // Com espaço segurado o gesto é da cena, não do alfinete. Sem `return` aqui
    // o `stopPropagation` do arrasto comeria o deslocamento.
    if (panMode) return;

    const elemento = event.currentTarget as HTMLElement;

    /**
     * O gesto já passou do limiar.
     *
     * Uma vez arrasto, sempre arrasto: voltar ao ponto de partida no meio do
     * caminho não pode reabrir a possibilidade de virar toque, senão soltar
     * onde se começou abriria a nota depois de ter movido o ponto por meio
     * mapa.
     */
    let mexeu = false;

    startDrag(event, {
      onMove: (delta) => {
        if (!mexeu && Math.hypot(delta.x, delta.y) * scale < LIMIAR_PX) return;

        if (!mexeu) {
          mexeu = true;
          setArrastando(pinId);
          // A nota deste ponto sai da frente: ela está ancorada num elemento
          // que vai andar, e um cartão parado ao lado do alfinete em movimento
          // parece painel travado.
          if (abertoId === pinId) onAbrir(null);
        }

        // Preso ao plano: um ponto solto fora dele ficaria invisível e sem
        // nenhum jeito de ser pego de volta.
        updatePin(scene.id, pinId, {
          x: Math.round(Math.min(Math.max(origemX + delta.x, 0), SCENE_WIDTH)),
          y: Math.round(Math.min(Math.max(origemY + delta.y, 0), SCENE_HEIGHT)),
        });
      },
      onEnd: () => {
        setArrastando(null);
        // Não passou do limiar: era toque, e toque abre a nota. O `startDrag`
        // chama `preventDefault` no pointerdown, o que suprime o `click` do
        // mouse — então abrir daqui é o caminho, não um `onClick`.
        if (!mexeu) alternar(pinId, elemento);
      },
    });
  }

  const aberto = pins.find((pin) => pin.id === abertoId);
  const indiceAberto = aberto ? pins.indexOf(aberto) + 1 : 0;

  return (
    <>
      {pins.map((pin, index) => (
        <button
          key={pin.id}
          type="button"
          // Título no `title` além do cartão: passar o mouse pelos alfinetes é
          // como se acha o certo num mapa com doze deles, e abrir cada um para
          // descobrir qual é seria pior.
          title={pin.title || `Ponto ${index + 1}`}
          aria-label={pin.title || `Ponto ${index + 1}`}
          aria-expanded={abertoId === pin.id}
          className={cn(
            "absolute grid place-items-center rounded-full bg-amber-400 font-semibold text-amber-950 tabular-nums shadow-md",
            // Anel escuro: sobre mapa claro um círculo âmbar sem contorno some,
            // e é a única coisa na tela que o mestre precisa achar rápido.
            "ring-2 ring-neutral-900/70",
            abertoId === pin.id && "ring-primary ring-[3px]",
            arrastando === pin.id ? "cursor-grabbing" : "cursor-grab",
          )}
          style={{
            left: pin.x,
            top: pin.y,
            width: lado,
            height: lado,
            // Centrado no ponto: o marcador é um círculo, e um círculo não tem
            // ponta que indique onde ele crava.
            transform: "translate(-50%, -50%)",
            fontSize: lado * 0.5,
            // A numeração é do desenho, não do texto: sem isto o número herda a
            // altura de linha do palco e sai descentrado.
            lineHeight: 1,
          }}
          onPointerDown={(event) => iniciarGesto(event, pin.id, pin.x, pin.y)}
          // Teclado abre pelo caminho próprio: o `preventDefault` do arrasto
          // mata o `click` do mouse, e um `onClick` aqui só serviria ao teclado
          // — mas correria o risco de disparar duas vezes num navegador que
          // entregue o clique de todo jeito. Enter e Espaço não passam por
          // pointer nenhum, então não há ambiguidade.
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;

            // Espaço rolaria a página, e é também o atalho de deslocar a cena.
            event.preventDefault();
            alternar(pin.id, event.currentTarget);
          }}
        >
          {index + 1}
        </button>
      ))}

      <Popover open={Boolean(aberto)} onOpenChange={(open) => !open && onAbrir(null)}>
        {aberto ? (
          <PopoverContent
            className="w-80"
            anchor={ancora}
            side="right"
            // Fora do palco quando não couber à direita: o cartão sobre o mapa
            // é aceitável, o cartão cortado pela borda da janela não.
            align="start"
          >
            <PinNote
              sceneId={scene.id}
              pin={aberto}
              indice={indiceAberto}
              onClose={() => onAbrir(null)}
            />
          </PopoverContent>
        ) : null}
      </Popover>
    </>
  );
}
