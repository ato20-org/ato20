"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import {
  CORES_LAPIS,
  ESPESSURAS_LAPIS,
  useToolStore,
} from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";

/**
 * A cor e a espessura do lápis.
 *
 * Só aparece com o LÁPIS escolhido. Um painel de cores à vista o tempo todo na
 * barra seria mobília para um gesto que a maioria das sessões não usa — e a
 * barra já tem seis alvos.
 *
 * A borracha não tem painel: ela é ferramenta própria na barra, e o alcance dela
 * sai da espessura de cada RISCO, não de um número que o mestre regula. Risco
 * grosso é fácil de acertar porque ele é grosso; risco fino precisa de pontaria
 * porque é fino. Um ajuste ali seria um botão para consertar o que já está
 * certo.
 *
 * O gatilho mostra a cor atual, e não um ícone genérico: com a paleta fechada, a
 * cor escolhida é a única informação que importa antes de riscar.
 */
export function PencilControl() {
  const tool = useToolStore((state) => state.tool);
  const cor = useToolStore((state) => state.cor);
  const espessura = useToolStore((state) => state.espessura);
  const setLapis = useToolStore((state) => state.setLapis);

  const scene = useSceneStore(selectEditingScene);
  const removeTracos = useSceneStore((state) => state.removeTracos);

  if (tool !== "lapis") return null;

  const apagandoTudo = scene?.tracos ?? [];

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
                  aria-label="Cor e espessura"
                >
                  <span
                    className="size-4 rounded-full border border-white/30"
                    style={{ background: cor }}
                  />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <p>Cor e espessura</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-56 space-y-3 p-3" side="top">
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
                onClick={() => setLapis({ cor: opcao })}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[10px]">Espessura</span>
            {/* A amostra na medida real da cena não caberia aqui; o que vale é
                comparar uma escolha com a outra. */}
            <span
              className="rounded-full"
              style={{
                width: espessura,
                height: espessura,
                maxWidth: 24,
                maxHeight: 24,
                background: cor,
              }}
            />
          </div>

          <Slider
            value={[
              ESPESSURAS_LAPIS.indexOf(
                espessura as (typeof ESPESSURAS_LAPIS)[number],
              ),
            ]}
            min={0}
            max={ESPESSURAS_LAPIS.length - 1}
            step={1}
            aria-label="Espessura"
            onValueChange={(valor) => {
              const indice = Array.isArray(valor) ? valor[0] : valor;
              setLapis({ espessura: ESPESSURAS_LAPIS[indice ?? 1] });
            }}
          />
        </div>

        {/* Apagar tudo fica aqui e não na barra: é destrutivo e vale a cena
            inteira, então pede o passo a mais de abrir o painel. */}
        {apagandoTudo.length > 0 && scene ? (
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() =>
              removeTracos(
                scene.id,
                apagandoTudo.map((traco) => traco.id),
              )
            }
          >
            <Trash2 />
            Apagar os {apagandoTudo.length} riscos
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
