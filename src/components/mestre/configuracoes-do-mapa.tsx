"use client";

import { Box, Moon, RotateCcw, Settings2, Sun, Tags } from "lucide-react";

import { useState } from "react";

import { CeuDoSol } from "@/components/mestre/ceu-do-sol";
import { GridControl } from "@/components/mestre/grid-control";
import { ARCO_IRIS } from "@/components/mestre/menu-da-luz";
import { SeletorDeCor } from "@/components/mestre/seletor-de-cor";
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
import { corDoEscuroDe, limitarEscuridao } from "@/lib/geometry/luz";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import {
  CORES_DO_ESCURO,
  SOL_PADRAO,
  temLuz,
  VISTA_PADRAO,
  type Scene,
  type Sol,
} from "@/types/scene";

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
  const setEscuridao = useSceneStore((state) => state.setEscuridao);
  const setCorDoEscuro = useSceneStore((state) => state.setCorDoEscuro);
  const setInfoDosTokens = useSceneStore((state) => state.setInfoDosTokens);
  const setVista = useSceneStore((state) => state.setVista);
  const vista = scene.vista;

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
            Define para onde a sombra cai.
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
                Arraste o sol. Com Shift, de {TRAVA_EM_GRAUS} em{" "}
                {TRAVA_EM_GRAUS}°.
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

        <span className="bg-border block h-px w-full" />

        {/* De esguelha, logo depois do sol, porque os dois são a mesma espécie
            de coisa: um estado da CENA que muda o desenho inteiro, e não uma
            ferramenta que se pega. E vizinhos porque conversam -- é o sol que
            decide de que lado cada parede acende quando o chão tomba. */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label
              className="flex items-center gap-2 text-xs font-normal"
              htmlFor="vista-da-cena"
            >
              <Box className="text-muted-foreground size-3.5" />
              Mapa de esguelha
            </Label>
            <Switch
              id="vista-da-cena"
              checked={Boolean(vista)}
              onCheckedChange={(ligar) =>
                setVista(scene.id, ligar ? VISTA_PADRAO : undefined)
              }
            />
          </div>

          <p className="text-muted-foreground text-[10px] leading-snug">
            O chão deita e as paredes ficam em pé. É a TV que ganha com isto.
          </p>

          {vista ? (
            <div className="space-y-4">
              <p className="text-muted-foreground text-[10px] leading-snug">
                Sobre o mapa, o botão direito arrastado gira a mesa: de lado
                muda o lado de onde se olha, para cima e para baixo levanta e
                deita o chão.
              </p>

              {/* Em GRAUS as duas, e não uma em porcento: aqui os dois números
                  são ângulos de verdade -- de onde se olha e quanto o chão
                  tomba --, e quem mestra gira o mostrador olhando o mapa. */}
              <Campo rotulo="De onde se olha" valor={`${Math.round(vista.giro)}°`}>
                <Slider
                  aria-label="De onde se olha"
                  value={[Math.round(vista.giro)]}
                  min={0}
                  max={359}
                  step={1}
                  onValueChange={(value) =>
                    setVista(scene.id, { ...vista, giro: primeiro(value) })
                  }
                />
              </Campo>

              {/* O teto é 72 e não 90: rasante, o chão vira um fio e o encaixe
                  encolhe a cena inteira para caber na caixa. O piso é 0, que é
                  o mapa de prumo -- e ele fica AQUI, e não só no interruptor,
                  porque deitar até zero é o jeito de comparar sem desligar. */}
              <Campo
                rotulo="Quanto o chão deita"
                valor={`${Math.round(vista.inclinacao)}°`}
              >
                <Slider
                  aria-label="Quanto o chão deita"
                  value={[Math.round(vista.inclinacao)]}
                  min={0}
                  max={72}
                  step={1}
                  onValueChange={(value) =>
                    setVista(scene.id, {
                      ...vista,
                      inclinacao: primeiro(value),
                    })
                  }
                />
              </Campo>

              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-7 w-full px-2 text-xs"
                onClick={() => setVista(scene.id, VISTA_PADRAO)}
              >
                <RotateCcw className="size-3" />
                Voltar à vista padrão
              </Button>
            </div>
          ) : null}
        </section>

        {temLuz(scene) ? (
          <>
            <span className="bg-border block h-px w-full" />
            <Escuridao
              valor={limitarEscuridao(scene.escuridao)}
              onChange={(valor) => setEscuridao(scene.id, valor)}
              cor={corDoEscuroDe(scene.corDoEscuro)}
              onCor={(cor) => setCorDoEscuro(scene.id, cor)}
            />
          </>
        ) : null}

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
            Medidores escondidos não aparecem.
          </p>
        </section>
      </PopoverContent>
    </Popover>
  );
}

/**
 * O quanto o mapa escurece onde nenhuma luz chega. Ver `Scene.escuridao`.
 *
 * Régua e não interruptor: "noite" e "masmorra" são escuros diferentes, e o
 * mestre acerta o tom olhando a TV. Em zero o mapa é o de sempre, e as luzes
 * viram só brilho -- é o que deixa pôr uma tocha num mapa claro sem apagá-lo.
 *
 * Vizinha do sol, e não uma ferramenta: é estado da cena, como ele.
 */
function Escuridao({
  valor,
  onChange,
  cor,
  onCor,
}: {
  valor: number;
  onChange: (valor: number) => void;
  /** Já validada: o breu quando não há. Ver `corDoEscuroDe`. */
  cor: string;
  onCor: (cor: string) => void;
}) {
  /** O seletor da cor livre, aberto dentro do popover. */
  const [livreAberto, setLivreAberto] = useState(false);
  const livre = !(CORES_DO_ESCURO as readonly string[]).includes(cor);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label
          className="flex items-center gap-2 text-xs font-normal"
          htmlFor="escuridao-da-cena"
        >
          <Moon className="text-muted-foreground size-3.5" />
          Escuridão
        </Label>
        <span className="text-muted-foreground text-[10px] tabular-nums">
          {Math.round(valor * 100)}%
        </span>
      </div>

      <Slider
        id="escuridao-da-cena"
        aria-label="Escuridão"
        value={[Math.round(valor * 100)]}
        min={0}
        max={100}
        step={5}
        onValueChange={(value) => onChange(primeiro(value) / 100)}
      />

      <p className="text-muted-foreground text-[10px] leading-snug">
        Onde nenhuma luz chega. Você vê mais fraco que a mesa.
      </p>

      {/* O tom do escuro: a luz ambiente pelo avesso. Mesmo desenho da cor
          da luz no painel dela -- a paleta curta e a cor livre atrás --, e
          a borda clara em volta de cada bolinha porque são quatro quase
          pretos num fundo escuro. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-[10px]">Tom</span>
        <div
          role="radiogroup"
          aria-label="Tom do escuro"
          className="flex items-center gap-1.5"
        >
          {CORES_DO_ESCURO.map((opcao) => (
            <button
              key={opcao}
              type="button"
              role="radio"
              aria-checked={cor === opcao}
              aria-label={NOME_DO_ESCURO[opcao]}
              title={NOME_DO_ESCURO[opcao]}
              className={cn(
                "focus-visible:ring-ring size-5 rounded-full border-2 outline-none focus-visible:ring-2",
                cor === opcao ? "border-foreground" : "border-white/25",
              )}
              style={{ backgroundColor: opcao }}
              onClick={() => onCor(opcao)}
            />
          ))}
          <button
            type="button"
            aria-label="Tom personalizado"
            aria-expanded={livreAberto}
            title="Tom personalizado"
            className={cn(
              "focus-visible:ring-ring size-5 shrink-0 rounded-full border-2 outline-none focus-visible:ring-2",
              livre || livreAberto ? "border-foreground" : "border-transparent",
            )}
            style={{ background: livre ? cor : ARCO_IRIS }}
            onClick={() => setLivreAberto((aberto) => !aberto)}
          />
        </div>
      </div>

      {livreAberto ? <SeletorDeCor cor={cor} onChange={onCor} /> : null}
    </section>
  );
}

/** O nome de cada tom, pelo lugar que ele pinta. */
const NOME_DO_ESCURO: Record<(typeof CORES_DO_ESCURO)[number], string> = {
  "#000000": "Breu",
  "#0b1330": "Noite",
  "#1c130b": "Caverna",
  "#170a24": "Abismo",
};

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
