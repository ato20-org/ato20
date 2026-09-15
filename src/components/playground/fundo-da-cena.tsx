"use client";

import { useEffect, useState } from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { useVarianteDoFundo } from "@/hooks/use-variante-do-fundo";
import type { Variante } from "@/lib/vault/assets";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

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
  const [pronta, setPronta] = useState<{
    assetId: string;
    url: string;
    /** Tamanho do arquivo. Zero quando ele não decodificou. Ver `caixa`. */
    largura: number;
    altura: number;
  } | null>(null);

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
      if (vivo)
        setPronta({
          assetId,
          url,
          largura: carga.naturalWidth,
          altura: carga.naturalHeight,
        });
    };

    void carga.decode().then(entregar, entregar);

    return () => {
      vivo = false;
    };
  }, [assetId, url]);

  if (!assetId || pronta?.assetId !== assetId) return null;

  const lugar = caixa(pronta.largura, pronta.altura);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pronta.url}
      alt=""
      draggable={false}
      className="absolute select-none"
      style={lugar}
    />
  );
}

/**
 * Onde o mapa fica no plano: o que o `object-contain` faria, feito aqui.
 *
 * Mapa nenhum deve ser cortado por não ser 16:9, e era `absolute inset-0
 * size-full object-contain` que cuidava disso. A conta é a mesma; o que muda é
 * QUEM a faz -- e isso importa porque o `contain` a faz com o tamanho NATURAL
 * do arquivo, e sob `zoom` o WebKitGTK mede esse tamanho já multiplicado pela
 * ampliação. Passado o limite de textura do motor, o número que ele usa deixa
 * de ser o do arquivo, e o mapa aparece espremido -- e, mais ampliado ainda,
 * não aparece.
 *
 * Medido no motor do aplicativo, comparando o DESENHO em `zoom` contra o mesmo
 * quadro em `transform`, com a câmera parada no mesmo lugar:
 *
 *   arquivo         escala   com `contain`          com esta conta
 *   original 8192    1,5     igual                  igual
 *   original 8192    2,0     x . 0,92, y intacto    igual
 *   original 8192    2,5     quase tudo preto       igual
 *   original 8192    3,0     preto                  igual
 *   reduzida 4096    2,5     igual                  igual
 *   reduzida 4096    3,0     errado                 igual
 *   reduzida 4096    3,9     preto                  igual
 *
 * Só o eixo X erra, o que é a assinatura de uma proporção calculada com uma
 * largura que estourou e voltou cortada. As CAIXAS do DOM estão certas nos dois
 * modos -- o palco mede `3861,3x2172,0` no mesmo ponto, com `contain` ou sem
 * --, e os tokens, que se posicionam em pixel, não saem do lugar: quem erra é a
 * pintura da imagem, e só dela. Por isso o mapa "voltava ao normal" enquanto o
 * mestre arrastava: ali a câmera está em `transform`, e o `zoom` só entra quando
 * ela para. Ver `conteudoNoLayout`, no `SceneStage`, para por que ela entra.
 *
 * Com a caixa dita em unidade de cena não há tamanho natural na conta do motor,
 * e some a classe inteira de erro -- inclusive o dia em que a redução de palco
 * crescer, ou alguém importar um mapa maior ainda.
 *
 * Zero em qualquer lado é o arquivo que não decodificou: aí a imagem ocupa o
 * plano e o `<img>` falha em silêncio, como falhava antes.
 */
function caixa(
  largura: number,
  altura: number,
): { left: number; top: number; width: number; height: number } {
  if (largura <= 0 || altura <= 0)
    return { left: 0, top: 0, width: SCENE_WIDTH, height: SCENE_HEIGHT };

  const cabe = Math.min(SCENE_WIDTH / largura, SCENE_HEIGHT / altura);
  const width = largura * cabe;
  const height = altura * cabe;

  return {
    left: (SCENE_WIDTH - width) / 2,
    top: (SCENE_HEIGHT - height) / 2,
    width,
    height,
  };
}
