"use client";

import { useRef } from "react";
import { Maximize, Minimize } from "lucide-react";

import { CenaDoJogador } from "@/components/jogador/cena-do-jogador";
import {
  CortinaDeCorte,
  useCorteDeCamera,
} from "@/components/playground/corte-de-camera";
import { SceneStage } from "@/components/playground/scene-stage";
import { SoundToggle } from "@/components/playground/sound-toggle";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { cn } from "@/lib/utils";
import type { RolagemDaMesa } from "@/types/dado";
import type { FichaNaCena, Portrait, Scene } from "@/types/scene";

/**
 * A cena no celular do jogador.
 *
 * Um controle só, e é sobre o que é dele: o token do próprio personagem anda
 * com o dedo, e a mesa vê o movimento ao vivo. Ver `CenaDoJogador`.
 *
 * Sem zoom nem arraste do mapa de propósito: quem enquadra é o mestre. Um
 * jogador que se perde ampliado num canto do mapa vira suporte técnico no meio
 * da sessão, e o mestre não tem como saber que aquele aparelho está olhando
 * outra coisa. Pelo mesmo motivo o token não sai do quadro da câmera -- ver
 * `limiteDoMovimento`.
 *
 * Tela cheia é a exceção, e não conflita: ela só aumenta o que já está sendo
 * mostrado, sem mudar o enquadramento que o mestre escolheu.
 *
 * Renderiza o mesmo `SceneLayer` do Mestre e do Espectador, na variante
 * `mesa`: névoa preta e sólida, sem contorno nem numeração.
 *
 * Recebe a cena por prop em vez de assinar o canal: esta tela vive dentro de
 * uma aba, e aba inativa é desmontada — a inscrição morreria a cada vez que o
 * jogador fosse ver a própria ficha.
 */
export function JogadorStage({
  codigo,
  scene,
  portraits,
  fichas,
  rolagens,
  synced,
  stalled,
}: {
  /** A mesa, para o arrasto do token falar com ela. */
  codigo: string;
  scene: Scene | null;
  portraits: Portrait[];
  /** Nome e medidores sobre os tokens. Ver `Scene.infoDosTokens`. */
  fichas: FichaNaCena[];
  /**
   * Os dados que a mesa jogou há pouco, pendurados nos retratos.
   *
   * Inclui os do próprio jogador. O dado dele cai animado no saquinho, e depois
   * aparece aqui como o de todo mundo -- é o mesmo dado, visto de fora, e é o
   * que confirma que a mesa recebeu a jogada.
   */
  rolagens: RolagemDaMesa[];
  synced: boolean;
  stalled: boolean;
}) {
  const { expanded, toggle } = useFullscreen();
  const frameRef = useRef<HTMLDivElement>(null);
  // Trocar de câmera corta em fade; a mesma câmera andando interpola.
  const { cena, viewport, corte, cortando } = useCorteDeCamera(scene);

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
        <SceneStage className="size-full" viewport={viewport} corte={corte} smooth>
          {/* Mesma suavização da TV: o celular também só recebe amostras, e a
              troca de cena entra em fade em vez de estalar. */}
          {cena ? (
            <div key={cena.id} className="scene-fade-in absolute inset-0">
              <CenaDoJogador
                codigo={codigo}
                cena={cena}
                portraits={portraits}
                fichas={fichas}
                rolagens={rolagens}
              />
            </div>
          ) : null}
        </SceneStage>

        <CortinaDeCorte fechada={cortando} />

        {/* Irmão do palco, não filho: o `SceneStage` esconde o próprio plano
            enquanto não mediu a moldura, e um aviso lá dentro desapareceria
            junto — deixando um retângulo preto sem explicação nenhuma. */}
        {!scene ? (
          <p className="text-muted-foreground absolute inset-0 grid place-items-center px-6 text-center text-sm">
            {synced
              ? "O mestre não colocou nada no ar."
              : stalled
                ? // Silêncio longo não é espera: é problema. Dizer o que fazer
                  // vale mais que reticências que nunca terminam.
                  "Sem resposta do mestre. Ele precisa estar com a tela do Mestre aberta."
                : "Aguardando o mestre…"}
          </p>
        ) : null}

        <SoundToggle className="absolute top-2 right-12" />

        <button
          type="button"
          aria-label={expanded ? "Sair da tela cheia" : "Tela cheia"}
          // Alvo generoso e fundo próprio: por cima de mapa escuro ou claro,
          // um ícone sem contraste desaparece.
          className="absolute top-2 right-2 rounded-md bg-black/60 p-2 text-white backdrop-blur"
          onClick={() => toggle(frameRef.current)}
        >
          {expanded ? (
            <Minimize className="size-4" />
          ) : (
            <Maximize className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
