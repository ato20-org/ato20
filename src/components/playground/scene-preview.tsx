"use client";

import { SceneLayer } from "@/components/playground/scene-layer";
import { SceneStage } from "@/components/playground/scene-stage";
import { cn } from "@/lib/utils";
import type { Scene } from "@/types/scene";

/**
 * Miniatura da cena.
 *
 * Renderiza o próprio `SceneLayer` num palco pequeno em vez de rasterizar um
 * PNG: aproveita a escala que o `SceneStage` já faz, nunca fica desatualizada
 * e não precisa de invalidação. Mostra a variante `viewer`, ou seja, com a
 * névoa fechada — é o que a mesa veria se essa cena entrasse no ar.
 */
export function ScenePreview({ scene, className }: { scene: Scene; className?: string }) {
  return (
    <div className={cn("pointer-events-none relative overflow-hidden rounded bg-black", className)}>
      <SceneStage className="size-full">
        <SceneLayer scene={scene} />
      </SceneStage>
    </div>
  );
}
