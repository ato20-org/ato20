"use client";

import { Box } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEsguelhaStore } from "@/lib/store/use-esguelha-store";
import { cn } from "@/lib/utils";

/**
 * A troca entre o mapa de prumo e o de esguelha: 2D e 2.5D.
 *
 * Um botão na pílula do palco, ao lado das configurações, e não um interruptor
 * dentro delas. Não é ajuste da cena: é MODO de trabalho. No 2D se edita --
 * mapa, luz, parede, tudo o que as ferramentas fazem --; no 2.5D só se olha a
 * mesa como ela vai aparecer, com o chão deitado e as paredes em pé. Escondido
 * no popover, o modo que muda o palco inteiro ficava atrás de dois cliques e
 * ao lado do sol, como se fosse da mesma espécie.
 *
 * O modo é do MESTRE, e não da cena (ver `useEsguelhaStore`): trocar aqui não
 * mexe no que a mesa vê. Quem põe a mesa de esguelha é um tripé no ar.
 */
export function BotaoDeEsguelha() {
  const ligado = useEsguelhaStore((state) => state.ligada);
  const alternar = useEsguelhaStore((state) => state.alternar);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={ligado}
            aria-label={ligado ? "Voltar ao 2D" : "Ver em 2.5D"}
            className={cn(
              "h-7 gap-1.5 px-2 text-xs",
              ligado && "bg-accent text-accent-foreground",
            )}
            onClick={alternar}
          >
            <Box className="size-3.5" />
            2.5D
          </Button>
        }
      />
      <TooltipContent>
        <p className="font-medium">{ligado ? "Voltar ao 2D" : "Ver em 2.5D"}</p>
        <p className="text-muted-foreground max-w-56">
          {ligado
            ? "Mapa, luz e paredes se editam no 2D."
            : "O chão deita e as paredes ficam de pé. Botão direito sobre o mapa gira e inclina. A janela do espectador só fica assim com um tripé no ar."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
