"use client";

import { Maximize, Ruler, ScanSearch, ZoomIn, ZoomOut } from "lucide-react";

import { GridControl } from "@/components/mestre/grid-control";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { METROS_POR_QUADRADO } from "@/lib/geometry/grid";
import { isFullViewport, viewportZoom } from "@/lib/geometry/viewport";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useToolStore } from "@/lib/store/use-tool-store";
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
  const zoomIn = useViewportStore((state) => state.zoomIn);
  const zoomOut = useViewportStore((state) => state.zoomOut);
  const fit = useViewportStore((state) => state.fit);

  const setSceneCamera = useSceneStore((state) => state.setSceneCamera);

  const tool = useToolStore((state) => state.tool);
  const setTool = useToolStore((state) => state.setTool);

  const zoom = viewportZoom(viewport);
  const atFit = isFullViewport(viewport);
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
        aria-label="Encaixar a cena inteira"
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

      {/* Ao lado do enquadrar: as duas respondem o que a mesa vê do mapa. */}
      <GridControl scene={scene} />

      {/* A régua colada na grade, e não na barra de ferramentas: ela só
          significa algo com a grade ligada, porque é o quadrado que diz quanto
          vale um metro. Longe dela, o botão desabilitado não explicaria por
          quê. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={tool === "regua" ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Régua"
              aria-pressed={tool === "regua"}
              disabled={!scene.grid}
              onClick={() => setTool(tool === "regua" ? "select" : "regua")}
            >
              <Ruler />
            </Button>
          }
        />
        <TooltipContent>
          <p className="font-medium">Régua</p>
          <p className="text-muted-foreground max-w-48">
            {scene.grid
              ? `Arraste para medir. Cada quadrado da grade vale ${METROS_POR_QUADRADO} m.`
              : "Ligue a grade primeiro: é o quadrado dela que diz quanto vale um metro."}
          </p>
        </TooltipContent>
      </Tooltip>

      <span className="bg-border mx-1 h-5 w-px" />

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
