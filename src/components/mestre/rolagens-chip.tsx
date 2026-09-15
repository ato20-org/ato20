"use client";

import { Dices } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import { cn } from "@/lib/utils";

/**
 * As rolagens dos jogadores, na pílula do canto do palco.
 *
 * Segundo chip da mesma moldura de Jogadores, e é ali que ele pertence: as duas
 * respondem sobre a MESA, e não sobre o mapa — quem entrou, e o que eles
 * tiraram. O saquinho do mestre continua flutuando sobre a cena, porque é
 * ferramenta de quem opera, não consulta sobre os outros.
 *
 * O contador conta o que está na mesa AGORA, não o histórico: é o número que
 * responde "tem dado esperando leitura?" sem abrir nada.
 *
 * O chip só CONTA e ABRE; ver e limpar é na janela. Ele já foi um popover com a
 * lista inteira dentro, e isso rachava a mesma informação em três lugares — a
 * fileira flutuante sobre o mapa, este popover, e nenhum dos dois atracável.
 * Agora é uma janela como as outras: ver `RolagensBody`.
 */
export function RolagensChip() {
  const naMesa = useRolagensStore((state) => state.bandeja.length);

  const abrir = useAbrirJanela();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(naMesa > 0 && "w-auto gap-1 px-2")}
            aria-label={`Rolagens dos jogadores (${naMesa} na mesa)`}
            onClick={() => abrir({ tipo: "rolagens" })}
          >
            <Dices />
            {naMesa > 0 ? (
              <span className="text-xs tabular-nums">{naMesa}</span>
            ) : null}
          </Button>
        }
      />
      <TooltipContent>
        <p className="font-medium">Rolagens</p>
        <p className="text-muted-foreground max-w-48">
          {naMesa > 0
            ? `${naMesa} na mesa agora. Elas saem sozinhas em trinta segundos.`
            : "O que os jogadores tiraram no celular aparece aqui."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
