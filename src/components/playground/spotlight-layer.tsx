"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { ImageZoom } from "@/components/attachments/image-zoom";
import { useSpotlightUrl } from "@/hooks/use-spotlight-url";
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
 * `dismissable` é a diferença entre a TV e o celular, e vale para os dois
 * controles desta tela — esconder e ampliar. Na TV não há ninguém operando:
 * botão ali só corre o risco de alguém encostar, e ninguém vai fazer zoom numa
 * tela sem cursor nem dono. No celular há uma mão. O jogador tem também a
 * própria ficha e o mapa, e uma imagem que ele não pode encostar de lado o
 * deixaria preso enquanto o mestre não lembrasse de tirar; e uma carta ou uma
 * ficha caberem na tela não é o mesmo que poderem ser lidas nela — sem zoom, a
 * mesa recebe a imagem e não alcança o que está escrito. Encostar de lado não é
 * tirar do ar: a imagem continua no ar para todo mundo, e volta com um toque.
 */
export function SpotlightLayer({
  spotlight,
  dismissable = false,
}: {
  spotlight: Spotlight | null;
  dismissable?: boolean;
}) {
  // Pelo `useSpotlightUrl`, e não pelo id do acervo: a evidência também pode
  // ser o anexo de um jogador, que não é asset e sai por `/evidencia/{id}`.
  const url = useSpotlightUrl(spotlight);

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
      // No ALTO, e não mais no rodapé. Embaixo ela caía exatamente sobre a
      // bolinha do saquinho, que passou a morar no meio da barra: o aviso de
      // que há uma imagem no ar cobria o botão mais usado da tela, e tocar num
      // era tocar no outro. Em cima não disputa com nada fixo — a cena fica
      // logo abaixo do cabeçalho, e o que a faixa cobre é imagem, não controle.
      <button
        type="button"
        className="fixed top-2 left-1/2 z-60 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/80 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur"
        onClick={() => setEscondido(null)}
      >
        <Eye className="size-3.5" aria-hidden />
        Ver a imagem do mestre
      </button>
    );
  }

  return (
    // `fixed` e `z-60`: cobre a viewport inteira e vence a tela cheia da
    // Jogador, que é `fixed inset-0 z-50`. Um jogador com o mapa expandido
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
        dismissable ? (
          // O mesmo gesto que o jogador já tem nos próprios arquivos: roda,
          // pinça, arrasto e duplo toque. O `key` do contêiner é o `since`, e
          // é isso que faz cada transmissão nova nascer encaixada em vez de
          // herdar o recorte da anterior.
          <ImageZoom
            src={url}
            alt="Imagem em evidência"
            className="min-h-0 w-full flex-1"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Imagem em evidência"
            draggable={false}
            // `object-contain` com teto de altura: documento em pé e mapa
            // deitado passam pelo mesmo caminho, e cortar qualquer um dos dois
            // esconderia justamente o que se mandou olhar.
            // O `SpotlightLayer` e sobreposicao de tela inteira, montada
            // fora do `SceneStage`: nao ha `zoom` no caminho dele.
            // eslint-disable-next-line no-restricted-syntax
            className="max-h-full min-h-0 w-auto max-w-full flex-1 object-contain select-none"
          />
        )
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
