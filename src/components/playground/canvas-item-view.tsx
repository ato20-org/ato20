"use client";

import { memo, type PointerEvent as ReactPointerEvent } from "react";

import { ContornoDoItem } from "@/components/playground/contorno-do-item";
import { useAssetUrl } from "@/hooks/use-asset-url";
import type { Variante } from "@/lib/vault/assets";
import { cn } from "@/lib/utils";
import type { CanvasItem } from "@/types/scene";

type CanvasItemViewProps = {
  item: CanvasItem;
  /**
   * Qual tamanho do arquivo desenhar. Ausente = o arquivo.
   *
   * `mini` é da prévia de cena, que desenha o item num quadrado de 56x32;
   * `tela` é do celular do jogador. No palco do mestre fica ausente: ali o
   * token é conteúdo, e ele amplia para conferir detalhe.
   */
  variante?: Variante;
  /**
   * Interpola posição, tamanho e giro entre as amostras que chegam do
   * Mestre. Ver `.scene-smooth-item` em `globals.css`.
   */
  smooth?: boolean;
  /**
   * O dedo do jogador está segurando este item, no celular dele.
   *
   * Desliga a interpolação só da posição, e não o `smooth` inteiro: tirar a
   * classe tiraria junto o `scene-item-in`, e devolvê-la ao soltar repetiria a
   * entrada -- o token piscaria ao ser largado. Ver `SceneLayer.naMao`.
   */
  naMao?: boolean;
  /**
   * A cor do traço em volta da figura, quando ela deve ter um.
   *
   * Só o palco do mestre passa: é a leitura "quem é de jogador e quem é meu"
   * sem clicar em ninguém, e por isso ela não depende de clique nenhum --
   * seleção não apaga o traço de ninguém, nem do próprio selecionado. Ausente
   * -- a mesa inteira -- não monta nada. Ver `ContornoDoItem` e
   * `contornoDosItens`.
   */
  contorno?: string;
  onPointerDown?: (event: ReactPointerEvent, item: CanvasItem) => void;
};

/**
 * `memo` porque o board é imutável e `updateItems` preserva a identidade dos
 * itens que não mudaram: arrastar um token num mapa com quarenta re-renderizava
 * os quarenta a cada frame do gesto. Só vale com handler estável — ver o
 * envelope de handlers em `MestreStage`.
 */
export const CanvasItemView = memo(function CanvasItemView({
  item,
  smooth = false,
  naMao = false,
  variante,
  contorno,
  onPointerDown,
}: CanvasItemViewProps) {
  const url = useAssetUrl(item.assetId, variante);
  // Item travado continua clicável — é o único jeito de selecioná-lo para
  // destravar. O que o travamento bloqueia é o arrasto, decidido no Mestre.
  const interactive = Boolean(onPointerDown);

  return (
    <div
      data-item-id={item.id}
      className={cn(
        // Posicionado no canto e movido por `transform`: ver o `style`.
        "absolute top-0 left-0",
        interactive && "touch-none",
        interactive && !item.locked && "cursor-move",
        // Um item que entra na cena aparece surgindo, não estalando: no meio de
        // uma cena, o token novo é justamente o que a mesa precisa notar.
        smooth && "scene-smooth-item scene-item-in",
      )}
      // Posição em `transform`, não em `left/top`. As duas desenham igual, mas
      // `left/top` são propriedades de layout: mover um item obrigava o browser
      // a refazer o layout do plano inteiro a cada frame — do gesto no Mestre
      // e da interpolação em quem assiste. `transform` fica no compositor.
      //
      // `rotate` depois do `translate`, e a origem segue o centro do próprio
      // item, então girar continua sendo em torno do centro.
      style={{
        transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg)`,
        width: item.width,
        height: item.height,
        zIndex: item.z,
        // No contêiner e não na `img`: o que esmaece é o ITEM, e o dia em que
        // ele tiver moldura ou rótulo os dois têm de esmaecer junto. Ausente
        // no item vira ausente no estilo, e o browser desenha opaco.
        //
        // Não mexe no hit-test: um item a 10% continua clicável no palco, que
        // é o que permite desfazer o exagero sem caçar o item na lista.
        opacity: item.opacity,
        // Por cima do `.scene-smooth-item`: ver `naMao`.
        transition: naMao ? "none" : undefined,
      }}
      onPointerDown={
        onPointerDown ? (event) => onPointerDown(event, item) : undefined
      }
    >
      {url ? (
        // next/image não serve aqui: a fonte é uma blob URL do IndexedDB, sem
        // dimensão conhecida no servidor e sem nada para o otimizador fazer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          // `object-fill` é intencional: redimensionar deforma, como no Figma.
          // Quem quer proporção travada arrasta o canto com Shift.
          className="relative size-full object-fill select-none"
          // Espelhamento na imagem, não no contêiner: assim a caixa, as alças
          // e o hit-test seguem intactos — virar um token não move nada.
          style={
            item.flipX || item.flipY
              ? {
                  transform: `scale(${item.flipX ? -1 : 1}, ${item.flipY ? -1 : 1})`,
                }
              : undefined
          }
        />
      ) : null}

      {/* Depois da figura, e por isso POR CIMA dela: os dois estão na mesma
          pilha, e ali quem vem depois cobre quem veio antes.

          Por cima e não atrás porque muito token traz uma sombra própria
          pintada no PNG, deslocada para um lado. Atrás, essa sombra caía sobre
          o traço daquele lado e o pintava de cinza -- o contorno saía torto,
          nítido de um lado e sumido do outro. O traço nasce fora da silhueta
          opaca da figura (ver `contornoDaImagem`), então por cima ele não tem
          figura nenhuma para cobrir: cobre a franja lisa da borda e o começo da
          sombra, que é o que um adesivo faz. */}
      {url && contorno ? (
        <ContornoDoItem
          assetId={item.assetId}
          cor={contorno}
          largura={item.width}
          altura={item.height}
          flipX={item.flipX}
          flipY={item.flipY}
        />
      ) : null}
    </div>
  );
});
