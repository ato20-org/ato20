"use client";

import { RotateCcw, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { SOL_PADRAO, type Scene, type Sol } from "@/types/scene";

/**
 * O sol da cena: liga, desliga e aponta.
 *
 * Irmão do `GridControl` e ao lado dele, pela mesma razão que a grade mora ali:
 * é ajuste do CHÃO, feito uma vez por mapa. Clique liga e desliga; a direção
 * fica atrás da seta.
 *
 * Nasce desligado e continua desligado até alguém pedir. Token de pacote quase
 * sempre já traz uma sombra pintada no próprio arquivo, e um sol ligado por
 * padrão daria duas sombras em sentidos diferentes no primeiro mapa de todo
 * mundo -- ver `Sol`.
 */
export function SolControl({ scene }: { scene: Scene }) {
  const setSol = useSceneStore((state) => state.setSol);

  const sol = scene.sol;
  const ligado = Boolean(sol);

  function ajustar(patch: Partial<Sol>) {
    setSol(scene.id, { ...(sol ?? SOL_PADRAO), ...patch });
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={ligado ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Sol sobre o mapa"
              aria-pressed={ligado}
              onClick={() => setSol(scene.id, ligado ? undefined : SOL_PADRAO)}
            >
              <Sun />
            </Button>
          }
        />
        <TooltipContent>
          <p className="font-medium">Sol sobre o mapa</p>
          <p className="text-muted-foreground max-w-52">
            {ligado
              ? "Todo mundo no mapa deita sombra para o mesmo lado. Clique na seta para apontar."
              : "Deita a sombra de cada figura do mapa para o mesmo lado. A mesa vê."}
          </p>
        </TooltipContent>
      </Tooltip>

      {ligado && sol ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Apontar o sol"
                className="text-muted-foreground w-5"
              >
                <span aria-hidden className="text-[10px]">
                  ▲
                </span>
              </Button>
            }
          />
          <PopoverContent align="start" className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Sol</p>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-7 px-2 text-xs"
                onClick={() => ajustar(SOL_PADRAO)}
              >
                <RotateCcw className="size-3" />
                Padrão
              </Button>
            </div>

            <p className="text-muted-foreground text-[10px] leading-snug">
              O sol não acende nada: ele só diz para onde a sombra cai. Mapa que
              já veio com sombra pintada nos tokens dispensa — duas sombras em
              sentidos diferentes é o que se vê.
            </p>

            {/* O ângulo da SOMBRA, e não o do sol. Ver `Sol`. */}
            <Campo rotulo="Para onde a sombra cai" valor={`${sol.angulo}°`}>
              <Slider
                aria-label="Para onde a sombra cai"
                value={[sol.angulo]}
                min={0}
                max={355}
                step={5}
                onValueChange={(value) => ajustar({ angulo: primeiro(value) })}
              />
            </Campo>

            <Campo
              rotulo="Comprimento"
              valor={`${Math.round(sol.comprimento * 100)}%`}
            >
              <Slider
                aria-label="Comprimento"
                value={[Math.round(sol.comprimento * 100)]}
                min={10}
                max={140}
                step={5}
                onValueChange={(value) =>
                  ajustar({ comprimento: primeiro(value) / 100 })
                }
              />
            </Campo>

            <Campo rotulo="Força" valor={`${Math.round(sol.forca * 100)}%`}>
              <Slider
                aria-label="Força"
                value={[Math.round(sol.forca * 100)]}
                min={5}
                max={80}
                step={5}
                onValueChange={(value) =>
                  ajustar({ forca: primeiro(value) / 100 })
                }
              />
            </Campo>
          </PopoverContent>
        </Popover>
      ) : null}
    </>
  );
}

function Campo({
  rotulo,
  valor,
  children,
}: {
  rotulo: string;
  valor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-normal">{rotulo}</Label>
        <span className="text-muted-foreground text-[10px] tabular-nums">
          {valor}
        </span>
      </div>
      {children}
    </div>
  );
}

function primeiro(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : (value as number);
}
