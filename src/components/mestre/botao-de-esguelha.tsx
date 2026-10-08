"use client";

import { Box } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { t } from "@/lib/i18n/mestre";
import { useEsguelhaStore } from "@/lib/store/use-esguelha-store";
import { cn } from "@/lib/utils";

/**
 * A troca entre o mapa de prumo e o de esguelha: 2D e 2.5D.
 *
 * Um botão na pílula do palco, ao lado das configurações, e não um interruptor
 * dentro delas. Não é ajuste da cena: é MODO de trabalho. No 2D se edita com as
 * FERRAMENTAS -- desenhar mapa, cravar luz, erguer parede, medir --; no 2.5D se
 * confere a mesa como ela vai aparecer, com o chão deitado e as paredes em pé.
 * As configurações da cena (sol, escuridão, grade, cor do vazio) seguem nos
 * dois modos: são estado, não ferramenta, e têm efeito à vista de esguelha.
 * Escondido no popover, o modo que muda o palco inteiro ficava atrás de dois
 * cliques e ao lado do sol, como se fosse da mesma espécie.
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
            aria-label={ligado ? t.palco.voltarAo2d : t.palco.verEm25d}
            className={cn(
              "h-7 gap-1.5 px-2 text-xs",
              ligado && "bg-accent text-accent-foreground",
            )}
            onClick={alternar}
          >
            <Box className="size-3.5" />
            {t.palco.esguelha}
          </Button>
        }
      />
      <TooltipContent>
        <p className="font-medium">
          {ligado ? t.palco.voltarAo2d : t.palco.verEm25d}
        </p>
        <p className="text-muted-foreground max-w-56">
          {ligado ? t.palco.voltarAo2dDica : t.palco.verEm25dDica}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
