"use client";

import {
  Circle,
  Minus,
  RectangleHorizontal,
  Trash2,
  Triangle,
  type LucideIcon,
} from "lucide-react";

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
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { CORES_LAPIS, useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import { FORMAS_MEDIDOR, type FormaMedidor } from "@/types/scene";

const FORMAS: Record<
  FormaMedidor,
  { rotulo: string; dica: string; icone: LucideIcon }
> = {
  linha: {
    rotulo: "Régua",
    dica: "Quanto tem daqui até ali.",
    icone: Minus,
  },
  circulo: {
    rotulo: "Círculo",
    dica: "Raio e área: explosão, aura, alcance.",
    icone: Circle,
  },
  cone: {
    rotulo: "Cone",
    dica: "Alcance e abertura: sopro, lanterna.",
    icone: Triangle,
  },
  retangulo: {
    rotulo: "Retângulo",
    dica: "Lados e área: sala, zona.",
    icone: RectangleHorizontal,
  },
};

/**
 * A forma e a cor do próximo medidor.
 *
 * Só aparece com a RÉGUA escolhida, como o painel do lápis: quatro formas à
 * vista o tempo todo seriam mobília na barra. O gatilho mostra a forma atual
 * na cor atual, que é o que importa antes de arrastar.
 */
export function ReguaControl({
  lado = "top",
}: {
  /**
   * De que lado o painel abre. `left` é o da régua do mapa, encostada na borda
   * direita do palco; `top` é o do rodapé, onde o controle nasceu.
   */
  lado?: "top" | "left";
} = {}) {
  const tool = useToolStore((state) => state.tool);
  const forma = useToolStore((state) => state.formaMedidor);
  const cor = useToolStore((state) => state.corMedidor);
  const setMedidor = useToolStore((state) => state.setMedidor);

  const scene = useSceneStore(selectEditingScene);
  const removeMedidores = useSceneStore((state) => state.removeMedidores);

  if (tool !== "regua") return null;

  const Atual = FORMAS[forma].icone;
  const colocados = scene?.medidores ?? [];

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Forma e cor">
                  <Atual style={{ color: cor }} />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <p>Forma e cor do medidor</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-56 space-y-3 p-3" side={lado}>
        <div className="space-y-1.5">
          <span className="text-muted-foreground text-[10px]">Forma</span>

          <div className="flex items-center gap-1">
            {FORMAS_MEDIDOR.map((opcao) => {
              const { rotulo, dica, icone: Icone } = FORMAS[opcao];

              return (
                <Tooltip key={opcao}>
                  <TooltipTrigger
                    render={
                      <Button
                        variant={opcao === forma ? "secondary" : "ghost"}
                        size="icon-sm"
                        aria-label={rotulo}
                        aria-pressed={opcao === forma}
                        onClick={() => setMedidor({ formaMedidor: opcao })}
                      >
                        <Icone />
                      </Button>
                    }
                  />
                  <TooltipContent>
                    <p className="font-medium">{rotulo}</p>
                    <p className="text-muted-foreground max-w-48">{dica}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-muted-foreground text-[10px]">Cor</span>

          <div className="flex items-center gap-1.5">
            {CORES_LAPIS.map((opcao) => (
              <button
                key={opcao}
                type="button"
                aria-label={`Cor ${opcao}`}
                aria-pressed={opcao === cor}
                className={cn(
                  "size-6 rounded-full border transition-transform",
                  opcao === cor
                    ? "border-foreground scale-110"
                    : "border-white/20 hover:scale-105",
                )}
                style={{ background: opcao }}
                onClick={() => setMedidor({ corMedidor: opcao })}
              />
            ))}
          </div>
        </div>

        {/* Apagar tudo aqui e não na barra, como no lápis: é destrutivo e vale
            a cena inteira. Um por um é selecionar e Delete. */}
        {colocados.length > 0 && scene ? (
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() =>
              removeMedidores(
                scene.id,
                colocados.map((medidor) => medidor.id),
              )
            }
          >
            <Trash2 />
            Apagar os {colocados.length} medidores
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
