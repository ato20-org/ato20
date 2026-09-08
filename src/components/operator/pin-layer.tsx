"use client";

import { PinNote } from "@/components/operator/pin-note";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSceneScale } from "@/components/playground/scene-stage";
import { cn } from "@/lib/utils";
import type { Scene } from "@/types/scene";

/**
 * Tamanho do alfinete, em pixels de TELA.
 *
 * Dividido pelo `scale` do palco na hora de posicionar, como fazem as alças de
 * transformação. Sem isso o alfinete cresceria com o zoom e um mapa a 400%
 * teria marcadores do tamanho de um token.
 */
const ALFINETE_PX = 22;

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
}: {
  scene: Scene;
  /** Qual nota está aberta. `null` = nenhuma. */
  abertoId: string | null;
  onAbrir: (pinId: string | null) => void;
}) {
  const { scale } = useSceneScale();

  const pins = scene.pins;
  if (!pins || pins.length === 0 || scale === 0) return null;

  const lado = ALFINETE_PX / scale;

  return (
    <>
      {pins.map((pin, index) => (
        <Popover
          key={pin.id}
          open={abertoId === pin.id}
          onOpenChange={(open) => onAbrir(open ? pin.id : null)}
        >
          <PopoverTrigger
            render={
              <button
                type="button"
                // Título no `title` além do cartão: passar o mouse pelos
                // alfinetes é como se acha o certo num mapa com doze deles,
                // e abrir cada um para descobrir qual é seria pior.
                title={pin.title || `Ponto ${index + 1}`}
                aria-label={pin.title || `Ponto ${index + 1}`}
                className={cn(
                  "absolute grid place-items-center rounded-full bg-amber-400 font-semibold text-amber-950 tabular-nums shadow-md",
                  // Anel escuro: sobre mapa claro um círculo âmbar sem contorno
                  // some, e é a única coisa na tela que o mestre precisa achar
                  // rápido.
                  "ring-2 ring-neutral-900/70",
                  abertoId === pin.id && "ring-primary ring-[3px]",
                )}
                style={{
                  left: pin.x,
                  top: pin.y,
                  width: lado,
                  height: lado,
                  // Centrado no ponto: o marcador é um círculo, e um círculo
                  // não tem ponta que indique onde ele crava.
                  transform: "translate(-50%, -50%)",
                  fontSize: lado * 0.5,
                  // A numeração é do desenho, não do texto: sem isto o número
                  // herda a altura de linha do palco e sai descentrado.
                  lineHeight: 1,
                }}
              >
                {index + 1}
              </button>
            }
          />

          <PopoverContent
            className="w-80"
            side="right"
            // Fora do palco quando não couber à direita: o cartão sobre o mapa
            // é aceitável, o cartão cortado pela borda da janela não.
            align="start"
          >
            <PinNote
              sceneId={scene.id}
              pin={pin}
              indice={index + 1}
              onClose={() => onAbrir(null)}
            />
          </PopoverContent>
        </Popover>
      ))}
    </>
  );
}
