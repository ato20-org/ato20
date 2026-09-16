"use client";

import { Maximize, ScanSearch, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cabeTudo, viewportZoom } from "@/lib/geometry/viewport";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { Scene } from "@/types/scene";

/**
 * Controles de zoom do palco, flutuando sobre a cena.
 *
 * Fora do cabeçalho de propósito: o cabeçalho é da sessão (mesa, som, sala) e
 * já está cheio, enquanto zoom pertence ao que está sob o cursor.
 */
export function ViewportControls({ scene }: { scene: Scene }) {
  const viewport = useViewportStore((state) => state.viewport);
  const conteudo = useViewportStore((state) => state.conteudo);
  const zoomIn = useViewportStore((state) => state.zoomIn);
  const zoomOut = useViewportStore((state) => state.zoomOut);
  const fit = useViewportStore((state) => state.fit);

  const setSceneCamera = useSceneStore((state) => state.setSceneCamera);

  const zoom = viewportZoom(viewport);
  // O que CABE, e não o plano inteiro: com conteúdo largado além das bordas o
  // plano deixa de ser o fim do afastar. Ver `cabeTudo`.
  const atFit = cabeTudo(viewport, conteudo);
  const framed = Boolean(scene.camera);

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

      <span className="bg-border mx-1 h-5 w-px" />

      {/* Só zoom e enquadrar aqui. A grade e a régua moravam nesta pílula e
          foram para a barra de ferramentas, junto das outras que marcam o
          mapa. Ver `MestreToolbar`. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={framed ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Enquadrar a mesa aqui"
              onClick={() => setSceneCamera(scene.id, viewport)}
            >
              <ScanSearch />
            </Button>
          }
        />
        <TooltipContent>
          <p className="font-medium">Enquadrar a mesa aqui</p>
          <p className="text-muted-foreground max-w-52">
            Manda este recorte para a TV e para os celulares. Teu zoom sozinho
            não muda o que eles veem.
          </p>
        </TooltipContent>
      </Tooltip>

      {framed ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Devolver a mesa à cena inteira"
                onClick={() => setSceneCamera(scene.id, undefined)}
              >
                <Maximize />
              </Button>
            }
          />
          <TooltipContent>
            <p className="max-w-52">Devolve a mesa à cena inteira.</p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
