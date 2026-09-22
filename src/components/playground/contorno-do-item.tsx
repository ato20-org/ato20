"use client";

import { memo, useEffect, useRef, useState } from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { contornoDaImagem, type Contorno } from "@/lib/contorno";

type ContornoDoItemProps = {
  assetId: string;
  /** A cor do traço. Ver `CONTORNO_DE_JOGADOR` e `CONTORNO_DE_NPC`. */
  cor: string;
  /**
   * A caixa do item na cena.
   *
   * Entra no forno porque é ela que decide o raio: o traço tem grossura fixa em
   * unidade de cena, e para sair fixo depois de a imagem ser esticada até aqui
   * o raio precisa saber por quanto vai ser esticado. Ver
   * `GROSSURA_DO_CONTORNO`.
   */
  largura: number;
  altura: number;
  /** O mesmo espelhamento da figura: o contorno é a borda DELA. */
  flipX?: boolean;
  flipY?: boolean;
};

/**
 * Quanto o forno espera, em ms, antes de reassar por mudança de tamanho.
 *
 * O primeiro assado de cada token é imediato. Os seguintes esperam, e é por
 * causa do gesto: redimensionar um token muda `item.width` a cada quadro --
 * o palco desenha a cena com o gesto por cima, ver `aplicarGesto` --, e assar
 * a cada quadro seria uma dilatação inteira por quadro no meio do arrasto. Com
 * a espera, o traço que já está na tela continua sendo esticado junto com o
 * token (fica um tico mais grosso ou mais fino durante o arrasto) e o forno
 * roda uma vez só, quando a mão para.
 */
const ESPERA_DO_REASSAR = 150;

/**
 * O traço em volta da figura de um token, no palco do mestre.
 *
 * Uma imagem, e não um filtro: ver `contornoDaImagem` para a razão, que é
 * medida e não gosto. Aqui ela só é posicionada -- maior que a caixa do item
 * pela margem que o forno devolveu, e deslocada pela mesma margem, de modo que
 * a região INTERNA da imagem assada caia exatamente sobre a caixa. É o que faz
 * o traço nascer colado na silhueta em vez de flutuando em volta.
 *
 * A margem vem do forno e não daqui, e vem por EIXO. Lá o traço tem um raio só,
 * em pixels do arquivo; aqui esse mesmo raio vira frações diferentes na
 * horizontal e na vertical, porque o arquivo raramente é quadrado. É o par de
 * frações que faz a espessura sair igual dos quatro lados depois de a imagem
 * ser esticada até a caixa -- uma fração só nos dois eixos engrossava o traço
 * de cima e de baixo em todo token mais alto que largo.
 *
 * O preço é o contorno passar da caixa do item pela margem -- alguns pixels de
 * token. É pequeno de propósito: filho que transborda um plano infla a camada
 * composta no WebKitGTK, e o que derrubou este palco três vezes foram
 * retângulos do tamanho do plano, não bordas de token. Ver `debug-do-palco` §3,
 * e confira o `transbordo` do HUD ao mexer nesta margem.
 *
 * `memo` pela mesma razão do `CanvasItemView`: as props são todas primitivas, e
 * arrastar um token no mapa não pode redesenhar o contorno dos outros trinta e
 * nove.
 */
export const ContornoDoItem = memo(function ContornoDoItem({
  assetId,
  cor,
  largura,
  altura,
  flipX,
  flipY,
}: ContornoDoItemProps) {
  // O ARQUIVO, como a figura que ele contorna. Já veio para desenhar o token, e
  // pedir a miniatura aqui daria um traço de 160px ampliado ao lado de uma
  // figura nítida -- que é como a primeira versão virou sombra.
  const url = useAssetUrl(assetId);

  const [assado, setAssado] = useState<Contorno | null>(null);
  // Se já há traço na tela. Num `ref` e não no estado: quem lê isto é o efeito,
  // para decidir entre assar agora e esperar, e uma dependência a mais só o
  // faria rodar de novo para chegar à mesma conclusão.
  const desenhado = useRef(false);

  useEffect(() => {
    if (!url) return;

    let ativo = true;

    const pedir = () => {
      void contornoDaImagem(url, cor, largura, altura).then((pronto) => {
        if (!ativo) return;

        desenhado.current = Boolean(pronto);
        setAssado(pronto);
      });
    };

    if (!desenhado.current) {
      pedir();

      return () => {
        ativo = false;
      };
    }

    const espera = setTimeout(pedir, ESPERA_DO_REASSAR);

    return () => {
      ativo = false;
      clearTimeout(espera);
    };
  }, [url, cor, largura, altura]);

  // Enquanto assa -- e para sempre, se falhar -- o token desenha como sempre
  // desenhou. O contorno é leitura a mais, não parte da figura.
  if (!assado) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={assado.desenho}
      alt=""
      aria-hidden
      draggable={false}
      // `max-w-none` não é enfeite: o preflight do Tailwind põe
      // `img { max-width: 100% }` em toda imagem, e esta é a rara que PRECISA
      // passar de 100% da caixa. Sem isso o browser aceitava o `left` negativo
      // e depois espremia a largura de volta para 100%: o traço saía deslocado
      // para a esquerda por uma margem inteira e estreitado na horizontal --
      // folga de um lado da figura, traço comendo a arte do outro. É o "meio
      // fora de centro" que se vê no palco e não se reproduz no forno, porque
      // o forno não tem folha de estilo. A altura escapa: o preflight não põe
      // `max-height` nenhum.
      className="pointer-events-none absolute max-w-none select-none"
      style={{
        left: porcento(-assado.margemX),
        top: porcento(-assado.margemY),
        width: porcento(1 + 2 * assado.margemX),
        height: porcento(1 + 2 * assado.margemY),
        transform:
          flipX || flipY
            ? `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`
            : undefined,
      }}
    />
  );
});

/** Arredondado porque `1.06 * 100` em ponto flutuante é `106.00000000000001`. */
function porcento(fracao: number): string {
  return `${(fracao * 100).toFixed(3)}%`;
}
