"use client";

import { useMemo, type PointerEvent as ReactPointerEvent } from "react";

import { CanvasItemView } from "@/components/playground/canvas-item-view";
import { FogLayer } from "@/components/playground/fog-layer";
import { useAssetUrl } from "@/hooks/use-asset-url";
import type { CanvasItem, FogRegion, Scene } from "@/types/scene";

type SceneLayerProps = {
  scene: Scene;
  /** `viewer` é o que a mesa vê. `operator` deixa o mestre atravessar a névoa. */
  variant?: "operator" | "viewer";
  /** Ausente = camada só de leitura, que é o caso do Assistir. */
  onItemPointerDown?: (event: ReactPointerEvent, item: CanvasItem) => void;
  onFogPointerDown?: (event: ReactPointerEvent, region: FogRegion) => void;
};

/**
 * Desenho da cena: fundo, itens empilhados e áreas escondidas por cima. É o
 * mesmo componente no Operador, no Assistir e na miniatura — se cada visão
 * renderizasse por um caminho diferente, elas divergiriam no primeiro ajuste
 * de layout.
 */
export function SceneLayer({
  scene,
  variant = "viewer",
  onItemPointerDown,
  onFogPointerDown,
}: SceneLayerProps) {
  const backgroundUrl = useAssetUrl(scene.backgroundAssetId);
  const items = useMemo(() => [...scene.items].sort((a, b) => a.z - b.z), [scene.items]);

  return (
    <>
      {backgroundUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backgroundUrl}
          alt=""
          draggable={false}
          // `object-contain`: mapa nenhum deve ser cortado por não ser 16:9.
          className="absolute inset-0 size-full object-contain select-none"
        />
      ) : null}

      {items.map((item) => (
        <CanvasItemView key={item.id} item={item} onPointerDown={onItemPointerDown} />
      ))}

      <FogLayer fog={scene.fog} variant={variant} onFogPointerDown={onFogPointerDown} />
    </>
  );
}
