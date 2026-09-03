"use client";

import { useRef } from "react";
import { Maximize, Minimize } from "lucide-react";

import { SceneAudio } from "@/components/playground/scene-audio";
import { SceneLayer } from "@/components/playground/scene-layer";
import { SceneStage } from "@/components/playground/scene-stage";
import { SoundToggle } from "@/components/playground/sound-toggle";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useSceneSubscription } from "@/hooks/use-scene-broadcast";
import { cn } from "@/lib/utils";

/**
 * A cena no celular do jogador. Só recebe — nenhum controle sobre nada.
 *
 * Sem zoom nem arraste de propósito: quem enquadra é o mestre. Um jogador que
 * se perde ampliado num canto do mapa vira suporte técnico no meio da sessão,
 * e o mestre não tem como saber que aquele aparelho está olhando outra coisa.
 *
 * Tela cheia é a exceção, e não conflita: ela só aumenta o que já está sendo
 * mostrado, sem mudar o enquadramento que o mestre escolheu.
 *
 * Renderiza o mesmo `SceneLayer` do Operador e do Assistir, na variante
 * `viewer`: névoa preta e sólida, sem contorno nem numeração.
 */
export function PlateiaStage({ roomId }: { roomId: string }) {
  const { scene, synced, stalled } = useSceneSubscription({ roomId });
  const { expanded, toggle } = useFullscreen();
  const frameRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <div
        ref={frameRef}
        className={cn(
          "relative overflow-hidden bg-black",
          expanded
            ? // Cobre a viewport por CSS, o que funciona mesmo onde a API
              // nativa de tela cheia não existe.
              "fixed inset-0 z-50"
            : // `aspect-video` dá a altura a partir da largura; `max-h-full`
              // corta essa altura quando não couber, que é o caso do celular
              // deitado. Quando o corte acontece a proporção é abandonada e o
              // `SceneStage` letterboxa o plano dentro do que sobrou.
              //
              // Não usa `flex-1` de propósito: ele depende de todo ancestral
              // ter altura definida, e quando um perde, vira zero — o palco
              // mede nada, o `scale` dá 0 e a cena fica preta.
              "aspect-video max-h-full w-full rounded-lg",
        )}
      >
        <SceneStage className="size-full" viewport={scene?.camera}>
          {scene ? <SceneLayer scene={scene} /> : null}
        </SceneStage>

        {/* Irmão do palco, não filho: o `SceneStage` esconde o próprio plano
            enquanto não mediu a moldura, e um aviso lá dentro desapareceria
            junto — deixando um retângulo preto sem explicação nenhuma. */}
        {!scene ? (
          <p className="text-muted-foreground absolute inset-0 grid place-items-center px-6 text-center text-sm">
            {synced
              ? "O mestre não colocou nenhuma cena no ar."
              : stalled
                ? // Silêncio longo não é espera: é problema. Dizer o que fazer
                  // vale mais que reticências que nunca terminam.
                  "Sem resposta do mestre. Ele precisa estar com a tela do Operador aberta."
                : "Aguardando o mestre…"}
          </p>
        ) : null}

        <SceneAudio scene={scene} />

        <SoundToggle className="absolute top-2 right-12" />

        <button
          type="button"
          aria-label={expanded ? "Sair da tela cheia" : "Tela cheia"}
          // Alvo generoso e fundo próprio: por cima de mapa escuro ou claro,
          // um ícone sem contraste desaparece.
          className="absolute top-2 right-2 rounded-md bg-black/60 p-2 text-white backdrop-blur"
          onClick={() => toggle(frameRef.current)}
        >
          {expanded ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </button>
      </div>

      {/* Some com a tela deitada: 16 pixels de nome não valem 16 pixels de mapa. */}
      {scene && !expanded ? (
        <p className="text-muted-foreground shrink-0 text-center text-xs [@media(max-height:520px)]:hidden">
          {scene.name}
        </p>
      ) : null}
    </div>
  );
}
