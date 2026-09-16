"use client";

import { ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cabeTudo, viewportZoom } from "@/lib/geometry/viewport";
import { useViewportStore } from "@/lib/store/use-viewport-store";

/**
 * Controles de zoom do palco, flutuando sobre a cena.
 *
 * Fora do cabeçalho de propósito: o cabeçalho é da sessão (mesa, som, sala) e
 * já está cheio, enquanto zoom pertence ao que está sob o cursor.
 */
export function ViewportControls() {
  const viewport = useViewportStore((state) => state.viewport);
  const conteudo = useViewportStore((state) => state.conteudo);
  const zoomIn = useViewportStore((state) => state.zoomIn);
  const zoomOut = useViewportStore((state) => state.zoomOut);
  const fit = useViewportStore((state) => state.fit);

  const zoom = viewportZoom(viewport);
  // O que CABE, e não o plano inteiro: com conteúdo largado além das bordas o
  // plano deixa de ser o fim do afastar. Ver `cabeTudo`.
  const atFit = cabeTudo(viewport, conteudo);

  return (
    <div className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Menos zoom"
        disabled={atFit}
        onClick={zoomOut}
      >
        <ZoomOut />
      </Button>

      <button
        type="button"
        className="hover:bg-accent w-14 rounded-md px-1 py-1 text-xs tabular-nums"
        aria-label="Encaixar tudo o que existe"
        onClick={fit}
      >
        {Math.round(zoom * 100)}%
      </button>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Mais zoom"
        onClick={zoomIn}
      >
        <ZoomIn />
      </Button>

      {/* Só zoom. A grade e a régua foram para a barra de ferramentas, e os
          comandos de câmera para a pílula das câmeras, ao lado: cada pílula
          com um assunto, senão esta atravessava metade do palco. */}
    </div>
  );
}
