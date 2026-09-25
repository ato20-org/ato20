"use client";

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
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import { CORES_POSTIT, type CorPostit } from "@/types/scene";

/** O papel de cada cor, na amostra do painel. */
const AMOSTRA: Record<CorPostit, string> = {
  amarelo: "bg-amber-200 ring-amber-500/60",
  rosa: "bg-pink-200 ring-pink-500/60",
  azul: "bg-sky-200 ring-sky-500/60",
  verde: "bg-emerald-200 ring-emerald-500/60",
  branco: "bg-neutral-50 ring-neutral-400/70",
};

/**
 * A cor do próximo postit.
 *
 * Só aparece com o POSTIT escolhido, como o painel do lápis: são as duas
 * ferramentas com preferência antes do gesto, e uma paleta à vista o tempo todo
 * seria mobília numa barra que já tem meia dúzia de alvos.
 *
 * O gatilho mostra a cor atual em vez de um ícone genérico — com o painel
 * fechado, é a única informação que importa antes de colar.
 *
 * Não tem "apagar todos", e aqui ele difere do lápis. Riscos se acumulam por
 * dezenas num gesto de dois segundos, e apagar um por um seria trabalho; postit
 * se cola um por vez, com texto escrito à mão dentro. Um botão que apaga a
 * anotação de uma sessão inteira num clique não vale a conveniência.
 */
export function PostitControl({
  lado = "top",
}: {
  /**
   * De que lado o painel abre. `top` é o do rodapé, onde o controle nasceu;
   * `right` é o da régua do quadro, encostada na borda esquerda, e `left` o da
   * régua do mapa, encostada na direita -- para cima, das duas, o painel
   * subiria por cima das próprias ferramentas.
   */
  lado?: "top" | "right" | "left";
} = {}) {
  const tool = useToolStore((state) => state.tool);
  const corPostit = useToolStore((state) => state.corPostit);
  const setCorPostit = useToolStore((state) => state.setCorPostit);

  if (tool !== "postit") return null;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Cor do postit"
                >
                  <span
                    className={cn(
                      "size-4 rounded-[2px] ring-1",
                      AMOSTRA[corPostit],
                    )}
                  />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <p>Cor do postit</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-52 space-y-2 p-3" side={lado}>
        <span className="text-muted-foreground text-[10px]">
          Cor do próximo postit
        </span>

        <div className="flex items-center gap-2">
          {CORES_POSTIT.map((cor) => (
            <button
              key={cor}
              type="button"
              aria-label={`Papel ${cor}`}
              aria-pressed={cor === corPostit}
              className={cn(
                "size-8 rounded-[3px] ring-1 transition-transform",
                AMOSTRA[cor],
                cor === corPostit
                  ? "ring-foreground scale-110 ring-2"
                  : "hover:scale-105",
              )}
              onClick={() => setCorPostit(cor)}
            />
          ))}
        </div>

        <p className="text-muted-foreground text-[10px] leading-snug">
          A cor separa assunto: pista, regra, fala de PNJ, lembrete. Trocar aqui
          não repinta os papéis já colados.
        </p>
      </PopoverContent>
    </Popover>
  );
}
