"use client";

import {
  Eraser,
  Hand,
  Map,
  MapPin,
  MousePointer2,
  Presentation,
  X,
  Pencil,
  Puzzle,
  Ruler,
  Spline,
  SquareDashedBottom,
  StickyNote,
  Type,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { GridControl } from "@/components/mestre/grid-control";
import { PencilControl } from "@/components/mestre/pencil-control";
import { ReguaControl } from "@/components/mestre/regua-control";
import { PostitControl } from "@/components/mestre/postit-control";
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
import { METROS_POR_QUADRADO } from "@/lib/geometry/grid";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { useToolStore, type Tool } from "@/lib/store/use-tool-store";
import { ehQuadro, type Scene } from "@/types/scene";

type Ferramenta = {
  tool: Tool;
  label: string;
  hint: string;
  icon: typeof MousePointer2;
};

/**
 * As do PALCO: mexem no que está em cena — escolher, arrastar, riscar, apagar.
 * São as da mão, as que o mestre troca a cada minuto.
 */
const FERRAMENTAS_PALCO: Ferramenta[] = [
  {
    tool: "select",
    label: "Selecionar",
    hint: "Clique para selecionar, arraste no vazio para marcar vários.",
    icon: MousePointer2,
  },
  {
    tool: "hand",
    label: "Deslocar a cena",
    hint: "Arraste para percorrer o mapa. Segurar espaço faz o mesmo sem trocar de ferramenta.",
    icon: Hand,
  },
  {
    tool: "lapis",
    label: "Lápis",
    hint: "Arraste para riscar o mapa à mão livre. A mesa vê. Cor e espessura ficam no botão ao lado.",
    icon: Pencil,
  },
  {
    tool: "borracha",
    label: "Borracha",
    hint: "Passe sobre um risco para apagá-lo inteiro. Ctrl+Z devolve.",
    icon: Eraser,
  },
];

/**
 * As do MAPA: marcam o chão — pontos, papéis, áreas escondidas. Junto delas
 * ficam a grade e a régua, que também são sobre o mapa e não sobre o que anda
 * nele.
 */
const FERRAMENTAS_MAPA: Ferramenta[] = [
  {
    tool: "pin",
    label: "Ponto de anotação",
    hint: "Clique no mapa para cravar um ponto com nota e anexos. Só você vê — nem a TV nem os celulares recebem.",
    icon: MapPin,
  },
  {
    tool: "postit",
    label: "Postit",
    hint: "Clique no mapa para colar um papel com texto à vista. Digitar @, / ou > sugere personagem, arquivo da campanha ou cena; ** dos dois lados deixa em negrito; # e - no começo da linha dão título e lista. Só você vê — nem a TV nem os celulares recebem.",
    icon: StickyNote,
  },
  {
    tool: "fog",
    label: "Área escondida",
    hint: "Arraste sobre a cena para cobrir uma região. A mesa vê preto sólido.",
    icon: SquareDashedBottom,
  },
];

/**
 * As do QUADRO, além do ponto e do postit: letra na folha e seta entre coisas.
 * Só aparecem no quadro -- num mapa, título solto e seta entre tokens seriam
 * anotação que a mesa não vê e que o mestre já faz com o postit.
 */
const FERRAMENTAS_QUADRO: Ferramenta[] = [
  {
    tool: "texto",
    label: "Texto",
    hint: "Clique no quadro para escrever direto na folha, sem papel. Duplo clique edita, arrasto move; selecionado, os cantos aumentam e a alça de cima gira, como na imagem.",
    icon: Type,
  },
  {
    tool: "ligacao",
    label: "Seta",
    hint: "Clique de onde e depois para onde: postit, texto, imagem ou ponto. Duplo clique na seta dá um rótulo. Esc larga.",
    icon: Spline,
  },
];

/**
 * As ferramentas, em duas BOLSAS no canto do palco.
 *
 * Como pasta de aplicativos no celular: dois botões à vista, e cada um abre a
 * fileira do grupo por cima. Eram nove alvos numa fileira só, e a fileira não
 * dizia por que o lápis ficava ao lado do alfinete — nem precisava estar toda
 * à vista o tempo todo, porque a maior parte da sessão é com uma ferramenta
 * na mão. Palco é o que se faz com a mão a cada minuto; Mapa é o que se marca
 * no chão uma vez e fica. A grade e a régua vieram do zoom para a bolsa do
 * mapa: são sobre o mapa, e moravam longe das outras que também são.
 *
 * O botão da bolsa mostra a ferramenta ATIVA dela, e não um ícone fixo: com a
 * bolsa fechada, o que está na mão é a única informação que importa. Escolher
 * uma ferramenta fecha a bolsa — escolheu, vai usar. Ligar a grade não fecha,
 * porque o ajuste dela fica logo ao lado.
 *
 * A cor do lápis e a do postit ficam FORA das bolsas, ao lado dos dois botões:
 * dentro, sumiriam junto com a bolsa no instante em que o mestre escolhesse a
 * ferramenta que as pede.
 */
export function MestreToolbar({ scene }: { scene: Scene }) {
  const tool = useToolStore((state) => state.tool);
  const setTool = useToolStore((state) => state.setTool);
  const extensoes = useExtensoesStore((state) => state.extensoes);

  const [aberta, setAberta] = useState<"palco" | "mapa" | null>(null);

  /**
   * As dos plugins vão no FIM da bolsa do mapa, e é o que mantém a memória
   * motor de quem já usa a barra: o dedo sabe onde fica o lápis, e um plugin
   * que se enfiasse no meio moveria as de fábrica de lugar.
   *
   * O ícone é sempre o mesmo desenho, e não o `icone` do manifesto: carregar
   * imagem de extensão aqui pagaria um pedido por ferramenta numa barra que o
   * mestre olha o tempo todo, e uma que falhasse deixaria um buraco no lugar de
   * um botão. O nome aparece no `tooltip`.
   */
  const dasExtensoes = useMemo<Ferramenta[]>(
    () =>
      extensoes
        .filter((extensao) => extensao.habilitada)
        .flatMap((extensao) =>
          (extensao.contribui?.ferramentas ?? []).map((ferramenta) => ({
            tool: `ext:${extensao.id}/${ferramenta.id}` as Tool,
            label: ferramenta.titulo,
            hint: extensao.nome,
            icon: Puzzle,
          })),
        ),
    [extensoes],
  );

  const regua: Ferramenta = {
    tool: "regua",
    label: "Régua",
    hint: scene.grid
      ? `Arraste para colocar um medidor: régua, círculo, cone ou retângulo. Cada quadrado da grade vale ${METROS_POR_QUADRADO} m.`
      : "Ligue a grade primeiro: é o quadrado dela que diz quanto vale um metro.",
    icon: Ruler,
  };

  /**
   * Quadro não tem chão: sem névoa, grade nem régua. O que sobra da bolsa do
   * mapa -- ponto e postit -- é o que anota, e é isso que um quadro é.
   */
  const quadro = ehQuadro(scene);
  const doChao = quadro
    ? [
        ...FERRAMENTAS_MAPA.filter((f) => f.tool !== "fog"),
        ...FERRAMENTAS_QUADRO,
      ]
    : FERRAMENTAS_MAPA;

  const doMapa = quadro
    ? [...doChao, ...dasExtensoes]
    : [...doChao, regua, ...dasExtensoes];

  // Trocar de um mapa para um quadro com a névoa na mão deixaria a ferramenta
  // ativa sem botão na barra -- e o clique seguinte cobriria o quadro de preto.
  useEffect(() => {
    if (quadro && (tool === "fog" || tool === "regua")) setTool("select");
    // E o inverso: texto e seta são do quadro, e um mapa não tem onde mostrá-las.
    if (!quadro && (tool === "texto" || tool === "ligacao")) setTool("select");
  }, [quadro, tool, setTool]);

  // A ferramenta ativa de cada bolsa, para o botão dela mostrar. `select` é
  // sempre do palco; então a bolsa do mapa só tem ativa quando é dela.
  const ativaDoMapa = doMapa.find((f) => f.tool === tool);
  const ativaDoPalco = FERRAMENTAS_PALCO.find((f) => f.tool === tool);

  function escolher(value: Tool) {
    setTool(value);
    setAberta(null);
  }

  function botao({ tool: value, label, hint, icon: Icon }: Ferramenta) {
    // A régua só mede com a grade ligada: é o quadrado que diz quanto vale um
    // metro.
    const desabilitada = value === "regua" && !scene.grid;

    return (
      <Tooltip key={value}>
        <TooltipTrigger
          render={
            <Button
              variant={tool === value ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={label}
              aria-pressed={tool === value}
              disabled={desabilitada}
              onClick={() => escolher(value)}
            >
              <Icon />
            </Button>
          }
        />
        <TooltipContent>
          <p className="font-medium">{label}</p>
          <p className="text-muted-foreground max-w-48">{hint}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
      <Bolsa
        nome="Ferramentas do palco"
        dica="Selecionar, deslocar, lápis e borracha."
        aberta={aberta === "palco"}
        onAberta={(v) => setAberta(v ? "palco" : null)}
        ativa={ativaDoPalco}
        icone={MousePointer2}
      >
        {FERRAMENTAS_PALCO.map(botao)}
      </Bolsa>

      <Bolsa
        nome={quadro ? "Ferramentas do quadro" : "Ferramentas do mapa"}
        dica={
          quadro
            ? "Ponto, postit, texto e seta."
            : "Ponto, postit, área escondida, grade e régua."
        }
        aberta={aberta === "mapa"}
        onAberta={(v) => setAberta(v ? "mapa" : null)}
        ativa={ativaDoMapa}
        icone={quadro ? Presentation : Map}
      >
        {doChao.map(botao)}

        {quadro ? null : (
          <>
            <span className="bg-border mx-1 h-5 w-px" />

            <GridControl scene={scene} />
            {botao(regua)}
          </>
        )}

        {dasExtensoes.length > 0 ? (
          <>
            <span className="bg-border mx-1 h-5 w-px" />
            {dasExtensoes.map(botao)}
          </>
        ) : null}
      </Bolsa>

      {/* Só com a ferramenta correspondente na mão; os dois se escondem
          sozinhos. */}
      <PencilControl />
      <PostitControl />
      <ReguaControl />

      {/* Largar a ferramenta, para quem escolheu e desistiu. O Esc faz o mesmo,
          mas um botão à vista é o que diz que dá para desistir: a seta está
          dentro da bolsa, e chegar nela pedia dois cliques e saber onde ela
          mora. Só aparece com algo na mão -- sem ferramenta não há o que
          largar, e um X permanente na barra leria como "fechar a barra". */}
      {tool !== "select" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Largar a ferramenta"
                onClick={() => escolher("select")}
              >
                <X />
              </Button>
            }
          />
          <TooltipContent>Largar a ferramenta (Esc)</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

/**
 * Um botão que abre a fileira do grupo por cima.
 *
 * Com uma ferramenta do grupo na mão, o botão vira ela — mesmo desenho e mesma
 * cor de "apertado" que ela teria na fileira. Sem nenhuma, mostra o ícone do
 * grupo, apagado.
 */
function Bolsa({
  nome,
  dica,
  aberta,
  onAberta,
  ativa,
  icone: Icone,
  children,
}: {
  nome: string;
  dica: string;
  aberta: boolean;
  onAberta: (aberta: boolean) => void;
  ativa: Ferramenta | undefined;
  icone: typeof MousePointer2;
  children: React.ReactNode;
}) {
  const Ativo = ativa?.icon ?? Icone;

  return (
    <Popover open={aberta} onOpenChange={onAberta}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant={ativa ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label={nome}
                  aria-expanded={aberta}
                  className={ativa ? undefined : "text-muted-foreground"}
                >
                  <Ativo />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <p className="font-medium">{ativa ? ativa.label : nome}</p>
          <p className="text-muted-foreground max-w-48">
            {ativa ? `${nome}. Clique para trocar.` : dica}
          </p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="start"
        side="top"
        className="flex w-auto items-center gap-0.5 p-1"
        role="toolbar"
        aria-label={nome}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
