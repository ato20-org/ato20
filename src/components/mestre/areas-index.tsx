"use client";

import { useState } from "react";
import { EyeOff } from "lucide-react";

import { FogList } from "@/components/mestre/fog-list";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Scene } from "@/types/scene";

/**
 * As áreas escondidas da cena, ao lado do índice de pontos.
 *
 * Era uma ABA do painel de Cenas, e o lugar estava errado por duas razões. A
 * primeira é que revelar área é interação de MESA -- os jogadores entram na
 * sala 3, o mestre clica no olho da área 3 --, e ela acontece olhando o mapa,
 * não a lista de cenas. Abrir a aba trocava o que a coluna mostrava, e voltar
 * para os mapas custava outro clique no meio da jogada.
 *
 * A segunda é que a aba descrevia a cena ABERTA enquanto as vizinhas
 * descreviam a campanha inteira. Com fundo entrando na mesma coluna, eram três
 * abas com dois assuntos diferentes.
 *
 * Aqui ela fica ao lado dos pontos, e pelo mesmo motivo que eles: os dois são
 * consulta sobre a cena que está no palco, e alcançam o que está fora da
 * vista. A lista em si continua sendo a mesma -- ver `FogList`.
 */
export function AreasIndex({ scene }: { scene: Scene }) {
  const [aberto, setAberto] = useState(false);

  const total = scene.fog.length;
  const reveladas = scene.fog.filter((region) => region.revealed).length;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <div className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    variant={aberto ? "secondary" : "ghost"}
                    size="icon-sm"
                    // Mesma regra do índice de pontos: o número ao lado do
                    // ícone diz que há áreas sem precisar abrir a lista.
                    className={cn(total > 0 && "w-auto gap-1 px-2")}
                    aria-label="Áreas escondidas"
                  >
                    <EyeOff />
                    {total > 0 ? (
                      <span className="text-xs tabular-nums">
                        {/* Reveladas sobre o total, e não só o total: o que o
                            mestre pergunta no meio da sessão é quanto do mapa
                            a mesa já viu, e "2/6" responde sem abrir nada. */}
                        {reveladas}/{total}
                      </span>
                    ) : null}
                  </Button>
                }
              />
            }
          />
          <TooltipContent>
            <p className="font-medium">Áreas escondidas</p>
            <p className="text-muted-foreground max-w-48">
              As áreas desta cena. O olho de cada uma revela ou esconde.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      <PopoverContent className="w-72 p-0" side="bottom" align="start">
        {total === 0 ? (
          <p className="text-muted-foreground p-3 text-xs leading-snug">
            Nenhuma área nesta cena. Escolha um desenho na régua da esquerda e
            marque-o como área escondida.
          </p>
        ) : (
          // `flex` com altura máxima: a `FogList` é uma coluna que rola, e
          // dentro de um popover sem limite ela cresceria até o pé da tela.
          <div className="flex max-h-72 flex-col">
            <FogList scene={scene} />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
