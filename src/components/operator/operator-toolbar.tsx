"use client";

import { MapPin, MousePointer2, SquareDashedBottom } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToolStore, type Tool } from "@/lib/store/use-tool-store";

const TOOLS: Array<{ tool: Tool; label: string; hint: string; icon: typeof MousePointer2 }> = [
  {
    tool: "select",
    label: "Selecionar",
    hint: "Clique para selecionar, arraste no vazio para marcar vários.",
    icon: MousePointer2,
  },
  {
    tool: "fog",
    label: "Área escondida",
    hint: "Arraste sobre a cena para cobrir uma região. A mesa vê preto sólido.",
    icon: SquareDashedBottom,
  },
  {
    tool: "pin",
    label: "Ponto de anotação",
    hint: "Clique no mapa para cravar um ponto com nota e anexos. Só você vê — nem a TV nem os celulares recebem.",
    icon: MapPin,
  },
];

/**
 * Selecionar e esconder área, flutuando no canto do palco.
 *
 * Saiu do cabeçalho: escolher ferramenta é mira no mapa, e o cabeçalho é da
 * sessão. Mesma pílula dos controles de zoom, e ao lado deles — os dois são o
 * mesmo tipo de gesto, e em cantos opostos obrigavam a atravessar a tela entre
 * duas ações que andam juntas.
 */
export function OperatorToolbar() {
  const tool = useToolStore((state) => state.tool);
  const setTool = useToolStore((state) => state.setTool);

  return (
    <div
      className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur"
      role="toolbar"
      aria-label="Ferramentas"
    >
      {TOOLS.map(({ tool: value, label, hint, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger
            render={
              <Button
                variant={tool === value ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label={label}
                aria-pressed={tool === value}
                onClick={() => setTool(value)}
              >
                <Icon />
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">{label}</p>
            <p className="text-muted-foreground max-w-48">{hint}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
