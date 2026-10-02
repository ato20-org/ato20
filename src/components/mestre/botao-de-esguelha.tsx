"use client";

import { Box } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import { VISTA_PADRAO, type Scene } from "@/types/scene";

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
 * Ligar grava `VISTA_PADRAO` e desligar APAGA a vista (ver `setVista`): a cena
 * que nunca pediu o modo continua sem o campo. O giro e a inclinação são
 * ajustados no próprio 2.5D, com o botão direito sobre a mesa.
 */
export function BotaoDeEsguelha({ scene }: { scene: Scene }) {
  const setVista = useSceneStore((state) => state.setVista);
  const ligado = Boolean(scene.vista);

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
            onClick={() =>
              setVista(scene.id, ligado ? undefined : VISTA_PADRAO)
            }
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
            : "O chão deita e as paredes ficam de pé, aqui e na janela do espectador. Botão direito sobre o mapa gira e inclina."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
