"use client";

import { Eye, EyeOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toggleFogRevealed } from "@/lib/operator/item-actions";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { cn } from "@/lib/utils";
import type { Scene } from "@/types/scene";

/**
 * Painel das áreas escondidas da cena.
 *
 * É a interação de mesa: quando os jogadores chegam na sala 3, o mestre clica
 * no olho da área 3. Fazer isso pelo palco exigiria achar e selecionar o bloco
 * certo no meio do mapa.
 */
export function FogList({ scene }: { scene: Scene }) {
  const removeFog = useSceneStore((state) => state.removeFog);
  const selectedFogId = useSelectionStore((state) => state.selectedFogId);
  const selectFog = useSelectionStore((state) => state.selectFog);

  if (scene.fog.length === 0) {
    return (
      <p className="text-muted-foreground p-3 text-xs">
        Nenhuma área escondida. Escolha a ferramenta de área na barra de cima e arraste sobre a
        cena.
      </p>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <ul className="space-y-1 p-2">
        {scene.fog.map((region, index) => (
          <li
            key={region.id}
            className={cn(
              "flex items-center gap-1 rounded-md p-1",
              region.id === selectedFogId ? "bg-accent" : "hover:bg-accent/50",
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => selectFog(region.id)}
            >
              <span className="block text-sm">Área {index + 1}</span>
              <span className="text-muted-foreground block text-[10px]">
                {region.width} × {region.height}
                {region.revealed ? " · revelada" : ""}
              </span>
            </button>

            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={region.revealed ? `Esconder área ${index + 1}` : `Revelar área ${index + 1}`}
              onClick={() => toggleFogRevealed(region.id)}
            >
              {region.revealed ? <Eye /> : <EyeOff />}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remover área ${index + 1}`}
              onClick={() => removeFog(scene.id, region.id)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
