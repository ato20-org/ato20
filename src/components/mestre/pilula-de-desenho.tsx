"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { t } from "@/lib/i18n/ferramentas";
import {
  useToolStore,
  type NaturezaDoElemento,
} from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import { temAreaDeEfeito, temNevoa, temSol, type Scene } from "@/types/scene";

/**
 * O DESENHO de uma coisa desenhada: o primeiro passo da pílula.
 *
 * Três, e os mesmos três para as três naturezas. Por dentro cada natureza
 * guarda o nome que já usava -- `retangulo`, `elipse`, `poligono` --, e é só
 * isso que estas chaves traduzem.
 */
export const GEOMETRIAS = [
  {
    chave: "quadrado",
    formato: "retangulo",
    label: t.pilulaDeDesenho.quadrado,
    hint: t.pilulaDeDesenho.quadradoDica,
  },
  {
    chave: "circulo",
    formato: "elipse",
    label: t.pilulaDeDesenho.circulo,
    hint: t.pilulaDeDesenho.circuloDica,
  },
  {
    chave: "livre",
    formato: "poligono",
    label: t.pilulaDeDesenho.livre,
    hint: t.pilulaDeDesenho.livreDica,
  },
] as const;

export type Geometria = (typeof GEOMETRIAS)[number];

/**
 * O que a coisa É: o segundo passo.
 *
 * O mesmo desenho, três significados. É a pergunta que a barra fazia sete
 * vezes -- um botão por par -- e que aqui é feita uma vez só.
 */
const NATUREZAS = [
  {
    chave: "parede",
    label: t.pilulaDeDesenho.parede,
    hint: t.pilulaDeDesenho.paredeDica,
  },
  {
    chave: "area",
    label: t.pilulaDeDesenho.area,
    hint: t.pilulaDeDesenho.areaDica,
  },
  {
    chave: "elemento",
    label: t.pilulaDeDesenho.elemento,
    hint: t.pilulaDeDesenho.elementoDica,
  },
] as const;

/**
 * O quarto significado: um pedaço do chão para um EFEITO -- o fogo, a névoa.
 * Um botão só, e não um por efeito: a área nasce sem efeito, e o efeito se
 * escolhe no gizmo dela, entre os efeitos em área da campanha. Ver
 * `AreaDeEfeito`.
 */
const NATUREZAS_DE_EFEITO = [
  {
    chave: "efeito",
    label: t.pilulaDeDesenho.efeito,
    hint: t.pilulaDeDesenho.efeitoDica,
  },
] as const;

/** O amarelo da parede, o mesmo de `LuzLayer`. */
const COR_DA_PAREDE = "#facc15";

/** O laranja do efeito no chão. */
const COR_DO_EFEITO = "#f97316";

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
 * - `efeito` laranja, tracejado, com uma estrela dentro. É o chão de um efeito.
 *
 * `null` é a amostra neutra, para o botão da régua antes de a natureza ser
 * escolhida.
 */
export function AmostraDaForma({
  geometria,
  natureza,
}: {
  geometria: Geometria["chave"];
  natureza: Natureza | null;
}) {
  const efeito = natureza === "efeito";
  const pintura = efeito
    ? {
        fill: COR_DO_EFEITO,
        fillOpacity: 0.2,
        stroke: COR_DO_EFEITO,
        strokeWidth: 1.25,
        strokeDasharray: "2.5 2",
      }
    : natureza === "parede"
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
      {efeito ? (
        <path d="M9 5.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill={COR_DO_EFEITO} />
      ) : null}
    </svg>
  );
}

export type Natureza = NaturezaDoElemento;

/**
 * As naturezas que esta cena aceita, na ordem do painel.
 *
 * Cada natureza pergunta pela capacidade que ela usa, e não pelo tipo da
 * cena. No QUADRO não há chão: nem parede para a luz parar, nem região do
 * mapa para esconder da mesa. No FUNDO há chão, mas a luz já vem pintada na
 * imagem e a imagem existe para ser vista de uma vez -- as mesmas duas caem,
 * por duas razões diferentes. Sobra o elemento, que vale nos três.
 */
export function naturezasDaCena(
  scene: Pick<Scene, "tipo">,
): ReadonlyArray<{ chave: Natureza; label: string; hint: string }> {
  return [
    ...NATUREZAS.filter(
      (natureza) =>
        (natureza.chave !== "parede" || temSol(scene)) &&
        (natureza.chave !== "area" || temNevoa(scene)),
    ),
    // O efeito no chão é do mapa, como a parede e a névoa.
    ...(temAreaDeEfeito(scene) ? NATUREZAS_DE_EFEITO : []),
  ];
}

/** A ferramenta de cada natureza. */
const FERRAMENTA_DA_NATUREZA = {
  parede: "parede",
  area: "fog",
  elemento: "forma",
  efeito: "efeito",
} as const satisfies Record<Natureza, string>;

/** A natureza da ferramenta na mão. `null` se não é de elemento. */
export function naturezaDaFerramenta(tool: string): Natureza | null {
  const achada = (
    Object.entries(FERRAMENTA_DA_NATUREZA) as Array<[Natureza, string]>
  ).find(([, ferramenta]) => ferramenta === tool);
  return achada ? achada[0] : null;
}

/** A geometria de um formato guardado, ou `null` se não é uma das três. */
function geometriaDe(formato: string): Geometria["chave"] | null {
  return GEOMETRIAS.find((geometria) => geometria.formato === formato)?.chave ?? null;
}

/**
 * A geometria que a natureza guarda: cada uma lembra o seu formato, pela razão
 * de `formatoDaParede` -- quem traça paredes em laço e esconde áreas em
 * retângulo não quer que uma troque a outra.
 */
export function geometriaDaNatureza(
  natureza: Natureza,
  estado: Pick<
    ReturnType<typeof useToolStore.getState>,
    "formatoDaParede" | "formatoDeArea" | "tipoDeForma" | "formatoDoEfeito"
  >,
): Geometria["chave"] | null {
  if (natureza === "parede") return geometriaDe(estado.formatoDaParede);
  if (natureza === "area") return geometriaDe(estado.formatoDeArea);
  if (natureza === "efeito") return geometriaDe(estado.formatoDoEfeito);
  return geometriaDe(estado.tipoDeForma);
}

/**
 * Pega a ferramenta de um elemento: a geometria e a natureza viram um par, e
 * é o único lugar em que o vocabulário do painel encosta nos quatro campos que
 * cada natureza guarda.
 */
export function pegarElemento(
  geometria: Geometria["chave"],
  natureza: Natureza,
): void {
  const ferramentas = useToolStore.getState();
  const formato = GEOMETRIAS.find((g) => g.chave === geometria)!.formato;

  if (natureza === "parede") ferramentas.setFormatoDaParede(formato);
  else if (natureza === "efeito") ferramentas.setFormatoDoEfeito(formato);
  // A área não tem `linha`, e nenhuma das três geometrias é uma: o vocabulário
  // daqui já é o subconjunto que serve às quatro.
  else if (natureza === "area") ferramentas.setFormatoDeArea(formato);
  else ferramentas.setForma({ tipoDeForma: formato });

  ferramentas.setNaturezaDoElemento(natureza);
  ferramentas.setTool(FERRAMENTA_DA_NATUREZA[natureza]);
}

/**
 * O botão ELEMENTOS da barra: o que se desenha na cena, num ícone só.
 *
 * Eram três botões de geometria, e cada um abria para a direita uma fileira
 * com as naturezas -- parede, área escondida, elemento, efeito. A geometria, a
 * natureza e o que cada natureza ajusta (a cor da forma, o efeito, a altura e
 * o teto da parede) moram agora no painel do canto, como os do lápis: ver
 * `PainelDeElementos`. A barra ficou com uma pergunta só, "vou desenhar?".
 *
 * O botão desenha O QUE VAI SER DESENHADO -- a geometria e o material do par
 * na mão, ou do último usado --, e a barra sozinha continua respondendo "o que
 * estou prestes a desenhar". Clicar pega o último par de volta; com um
 * elemento na mão, clicar larga.
 *
 * O que NÃO entrou: alfinete, postit, régua, lápis e borracha. Nenhum deles
 * responde às duas perguntas daqui -- são cravar, colar, acender, medir,
 * riscar e apagar, e cada um já é um alvo direto onde está.
 */
export function BotaoDeElementos({
  scene,
  dica = "right",
}: {
  scene: Pick<Scene, "tipo">;
  /** De que lado a dica abre: para baixo na barra do topo. */
  dica?: "right" | "bottom";
}) {
  const tool = useToolStore((state) => state.tool);
  const setTool = useToolStore((state) => state.setTool);
  const lembrada = useToolStore((state) => state.naturezaDoElemento);
  const formatoDaParede = useToolStore((state) => state.formatoDaParede);
  const formatoDeArea = useToolStore((state) => state.formatoDeArea);
  const tipoDeForma = useToolStore((state) => state.tipoDeForma);
  const formatoDoEfeito = useToolStore((state) => state.formatoDoEfeito);

  const naturezas = naturezasDaCena(scene);
  const naMao = naturezaDaFerramenta(tool);
  // A lembrada, se esta cena a aceita: a parede escolhida no mapa não vale
  // no quadro, e lá o ícone volta ao elemento.
  const natureza: Natureza =
    naMao ??
    (naturezas.some((opcao) => opcao.chave === lembrada)
      ? lembrada
      : (naturezas[0]?.chave ?? "elemento"));
  const geometria =
    geometriaDaNatureza(natureza, {
      formatoDaParede,
      formatoDeArea,
      tipoDeForma,
      formatoDoEfeito,
    }) ?? "quadrado";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={naMao ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label={t.elementos.botao}
            aria-pressed={Boolean(naMao)}
            className={cn(!naMao && "text-muted-foreground")}
            onClick={() =>
              naMao ? setTool("select") : pegarElemento(geometria, natureza)
            }
          >
            <AmostraDaForma geometria={geometria} natureza={natureza} />
          </Button>
        }
      />
      <TooltipContent side={dica}>
        <p className="font-medium">{t.elementos.botao}</p>
        <p className="text-muted-foreground max-w-48">{t.elementos.botaoDica}</p>
      </TooltipContent>
    </Tooltip>
  );
}
