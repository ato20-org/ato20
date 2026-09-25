"use client";

import { RotateCcw, Settings2, Sun, Tags } from "lucide-react";

import { CeuDoSol } from "@/components/mestre/ceu-do-sol";
import { GridControl } from "@/components/mestre/grid-control";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TRAVA_EM_GRAUS } from "@/lib/geometry/ceu";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { SOL_PADRAO, type Scene, type Sol } from "@/types/scene";

/**
 * As configurações DESTE mapa, no canto do palco.
 *
 * O que mora aqui é o que vale para a cena inteira e se ajusta uma vez: não é
 * gesto sobre o mapa, e por isso não é ferramenta. A barra de ferramentas é a
 * mão -- o que se pega para desenhar, medir, cravar --, e o sol não se pega:
 * ele se liga e se aponta, e depois fica ligado a sessão toda. Estava numa
 * bolsa de ferramentas, atrás de dois cliques, junto de coisas que se usam a
 * cada minuto.
 *
 * No canto de cima à direita, ao lado de quem está na mesa, porque é o canto de
 * CONSULTA e ajuste: do outro lado ficam o painel recolhido e o índice de
 * pontos, e embaixo, colada ao mapa, a mão. Aqui nada é gesto sobre o palco.
 *
 * Só no mapa. Num quadro não há chão para o sol cair.
 */
export function ConfiguracoesDoMapa({ scene }: { scene: Scene }) {
  const setSol = useSceneStore((state) => state.setSol);
  const setInfoDosTokens = useSceneStore((state) => state.setInfoDosTokens);

  const sol = scene.sol;
  const ligado = Boolean(sol);

  function ajustar(patch: Partial<Sol>) {
    setSol(scene.id, { ...(sol ?? SOL_PADRAO), ...patch });
  }

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
                  aria-label="Configurações do mapa"
                >
                  <Settings2 />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <p className="font-medium">Configurações do mapa</p>
          <p className="text-muted-foreground max-w-48">
            O que vale para a cena inteira.
          </p>
        </TooltipContent>
      </Tooltip>

      {/* Rola quando não couber: são dois assuntos com régua cada um, e num
          portátil de tela baixa o fim do painel ficava fora da janela. */}
      <PopoverContent
        align="end"
        className="max-h-[min(70vh,34rem)] w-72 space-y-4 overflow-y-auto"
        side="bottom"
      >
        <p className="text-sm font-medium">Configurações do mapa</p>

        <section className="space-y-3">
          {/* O interruptor na LINHA do título, e não um botão à parte: aqui o
              sol não é uma ferramenta que se pega, é um estado da cena. Ver o
              cabeçalho deste arquivo. */}
          <div className="flex items-center justify-between gap-2">
            <Label
              className="flex items-center gap-2 text-xs font-normal"
              htmlFor="sol-da-cena"
            >
              <Sun className="text-muted-foreground size-3.5" />
              Sol sobre o mapa
            </Label>
            <Switch
              id="sol-da-cena"
              checked={ligado}
              onCheckedChange={(ligar) =>
                setSol(scene.id, ligar ? SOL_PADRAO : undefined)
              }
            />
          </div>

          <p className="text-muted-foreground text-[10px] leading-snug">
            O sol não acende nada: só diz para onde a sombra cai.
          </p>

          {/* O céu ACIMA da força, e fora do bloco que só existe com o sol
              aceso: ele é o retrato do que o interruptor faz, e sumir quando o
              sol apaga esconderia justamente isso. Apagado ele fica sem cor e
              sem resposta ao toque -- ver `CeuDoSol`.

              A direção e o comprimento saíram de duas réguas, uma em graus e
              outra em porcento: ninguém mestra pensando "a sombra cai a 305
              graus". A força fica em régua porque ela não tem gesto no mundo --
              é quão escura a sombra é, e isso se regula olhando o mapa. */}
          <Campo
            rotulo="Sol no céu"
            valor={
              sol
                ? `${sol.angulo}° · ${Math.round(sol.comprimento * 100)}%`
                : ""
            }
          >
            <CeuDoSol
              sol={sol ?? SOL_PADRAO}
              desabilitado={!ligado}
              onChange={ajustar}
            />
          </Campo>

          {ligado && sol ? (
            <div className="space-y-4">
              <p className="text-muted-foreground text-[10px] leading-snug">
                Arraste o sol pelo céu. Perto do meio a sombra encurta; na borda
                ela se estica. Shift trava de {TRAVA_EM_GRAUS} em{" "}
                {TRAVA_EM_GRAUS} graus.
              </p>

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

              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-7 w-full px-2 text-xs"
                onClick={() => ajustar(SOL_PADRAO)}
              >
                <RotateCcw className="size-3" />
                Voltar ao sol padrão
              </Button>
            </div>
          ) : null}
        </section>

        {/* O traço entre os dois: sol e grade valem os dois para a cena
            inteira, mas são assuntos diferentes -- um pinta sombra, o outro
            mede chão -- e sem a linha as duas fileiras de réguas viravam uma
            lista só. */}
        <span className="bg-border block h-px w-full" />

        <GridControl scene={scene} />

        <span className="bg-border block h-px w-full" />

        {/* Terceiro assunto da cena, ao lado do sol e da grade: o que vale para
            ela inteira e se ajusta uma vez. Aqui é o mapa de COMBATE -- a mesa
            quer a vida de todo mundo à vista sem ligar cada rosto a uma barra
            no canto da tela. No mapa da taverna, nada por cima das peças. */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label
              className="flex items-center gap-2 text-xs font-normal"
              htmlFor="info-dos-tokens"
            >
              <Tags className="text-muted-foreground size-3.5" />
              Nome e medidores nos tokens
            </Label>
            <Switch
              id="info-dos-tokens"
              checked={Boolean(scene.infoDosTokens)}
              onCheckedChange={(ligar) => setInfoDosTokens(scene.id, ligar)}
            />
          </div>

          <p className="text-muted-foreground text-[10px] leading-snug">
            Desligado, nem o nome sai do aplicativo: a mesa não recebe a lista.
            Medidor escondido continua escondido, e só você o vê aqui.
          </p>
        </section>
      </PopoverContent>
    </Popover>
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
