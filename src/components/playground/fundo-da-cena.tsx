"use client";

import { useEffect, useState } from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { useVarianteDoFundo } from "@/hooks/use-variante-do-fundo";
import type { Variante } from "@/lib/vault/assets";

type FundoDaCenaProps = {
  assetId: string | undefined;
  /**
   * Tamanho fixo, quando quem desenha já sabe qual quer.
   *
   * É o caso da prévia de cena (`mini`) e do celular do jogador (`tela`): os
   * dois têm um tamanho de tela conhecido e uma câmera que eles não controlam.
   * Ausente é o palco do mestre e a TV, e aí o tamanho passa a depender do
   * zoom — ver `useVarianteDoFundo`.
   */
  variante?: Variante;
};

/**
 * O mapa da cena.
 *
 * Existe separado do `SceneLayer` por uma razão só: aqui o endereço da imagem
 * muda SOZINHO no meio do gesto, quando o mestre amplia além do ponto em que a
 * redução deixa de bastar. Trocar o `src` de um `<img>` montado apaga o que
 * está na tela até o arquivo novo decodificar, e o mapa sumindo por trezentos
 * milissegundos no meio de um zoom é pior do que o quadro lento que a troca foi
 * feita para evitar.
 *
 * Então a troca é em duas partes: uma imagem fora da árvore busca e decodifica
 * o arquivo novo, e só depois disso o `<img>` da tela aponta para ele. O
 * `decode()` faz esse trabalho fora da thread que está desenhando, e quando o
 * `src` finalmente muda o arquivo já está no cache do browser — o que aparece
 * na tela é um quadro pronto, e não um buraco.
 *
 * Vale também para a PRIMEIRA imagem, e ali não custa nada: antes disto o
 * `<img>` ficava montado com um `src` que ainda não tinha chegado, o que na
 * tela é o mesmo preto.
 */
export function FundoDaCena({ assetId, variante }: FundoDaCenaProps) {
  // Sempre chamado, mesmo quando `variante` decide por fora: o palco é o único
  // lugar sem tamanho fixo, mas a regra dos hooks não admite o "só às vezes".
  const porZoom = useVarianteDoFundo();
  const url = useAssetUrl(assetId, variante ?? porZoom);

  /**
   * O último endereço que TERMINOU de decodificar, com o asset a que ele
   * pertence.
   *
   * É este que a tela desenha, e nunca o `url` recém-chegado: são coisas
   * diferentes de propósito. Enquanto a variante nova não está pronta, quem
   * continua na tela é a ANTERIOR — que é o mapa certo, só com menos pixel do
   * que se vai precisar daqui a um quarto de segundo.
   *
   * Foi assim que nasceu a piscada: a primeira versão escondia a imagem até a
   * nova decodificar, e o mapa sumia por um quadro a cada troca de variante.
   * Trocar de arquivo no meio de um zoom não pode ter momento nenhum em que não
   * há mapa.
   *
   * O asset vai junto porque o raciocínio se inverte quando a CENA muda: aí o
   * que está na tela é o mapa de outra cena, e segurá-lo seria mostrar o lugar
   * errado. Conferir o id na saída é o mesmo cuidado do `useAssetUrl`.
   */
  const [pronta, setPronta] = useState<{ assetId: string; url: string } | null>(null);

  useEffect(() => {
    if (!assetId || !url) return;

    let vivo = true;
    const carga = new Image();
    carga.src = url;

    // As duas pontas entregam: um arquivo que não decodifica é melhor entregue
    // ao `<img>` da tela, que já sabe falhar em silêncio, do que segurado aqui
    // — segurar deixaria o palco com o mapa velho para sempre, sem nada dizendo
    // por quê.
    const entregar = () => {
      if (vivo) setPronta({ assetId, url });
    };

    void carga.decode().then(entregar, entregar);

    return () => {
      vivo = false;
    };
  }, [assetId, url]);

  if (!assetId || pronta?.assetId !== assetId) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pronta.url}
      alt=""
      draggable={false}
      // `object-contain`: mapa nenhum deve ser cortado por não ser 16:9.
      className="absolute inset-0 size-full object-contain select-none"
    />
  );
}
