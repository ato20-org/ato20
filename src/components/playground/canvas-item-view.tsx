"use client";

import { memo, type PointerEvent as ReactPointerEvent } from "react";

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
   * Operador. Ver `.scene-smooth-item` em `globals.css`.
   */
  smooth?: boolean;
  onPointerDown?: (event: ReactPointerEvent, item: CanvasItem) => void;
};

/**
 * `memo` porque o board é imutável e `updateItems` preserva a identidade dos
 * itens que não mudaram: arrastar um token num mapa com quarenta re-renderizava
 * os quarenta a cada frame do gesto. Só vale com handler estável — ver o
 * envelope de handlers em `OperatorStage`.
 */
export const CanvasItemView = memo(function CanvasItemView({
  item,
  smooth = false,
  variante,
  onPointerDown,
}: CanvasItemViewProps) {
  const url = useAssetUrl(item.assetId, variante);
  // Item travado continua clicável — é o único jeito de selecioná-lo para
  // destravar. O que o travamento bloqueia é o arrasto, decidido no Operador.
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
      // a refazer o layout do plano inteiro a cada frame — do gesto no Operador
      // e da interpolação em quem assiste. `transform` fica no compositor.
      //
      // `rotate` depois do `translate`, e a origem segue o centro do próprio
      // item, então girar continua sendo em torno do centro.
      style={{
        transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg)`,
        width: item.width,
        height: item.height,
        zIndex: item.z,
      }}
      onPointerDown={onPointerDown ? (event) => onPointerDown(event, item) : undefined}
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
          className="size-full object-fill select-none"
          // Espelhamento na imagem, não no contêiner: assim a caixa, as alças
          // e o hit-test seguem intactos — virar um token não move nada.
          style={
            item.flipX || item.flipY
              ? { transform: `scale(${item.flipX ? -1 : 1}, ${item.flipY ? -1 : 1})` }
              : undefined
          }
        />
      ) : null}
    </div>
  );
});
