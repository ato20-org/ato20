"use client";

import { Grid3x3, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { DEFAULT_GRID, SCENE_WIDTH, type Scene, type SceneGrid } from "@/types/scene";

/**
 * Grade da cena: liga, desliga e ajusta.
 *
 * Ao lado do botão de enquadrar porque as duas são a mesma pergunta — o que a
 * mesa vê do mapa. E a grade é da cena, então ela viaja: a TV e os celulares
 * mostram a mesma, o que é o ponto de contar movimento em voz alta.
 *
 * Clique liga e desliga; o ajuste fica atrás da seta. Ligar é o gesto de toda
 * sessão, e configurar é o de uma vez por mapa — cobrar o segundo para fazer o
 * primeiro seria cobrar sempre pelo que se faz raramente.
 */
export function GridControl({ scene }: { scene: Scene }) {
  const setSceneGrid = useSceneStore((state) => state.setSceneGrid);

  const grid = scene.grid;
  const ligada = Boolean(grid);

  function ajustar(patch: Partial<SceneGrid>) {
    setSceneGrid(scene.id, { ...(grid ?? DEFAULT_GRID), ...patch });
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={ligada ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Grade sobre o mapa"
              aria-pressed={ligada}
              onClick={() => setSceneGrid(scene.id, ligada ? undefined : DEFAULT_GRID)}
            >
              <Grid3x3 />
            </Button>
          }
        />
        <TooltipContent>
          <p className="font-medium">Grade sobre o mapa</p>
          <p className="text-muted-foreground max-w-52">
            {ligada
              ? "A TV e os celulares veem a mesma grade. Clique na seta para ajustar."
              : "Desenha quadrados sobre a cena, e a mesa vê os mesmos."}
          </p>
        </TooltipContent>
      </Tooltip>

      {/* O ajuste só existe com a grade ligada: um painel de tamanho e
          deslocamento de algo invisível não teria o que mostrar. */}
      {ligada && grid ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Ajustar a grade"
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
              <p className="text-sm font-medium">Grade</p>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-7 px-2 text-xs"
                onClick={() => ajustar(DEFAULT_GRID)}
              >
                <RotateCcw className="size-3" />
                Padrão
              </Button>
            </div>

            <Campo
              rotulo="Tamanho do quadrado"
              // Em unidades de cena, e mostrado como fração do plano: "96" não
              // diz nada sozinho, "20 colunas" diz.
              valor={`${Math.round(SCENE_WIDTH / Math.max(8, grid.size))} colunas`}
            >
              <Slider
                aria-label="Tamanho do quadrado"
                value={[grid.size]}
                min={24}
                max={320}
                step={2}
                onValueChange={(value) => ajustar({ size: primeiro(value) })}
              />
            </Campo>

            {/* Deslocamento porque mapa comprado já vem com grade desenhada, e
                ela quase nunca começa no canto exato da imagem. Meia célula
                para cada lado cobre qualquer alinhamento — além disso repete. */}
            <Campo rotulo="Deslocar na horizontal" valor={`${Math.round(grid.offsetX)}`}>
              <Slider
                aria-label="Deslocar na horizontal"
                value={[grid.offsetX]}
                min={0}
                max={Math.max(8, grid.size)}
                step={1}
                onValueChange={(value) => ajustar({ offsetX: primeiro(value) })}
              />
            </Campo>

            <Campo rotulo="Deslocar na vertical" valor={`${Math.round(grid.offsetY)}`}>
              <Slider
                aria-label="Deslocar na vertical"
                value={[grid.offsetY]}
                min={0}
                max={Math.max(8, grid.size)}
                step={1}
                onValueChange={(value) => ajustar({ offsetY: primeiro(value) })}
              />
            </Campo>

            <Campo rotulo="Força da linha" valor={`${Math.round(grid.opacity * 100)}%`}>
              <Slider
                aria-label="Força da linha"
                value={[Math.round(grid.opacity * 100)]}
                min={5}
                max={100}
                step={5}
                onValueChange={(value) => ajustar({ opacity: primeiro(value) / 100 })}
              />
            </Campo>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-normal" htmlFor="grid-dark">
                Linha escura
              </Label>
              <Switch
                id="grid-dark"
                checked={Boolean(grid.dark)}
                onCheckedChange={(dark) => ajustar({ dark })}
              />
            </div>
            <p className="text-muted-foreground text-[10px]">
              Mapa claro pede linha escura; caverna e noite pedem clara.
            </p>
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
        <span className="text-muted-foreground text-[10px] tabular-nums">{valor}</span>
      </div>
      {children}
    </div>
  );
}

function primeiro(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : (value as number);
}
