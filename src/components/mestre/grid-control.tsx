"use client";

import { Grid3x3, Hexagon, Magnet, RotateCcw, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  METROS_POR_QUADRADO,
  passoDaGrade,
  periodoDaGrade,
} from "@/lib/geometry/grid";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
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

  /**
   * Troca a forma da casa, com o deslocamento trazido para dentro do período
   * novo: o do quadrado vai até um lado, e o do hexágono em pé até raiz de três
   * lados na vertical. Sem isto a régua do deslocamento abriria com o botão
   * além do fim dela.
   */
  function trocarForma(forma: SceneGrid["forma"]) {
    if (!grid) return;
    const periodo = periodoDaGrade({ ...grid, forma });

    ajustar({
      forma,
      offsetX: grid.offsetX % periodo.x,
      offsetY: grid.offsetY % periodo.y,
    });
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
        Cada casa vale {METROS_POR_QUADRADO} m na régua.
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
            O token cai no meio da casa. Alt solta livre.
          </p>

          {/* A forma antes do tamanho: é a primeira coisa a casar com o desenho
              do mapa, e trocar de forma depois de acertar o tamanho desacerta
              o deslocamento. */}
          <div
            role="group"
            aria-label="Forma da casa"
            className="grid grid-cols-3 gap-1"
          >
            {FORMAS.map((opcao) => {
              const escolhida = grid.forma === opcao.forma;

              return (
                <button
                  key={opcao.rotulo}
                  type="button"
                  aria-label={opcao.descricao}
                  aria-pressed={escolhida}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border py-1.5 text-[10px] transition-colors",
                    escolhida
                      ? "border-primary bg-primary/25 text-foreground"
                      : "border-border text-muted-foreground hover:bg-primary/10",
                  )}
                  onClick={() => trocarForma(opcao.forma)}
                >
                  <opcao.Icone
                    className={cn("size-4", opcao.forma === "hex-lado" && "rotate-90")}
                  />
                  {opcao.rotulo}
                </button>
              );
            })}
          </div>

          <Campo
            rotulo="Tamanho da casa"
            // Em unidades de cena, e mostrado como fração do plano: "96" não
            // diz nada sozinho, "20 colunas" diz.
            valor={`${Math.round(SCENE_WIDTH / larguraDaColuna(grid))} colunas`}
          >
            <Slider
              aria-label="Tamanho da casa"
              value={[grid.size]}
              min={24}
              max={320}
              step={2}
              onValueChange={(value) => ajustar({ size: primeiro(value) })}
            />
          </Campo>

          {/* Deslocamento porque mapa comprado já vem com grade desenhada, e
              ela quase nunca começa no canto exato da imagem. Um período
              cobre qualquer alinhamento — além disso repete. */}
          <Campo
            rotulo="Deslocar na horizontal"
            valor={`${Math.round(grid.offsetX)}`}
          >
            <Slider
              aria-label="Deslocar na horizontal"
              value={[grid.offsetX]}
              min={0}
              max={periodoDaGrade(grid).x}
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
              max={periodoDaGrade(grid).y}
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

          {/* Volta o DESENHO da grade, e não o ímã nem a forma: `DEFAULT_GRID`
              não fala de nenhum dos dois, então eles atravessam o botão. É o
              que se quer -- endireitar a grade sobre um mapa novo não é dizer
              que a mesa parou de contar casa, nem que o mapa deixou de ser de
              hexágonos. */}
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

/** As três formas da casa, na ordem em que o botão as mostra. */
const FORMAS: {
  forma: SceneGrid["forma"];
  rotulo: string;
  descricao: string;
  Icone: typeof Square;
}[] = [
  {
    forma: undefined,
    rotulo: "Quadrado",
    descricao: "Casa quadrada",
    Icone: Square,
  },
  {
    forma: "hex-ponta",
    rotulo: "Hex ponta",
    descricao: "Hexágono com a ponta para cima",
    Icone: Hexagon,
  },
  {
    forma: "hex-lado",
    rotulo: "Hex lado",
    descricao: "Hexágono com o lado para cima",
    Icone: Hexagon,
  },
];

/**
 * De quanto em quanto nasce uma coluna nova.
 *
 * Um passo no quadrado e no hexágono em pé. No deitado as colunas se encaixam
 * pelas pontas, e a seguinte nasce a um raio e meio da anterior, e não a um
 * passo.
 */
function larguraDaColuna(grid: SceneGrid): number {
  const passo = passoDaGrade(grid);
  return grid.forma === "hex-lado" ? (passo * Math.sqrt(3)) / 2 : passo;
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
