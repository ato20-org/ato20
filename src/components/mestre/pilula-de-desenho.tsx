"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import { temNevoa, temSol, type Scene } from "@/types/scene";

/**
 * O DESENHO de uma coisa desenhada: o primeiro passo da pílula.
 *
 * Três, e os mesmos três para as três naturezas. Por dentro cada natureza
 * guarda o nome que já usava -- `retangulo`, `elipse`, `poligono` --, e é só
 * isso que estas chaves traduzem.
 */
const GEOMETRIAS = [
  {
    chave: "quadrado",
    formato: "retangulo",
    label: "Quadrado",
    hint: "Arraste de canto a canto. Shift trava o quadrado.",
  },
  {
    chave: "circulo",
    formato: "elipse",
    label: "Círculo",
    hint: "Arraste de canto a canto. Shift trava o círculo.",
  },
  {
    chave: "livre",
    formato: "poligono",
    label: "Traço livre",
    hint: "Contorna vértice a vértice. O clique no primeiro fecha.",
  },
] as const;

type Geometria = (typeof GEOMETRIAS)[number];

/**
 * O que a coisa É: o segundo passo.
 *
 * O mesmo desenho, três significados. É a pergunta que a barra fazia sete
 * vezes -- um botão por par -- e que aqui é feita uma vez só.
 */
const NATUREZAS = [
  {
    chave: "parede",
    label: "Parede",
    hint: "A luz para nela. A mesa só vê a sombra que ela faz.",
  },
  {
    chave: "area",
    label: "Área",
    hint: "Esconde a região. A mesa vê preto sólido.",
  },
  {
    chave: "elemento",
    label: "Elemento",
    hint: "Desenha sobre a cena. Nasce só para você.",
  },
] as const;

/** O amarelo da parede, o mesmo de `LuzLayer`. */
const COR_DA_PAREDE = "#facc15";

/** O contorno de cada geometria, numa caixa de 18. Ver `AmostraDaForma`. */
const DESENHOS: Record<Geometria["chave"], React.ReactNode> = {
  quadrado: <rect x={3} y={4.5} width={12} height={9} rx={0.5} />,
  circulo: <ellipse cx={9} cy={9} rx={6} ry={4.5} />,
  livre: <polygon points="3,12.5 5.5,4 10.5,6.5 15,4.5 13.5,13.5" />,
};

/**
 * O botão desenha O QUE VAI SER DESENHADO.
 *
 * A primeira versão punha um ícone de biblioteca por natureza -- um tijolo, um
 * olho riscado, um par de formas --, e os três se repetiam iguais embaixo das
 * três geometrias: nove botões, três desenhos. Não dizia qual das nove
 * combinações era qual, e ainda gastava três ícones que não são o assunto.
 *
 * Aqui o desenho muda nos dois eixos. A GEOMETRIA dá a figura -- quadrado,
 * elipse, contorno torto --, e a NATUREZA dá o material:
 *
 * - `parede`  massa amarela cheia, borda sólida. É pedra.
 * - `area`    figura cheia e escura, borda tracejada. É o que tapa o mapa.
 * - `elemento` só o traço fino. É marca sobre a cena, não corpo.
 *
 * `null` é a amostra neutra, para o botão da régua antes de a natureza ser
 * escolhida.
 */
function AmostraDaForma({
  geometria,
  natureza,
}: {
  geometria: Geometria["chave"];
  natureza: Natureza | null;
}) {
  const pintura =
    natureza === "parede"
      ? {
          fill: COR_DA_PAREDE,
          fillOpacity: 0.3,
          stroke: COR_DA_PAREDE,
          strokeWidth: 1.5,
        }
      : natureza === "area"
        ? {
            fill: "currentColor",
            fillOpacity: 0.45,
            stroke: "currentColor",
            strokeWidth: 1.25,
            strokeDasharray: "2.5 2",
          }
        : {
            fill: "none",
            stroke: "currentColor",
            strokeWidth: natureza === "elemento" ? 1.5 : 1.25,
          };

  return (
    <svg
      aria-hidden
      viewBox="0 0 18 18"
      className="size-[18px]"
      strokeLinejoin="round"
    >
      <g {...pintura}>{DESENHOS[geometria]}</g>
    </svg>
  );
}

type Natureza = (typeof NATUREZAS)[number]["chave"];

/**
 * A pílula de desenho: o que se desenha na cena, em dois passos.
 *
 * Primeiro a GEOMETRIA -- quadrado, círculo, traço livre --, depois o que
 * aquele desenho SIGNIFICA -- parede, área escondida, elemento. Eram sete
 * botões na barra fazendo as duas perguntas ao mesmo tempo, um por par: três de
 * área escondida, três de forma e a parede. Aqui cada pergunta é feita uma vez,
 * e a segunda abre para a direita.
 *
 * A ordem importa e foi escolhida: primeiro o desenho, porque é o que a mão vai
 * fazer daqui a um segundo, e o mestre que quer contornar uma sala já sabe que
 * vai contornar antes de saber se aquilo vai virar parede ou névoa. Perguntar
 * a natureza primeiro obrigaria a decidir o significado antes do gesto.
 *
 * O que a unificação comprou, além da barra: o TRAÇO LIVRE. Ele existia só na
 * área escondida, e contornar à mão o que não é quadrado nem redondo é a mesma
 * necessidade nas três -- a parede de uma caverna, a mancha de uma clareira.
 * Com o vocabulário compartilhado, ele entrou nas três de uma vez.
 *
 * O que NÃO entrou: alfinete, postit, régua, lápis e borracha. Nenhum
 * deles responde às duas perguntas daqui -- são cravar, colar, acender, medir,
 * riscar e apagar, e cada um já é um alvo direto onde está.
 */
export function PilulaDeDesenho({ scene }: { scene: Pick<Scene, "tipo"> }) {
  const tool = useToolStore((state) => state.tool);
  const setTool = useToolStore((state) => state.setTool);
  const tipoDeForma = useToolStore((state) => state.tipoDeForma);
  const setForma = useToolStore((state) => state.setForma);
  const formatoDeArea = useToolStore((state) => state.formatoDeArea);
  const setFormatoDeArea = useToolStore((state) => state.setFormatoDeArea);
  const formatoDaParede = useToolStore((state) => state.formatoDaParede);
  const setFormatoDaParede = useToolStore((state) => state.setFormatoDaParede);

  /** Qual geometria está com a fileira de naturezas aberta. `null` = fechada. */
  const [aberta, setAberta] = useState<Geometria["chave"] | null>(null);

  /**
   * Cada natureza pergunta pela capacidade que ela usa, e não pelo tipo da
   * cena. No QUADRO não há chão: nem parede para a luz parar, nem região do
   * mapa para esconder da mesa. No FUNDO há chão, mas a luz já vem pintada na
   * imagem e a imagem existe para ser vista de uma vez -- as mesmas duas caem,
   * por duas razões diferentes. Sobra o elemento, que vale nos três.
   */
  const naturezas = NATUREZAS.filter(
    (natureza) =>
      (natureza.chave !== "parede" || temSol(scene)) &&
      (natureza.chave !== "area" || temNevoa(scene)),
  );

  /**
   * Sobrou UMA natureza: a pílula deixa de ter dois passos.
   *
   * No mapa a pergunta "o que isto vai ser" é real -- parede, área escondida
   * ou elemento. No fundo e no quadro sobra o elemento, e a fileira abria com
   * um botão só: um clique para escolher o que já estava escolhido, e a
   * resposta da régua atravessada por uma tira que não decide nada.
   *
   * Com uma, o botão da geometria É a ferramenta, e a fileira não abre.
   */
  const unica = naturezas.length === 1 ? naturezas[0]! : null;

  /** O par que está na mão AGORA, lido do store -- não de estado local. */
  const naMao: { geometria: Geometria["chave"]; natureza: Natureza } | null =
    (() => {
      const de = (formato: string) =>
        GEOMETRIAS.find((geometria) => geometria.formato === formato)?.chave;

      if (tool === "parede") {
        const geometria = de(formatoDaParede);
        return geometria ? { geometria, natureza: "parede" } : null;
      }
      if (tool === "fog") {
        const geometria = de(formatoDeArea);
        return geometria ? { geometria, natureza: "area" } : null;
      }
      if (tool === "forma") {
        const geometria = de(tipoDeForma);
        return geometria ? { geometria, natureza: "elemento" } : null;
      }

      return null;
    })();

  /**
   * Escolher a natureza é escolher a ferramenta: é aqui que os dois passos
   * viram um par, e é o único lugar em que o vocabulário da pílula encosta nos
   * três campos que cada natureza guarda.
   */
  function pegar(geometria: Geometria, natureza: Natureza) {
    if (natureza === "parede") {
      setFormatoDaParede(geometria.formato);
      setTool("parede");
    } else if (natureza === "area") {
      // A área não tem `linha`, e nenhuma das três geometrias é uma: o
      // vocabulário da pílula já é o subconjunto que serve às três.
      setFormatoDeArea(geometria.formato);
      setTool("fog");
    } else {
      setForma({ tipoDeForma: geometria.formato });
      setTool("forma");
    }

    // A fileira FICA aberta: trocar de natureza sem redesenhar é o gesto de
    // quem está decidindo, e fechá-la a cada escolha custaria um clique para
    // voltar. Com uma natureza só não há fileira, e não há o que manter aberto.
    setAberta(unica ? null : geometria.chave);
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      {GEOMETRIAS.map((geometria) => {
        const escolhida = naMao?.geometria === geometria.chave;

        return (
          /* `relative` aqui e a fileira em `absolute left-full`: a pílula mora
             na RÉGUA, que é uma coluna estreita na borda esquerda do palco, e
             uma fileira de botões dentro dela esticaria a régua inteira. Assim
             a coluna continua com a largura de um botão e as opções crescem
             para a direita, por cima do palco, que é onde há espaço. */
          <div key={geometria.chave} className="relative">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={escolhida ? "secondary" : "ghost"}
                    size="icon-sm"
                    aria-label={geometria.label}
                    aria-expanded={unica ? undefined : aberta === geometria.chave}
                    className={cn(!escolhida && "text-muted-foreground")}
                    onClick={() =>
                      unica
                        ? pegar(geometria, unica.chave)
                        : setAberta(
                            aberta === geometria.chave ? null : geometria.chave,
                          )
                    }
                  >
                    {/* O botão da régua já mostra o MATERIAL quando esta
                        geometria está na mão: assim a régua sozinha responde
                        "o que estou prestes a desenhar". */}
                    <AmostraDaForma
                      geometria={geometria.chave}
                      natureza={escolhida ? naMao!.natureza : null}
                    />
                  </Button>
                }
              />
              <TooltipContent side="right">
                <p className="font-medium">{geometria.label}</p>
                <p className="text-muted-foreground max-w-48">
                  {geometria.hint}
                </p>
              </TooltipContent>
            </Tooltip>

            {!unica && aberta === geometria.chave ? (
              <div
                role="toolbar"
                aria-label={`${geometria.label}: o que desenhar`}
                className="bg-background/85 absolute top-0 left-full z-10 ml-1 flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur"
              >
                {naturezas.map((natureza) => {
                  const ativa =
                    naMao?.geometria === geometria.chave &&
                    naMao.natureza === natureza.chave;

                  return (
                    <Tooltip key={natureza.chave}>
                      <TooltipTrigger
                        render={
                          <Button
                            variant={ativa ? "secondary" : "ghost"}
                            size="icon-sm"
                            aria-label={`${geometria.label} como ${natureza.label}`}
                            aria-pressed={ativa}
                            className={cn(!ativa && "text-muted-foreground")}
                            onClick={() => pegar(geometria, natureza.chave)}
                          >
                            <AmostraDaForma
                              geometria={geometria.chave}
                              natureza={natureza.chave}
                            />
                          </Button>
                        }
                      />
                      <TooltipContent side="top">
                        <p className="font-medium">{natureza.label}</p>
                        <p className="text-muted-foreground max-w-48">
                          {natureza.hint}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
