"use client";

import { useSceneScale } from "@/components/playground/scene-stage";
import { areasDeRetrato } from "@/lib/geometry/portrait";
import { cn } from "@/lib/utils";
import type { AncoraRetrato, Viewport } from "@/types/scene";

/** Acima do gizmo, abaixo do cartão de nota: é alvo de um gesto em curso. */
const AREAS_Z = 11_500;

/**
 * As áreas onde a fila de retratos pode encostar, durante o arrasto dela.
 *
 * Só aparecem enquanto o gesto corre, e é de propósito: são seis retângulos
 * sobre o mapa, e deixá-los à vista o tempo todo poluiria justamente a imagem
 * que a mesa está olhando.
 *
 * Mesma ideia das zonas de encaixe do dock — mostra o RESULTADO, não a
 * intenção: a área que vai receber a fila é a que acende cheia.
 */
export function PortraitAnchors({
  camera,
  alvo,
}: {
  camera?: Viewport;
  /** A área sob o ponteiro. `null` = nenhuma, e soltar não muda nada. */
  alvo: AncoraRetrato | null;
}) {
  const { scale } = useSceneScale();
  const traco = 1.5 / scale;

  return (
    <>
      {areasDeRetrato(camera).map(({ ancora, box }) => (
        <div
          key={ancora}
          aria-hidden
          className={cn(
            "border-primary pointer-events-none absolute rounded-sm border-dashed transition-colors",
            ancora === alvo ? "bg-primary/25" : "bg-primary/5",
          )}
          style={{
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
            borderWidth: traco,
            zIndex: AREAS_Z,
          }}
        />
      ))}
    </>
  );
}
