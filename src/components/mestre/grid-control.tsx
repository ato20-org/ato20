"use client";

import { Grid3x3, Magnet, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { METROS_POR_QUADRADO } from "@/lib/geometry/grid";
import { useSceneStore } from "@/lib/store/use-scene-store";
import {
  DEFAULT_GRID,
  SCENE_WIDTH,
  type Scene,
  type SceneGrid,
} from "@/types/scene";

/**
 * Grade da cena: liga, desliga e ajusta.
 *
 * Nas CONFIGURAÇÕES do mapa, ao lado do sol, e não na régua das ferramentas: a
 * grade não é gesto sobre o mapa. Ela se liga uma vez, no começo, e depois fica
 * ligada a sessão toda -- como o sol, e ao contrário do alfinete e do papel,
 * que se pegam e se largam a cada minuto. Ela morou na régua da direita porque
 * é marcação sobre o chão, mas morar junto do que se PEGA custava um alvo
 * permanente na barra para algo que ninguém toca duas vezes na mesma sessão.
 *
 * E a grade é da cena, então ela viaja: a TV e os celulares mostram a mesma, o
 * que é o ponto de contar movimento em voz alta.
 *
 * Só quem ficou na régua foi a RÉGUA de medir, que é gesto: ela continua lá,
 * apagada enquanto não houver grade -- é o quadrado que diz quanto vale um
 * metro. Ver `ReguaDoMapa`.
 */
export function GridControl({ scene }: { scene: Scene }) {
  const setSceneGrid = useSceneStore((state) => state.setSceneGrid);

  const grid = scene.grid;
  const ligada = Boolean(grid);

  function ajustar(patch: Partial<SceneGrid>) {
    setSceneGrid(scene.id, { ...(grid ?? DEFAULT_GRID), ...patch });
  }

  return (
    <section className="space-y-3">
      {/* O interruptor na LINHA do título, como o do sol: aqui a grade não é
          uma ferramenta que se pega, é um estado da cena. */}
      <div className="flex items-center justify-between gap-2">
        <Label
          className="flex items-center gap-2 text-xs font-normal"
          htmlFor="grade-da-cena"
        >
          <Grid3x3 className="text-muted-foreground size-3.5" />
          Grade sobre o mapa
        </Label>
        <Switch
          id="grade-da-cena"
          checked={ligada}
          onCheckedChange={(ligar) =>
            setSceneGrid(scene.id, ligar ? DEFAULT_GRID : undefined)
          }
        />
      </div>

      {/* A convenção, dita de uma vez: sem ela, "20 colunas" é um número de
          layout, e com ela é a escala do mapa -- é o que faz casar a grade com
          o desenho valer a pena, e é de onde a régua tira o metro. Ver
          `METROS_POR_QUADRADO`. */}
      <p className="text-muted-foreground text-[10px] leading-snug">
        Cada quadrado vale {METROS_POR_QUADRADO} m — um metro quadrado de chão.
        Case a grade com o desenho do mapa e a régua mede certo.
      </p>

      {/* O ajuste só existe com a grade ligada: réguas de tamanho e
          deslocamento de algo invisível não teriam o que mostrar. */}
      {ligada && grid ? (
        <div className="space-y-4">
          {/* O ímã PRIMEIRO, antes das réguas de tamanho: ligar o encaixe é
              decisão de cada mesa e se troca no meio da sessão -- "hoje a gente
              conta quadrado" --, e casar a grade com o desenho do mapa se faz
              uma vez e não se toca mais. */}
          <div className="flex items-center justify-between gap-2">
            <Label
              className="flex items-center gap-2 text-xs font-normal"
              htmlFor="grade-encaixe"
            >
              <Magnet className="text-muted-foreground size-3.5" />
              Encaixar na grade
            </Label>
            <Switch
              id="grade-encaixe"
              checked={Boolean(grid.snap)}
              onCheckedChange={(snap) => ajustar({ snap })}
            />
          </div>

          <p className="text-muted-foreground text-[10px] leading-snug">
            O token vai para o meio do quadrado — no seu arrasto e no dedo dos
            jogadores. Alt solta a peça exatamente onde ela está.
          </p>

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
              ela quase nunca começa no canto exato da imagem. Meia célula para
              cada lado cobre qualquer alinhamento — além disso repete. */}
          <Campo
            rotulo="Deslocar na horizontal"
            valor={`${Math.round(grid.offsetX)}`}
          >
            <Slider
              aria-label="Deslocar na horizontal"
              value={[grid.offsetX]}
              min={0}
              max={Math.max(8, grid.size)}
              step={1}
              onValueChange={(value) => ajustar({ offsetX: primeiro(value) })}
            />
          </Campo>

          <Campo
            rotulo="Deslocar na vertical"
            valor={`${Math.round(grid.offsetY)}`}
          >
            <Slider
              aria-label="Deslocar na vertical"
              value={[grid.offsetY]}
              min={0}
              max={Math.max(8, grid.size)}
              step={1}
              onValueChange={(value) => ajustar({ offsetY: primeiro(value) })}
            />
          </Campo>

          <Campo
            rotulo="Força da linha"
            valor={`${Math.round(grid.opacity * 100)}%`}
          >
            <Slider
              aria-label="Força da linha"
              value={[Math.round(grid.opacity * 100)]}
              min={5}
              max={100}
              step={5}
              onValueChange={(value) =>
                ajustar({ opacity: primeiro(value) / 100 })
              }
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

          {/* Volta o DESENHO da grade, e não o ímã: `DEFAULT_GRID` não fala
              de encaixe, então o interruptor acima atravessa o botão. É o que
              se quer -- endireitar a grade sobre um mapa novo não é dizer que
              a mesa parou de contar quadrado. */}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 w-full px-2 text-xs"
            onClick={() => ajustar(DEFAULT_GRID)}
          >
            <RotateCcw className="size-3" />
            Voltar à grade padrão
          </Button>
        </div>
      ) : null}
    </section>
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
