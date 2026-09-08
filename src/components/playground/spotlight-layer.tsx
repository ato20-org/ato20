"use client";

import { useState } from "react";
import { ChevronUp, Eye, EyeOff } from "lucide-react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { cn } from "@/lib/utils";
import type { Spotlight } from "@/types/scene";

/**
 * A imagem que o mestre mandou a mesa olhar, na frente de tudo.
 *
 * Cobre a tela inteira, e não um canto: o nome do gesto é "em evidência", e uma
 * miniatura sobre o mapa seria o oposto — a mesa continuaria olhando o mapa e
 * perguntando o que era aquilo no canto. Um documento, um retrato ou uma carta
 * precisam ser lidos, e ler exige o espaço.
 *
 * `dismissable` é a diferença entre a TV e o celular. Na TV não há ninguém para
 * fechar nada, e um botão ali só correria o risco de alguém encostar. No
 * celular o jogador tem também a própria ficha e o mapa, e uma imagem que ele
 * não pode encostar de lado o deixaria preso enquanto o mestre não lembrasse de
 * tirar. Encostar de lado não é tirar do ar: a imagem continua no ar para todo
 * mundo, e volta com um toque.
 */
export function SpotlightLayer({
  spotlight,
  dismissable = false,
}: {
  spotlight: Spotlight | null;
  dismissable?: boolean;
}) {
  const url = useAssetUrl(spotlight?.assetId);

  /**
   * QUAL transmissão o jogador encostou de lado — o `since` dela, não um
   * booleano.
   *
   * Guardar o instante em vez de um sim/não resolve dois casos sem nenhum
   * efeito para limpar estado. Uma transmissão nova tem `since` diferente e
   * portanto nasce visível, mesmo para quem escondeu a anterior: o mestre
   * chamar a atenção outra vez vence um "esconder" que era sobre outra imagem.
   * E um valor que ficou aqui depois de o mestre tirar tudo do ar é inofensivo,
   * porque a comparação é sempre contra o `since` atual.
   */
  const [escondido, setEscondido] = useState<number | null>(null);

  if (!spotlight) return null;

  const oculto = escondido === spotlight.since;

  if (oculto) {
    return (
      <button
        type="button"
        className="fixed bottom-3 left-1/2 z-60 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/80 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur"
        onClick={() => setEscondido(null)}
      >
        <Eye className="size-3.5" aria-hidden />
        {/* O título quando há: "ver imagem" não diz se vale a pena reabrir. */}
        {spotlight.caption ? `Ver: ${spotlight.caption}` : "Ver a imagem do mestre"}
        <ChevronUp className="size-3.5" aria-hidden />
      </button>
    );
  }

  return (
    // `fixed` e `z-60`: cobre a viewport inteira e vence a tela cheia da
    // Plateia, que é `fixed inset-0 z-50`. Um jogador com o mapa expandido
    // veria, por baixo de um retângulo preto, justamente a imagem que o mestre
    // acabou de mandar olhar.
    <div
      className={cn(
        "fixed inset-0 z-60 flex flex-col items-center justify-center gap-3 bg-black/92 p-4 backdrop-blur-sm",
        // `key` na transmissão faz a entrada em fade repetir a cada imagem
        // nova, o que é o sinal de que algo mudou numa tela que ninguém opera.
        "scene-fade-in",
      )}
      key={spotlight.since}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={spotlight.caption ?? "Imagem em evidência"}
          draggable={false}
          // `object-contain` com teto de altura: documento em pé e mapa
          // deitado passam pelo mesmo caminho, e cortar qualquer um dos dois
          // esconderia justamente o que se mandou olhar.
          className="max-h-full min-h-0 w-auto max-w-full flex-1 object-contain select-none"
        />
      ) : null}

      {spotlight.caption ? (
        <p className="shrink-0 text-center text-sm text-white/80">{spotlight.caption}</p>
      ) : null}

      {dismissable ? (
        <button
          type="button"
          className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/90 backdrop-blur"
          onClick={() => setEscondido(spotlight.since)}
        >
          <EyeOff className="size-3.5" aria-hidden />
          Esconder
        </button>
      ) : null}
    </div>
  );
}
