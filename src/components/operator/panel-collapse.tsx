"use client";

import { PanelLeftClose, PanelRightClose } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePanelsStore } from "@/lib/store/use-panels-store";

/**
 * Recolhe o painel em que ele está.
 *
 * Mora dentro do painel, do lado da borda que ele encosta. Antes eram dois
 * botões nas pontas do cabeçalho: ficavam longe do que controlavam, e eram dois
 * dos itens que faziam a barra parecer cheia.
 *
 * O caminho de volta é o `FloatingPanelToggle`, que aparece no canto do palco
 * quando o painel está fechado — sem ele, recolher deixaria o painel
 * inalcançável.
 */
export function PanelCollapse({ side, label }: { side: "left" | "right"; label: string }) {
  const toggleLeft = usePanelsStore((state) => state.toggleLeft);
  const toggleRight = usePanelsStore((state) => state.toggleRight);

  const Icon = side === "left" ? PanelLeftClose : PanelRightClose;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground shrink-0"
            aria-label={`Esconder ${label}`}
            onClick={side === "left" ? toggleLeft : toggleRight}
          >
            <Icon />
          </Button>
        }
      />
      <TooltipContent>
        <p>Esconder {label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
