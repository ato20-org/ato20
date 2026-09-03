"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { cn } from "@/lib/utils";
import type { CanvasItem } from "@/types/scene";

type CanvasItemViewProps = {
  item: CanvasItem;
  onPointerDown?: (event: ReactPointerEvent, item: CanvasItem) => void;
};

export function CanvasItemView({ item, onPointerDown }: CanvasItemViewProps) {
  const url = useAssetUrl(item.assetId);
  // Item travado continua clicável — é o único jeito de selecioná-lo para
  // destravar. O que o travamento bloqueia é o arrasto, decidido no Operador.
  const interactive = Boolean(onPointerDown);

  return (
    <div
      data-item-id={item.id}
      className={cn("absolute", interactive && "touch-none", interactive && !item.locked && "cursor-move")}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        transform: `rotate(${item.rotation}deg)`,
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
}
