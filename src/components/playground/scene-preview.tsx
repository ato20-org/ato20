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
 * e não precisa de invalidação. Mostra a variante `mesa`, ou seja, com a
 * névoa fechada — é o que a mesa veria se essa cena entrasse no ar.
 *
 * Com as MINIATURAS do acervo, e isso não é detalhe: cada linha desenha um
 * quadrado de 56x32, e apontar para o arquivo original fazia a lista
 * decodificar 53 MB de bitmap por cena. Trinta cenas custavam 45,6 fps e um
 * pior quadro de 383 ms no arrasto do palco ao lado; com miniatura são 60 fps
 * e 16,8 ms. Ver `SceneLayer.mini`.
 */
export function ScenePreview({
  scene,
  className,
}: {
  scene: Scene;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none relative overflow-hidden rounded bg-black",
        className,
      )}
    >
      <SceneStage className="size-full">
        <SceneLayer scene={scene} variante="mini" />
      </SceneStage>
    </div>
  );
}
