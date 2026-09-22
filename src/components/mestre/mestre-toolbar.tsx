"use client";

import {
  Circle,
  Eraser,
  Hand,
  Map,
  MapPin,
  Minus,
  MousePointer2,
  Square,
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

import { FormaControl } from "@/components/mestre/forma-control";
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
import { ehQuadro, type Scene, type TipoDeForma } from "@/types/scene";

type Ferramenta = {
  tool: Tool;
  label: string;
  hint: string;
  icon: typeof MousePointer2;
  /**
   * Distingue os botões que compartilham a MESMA ferramenta: quadrado, círculo
   * e linha são três alvos na barra e uma `forma` só no palco. Três ferramentas
   * de verdade obrigariam cada comparação do palco a listar as três, e a
   * primeira esquecida deixaria uma delas agindo como seleção.
   */
  tipoDeForma?: TipoDeForma;
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
    label: "Deslocar o mapa",
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
    hint: "Clique no mapa para colar um papel com texto à vista. Digitar @, / ou > sugere personagem, arquivo da campanha ou mapa; ** dos dois lados deixa em negrito; # e - no começo da linha dão título e lista. Só você vê — nem a TV nem os celulares recebem.",
    icon: StickyNote,
  },
  {
    tool: "fog",
    label: "Área escondida",
    hint: "Arraste sobre o mapa para cobrir uma região. A mesa vê preto sólido.",
    icon: SquareDashedBottom,
  },
];

/**
 * As de DESENHAR: letra solta e as três formas. Valem nos dois tipos de cena.
 *
 * Eram do quadro e só dele, e a razão dada era que num mapa o título solto
 * seria anotação que a mesa não vê -- o mestre já tinha o postit para isso.
 * O que mudou foi justamente isso: a letra e a forma agora PODEM chegar à
 * mesa, uma a uma, pelo olho do gizmo. Com isso elas passam a ser as únicas
 * marcas que o mapa sabe mostrar para quem assiste -- um rótulo em cima da
 * cidade, um círculo em volta da emboscada --, e prendê-las ao quadro seria
 * guardar a única coisa que resolve isso na cena errada. Ver `naMesa`.
 */
const FERRAMENTAS_DE_DESENHO: Ferramenta[] = [
  {
    tool: "texto",
    label: "Texto",
    hint: "Clique para escrever direto na cena, sem papel. Duplo clique edita, arrasto move; selecionado, os cantos aumentam e a alça de cima gira, como na imagem. Num mapa ele nasce só para você: o olho do gizmo o manda para a mesa.",
    icon: Type,
  },
  {
    tool: "forma",
    tipoDeForma: "retangulo",
    label: "Quadrado",
    hint: "Arraste para desenhar um retângulo. Segurar Shift iguala os lados e sai um quadrado. Vazado por padrão; cor, espessura e fundo ficam no botão ao lado. Num mapa ele nasce só para você: o olho do gizmo o manda para a mesa.",
    icon: Square,
  },
  {
    tool: "forma",
    tipoDeForma: "elipse",
    label: "Círculo",
    hint: "Arraste para desenhar uma elipse. Segurar Shift iguala os lados e sai um círculo.",
    icon: Circle,
  },
  {
    tool: "forma",
    tipoDeForma: "linha",
    label: "Linha",
    hint: "Arraste de onde até onde. A linha corre na diagonal da caixa, e redimensionar a caixa estica a linha.",
    icon: Minus,
  },
];

/**
 * A do QUADRO e só dele: a seta entre duas coisas.
 *
 * Fica de fora do mapa porque o que ela amarra -- postit a postit, cartão a
 * cartão -- é justamente o que a mesa nunca recebe de um mapa: uma seta entre
 * dois papéis invisíveis seria uma seta para lugar nenhum.
 */
const FERRAMENTAS_QUADRO: Ferramenta[] = [
  {
    tool: "ligacao",
    label: "Seta",
    hint: "Passe por cima de qualquer coisa do quadro e os quatro pontos de encaixe dela acendem. Clique num ponto e a seta fica pendurada no cursor até o clique da outra ponta; arrastar de um ponto ao outro também vale. No vazio, a ponta fica livre. Sobre outra seta a ponta vira bifurcação. Selecionada, as alças movem as pontas; duplo clique dá rótulo. Feita a seta, a ferramenta se larga sozinha.",
    icon: Spline,
  },
];

/**
 * O que a régua leva em cada tipo de cena.
 *
 * No QUADRO: o postit -- que ali é conteúdo, e não anotação -- mais a letra, as
 * formas e a seta. A névoa e o alfinete ficam de fora: quadro não tem chão para
 * esconder, e o ponto é nota fechada atrás de um alfinete, que não faz sentido
 * onde a nota já é o cartão.
 *
 * No MAPA: só as de desenhar. O ponto, o postit e a névoa continuam na bolsa
 * do rodapé, que é o desenho certo para o que se marca no chão uma vez por
 * cena -- trazê-los para a régua seria mudar o mapa inteiro de lugar para
 * acomodar duas ferramentas novas.
 */
const DA_REGUA: Record<"quadro" | "mapa", Ferramenta[]> = {
  quadro: [
    ...FERRAMENTAS_MAPA.filter((f) => f.tool !== "fog" && f.tool !== "pin"),
    ...FERRAMENTAS_DE_DESENHO,
    ...FERRAMENTAS_QUADRO,
  ],
  mapa: FERRAMENTAS_DE_DESENHO,
};

/** Esta ferramenta é a que está na mão? O tipo de forma entra na conta. */
function ehAtiva(
  ferramenta: Ferramenta,
  tool: Tool,
  tipoDeForma: TipoDeForma,
): boolean {
  return (
    ferramenta.tool === tool &&
    (!ferramenta.tipoDeForma || ferramenta.tipoDeForma === tipoDeForma)
  );
}

/**
 * As ferramentas que os plugins trouxeram.
 *
 * O ícone é sempre o mesmo desenho, e não o `icone` do manifesto: carregar
 * imagem de extensão aqui pagaria um pedido por ferramenta numa barra que o
 * mestre olha o tempo todo, e uma que falhasse deixaria um buraco no lugar de
 * um botão. O nome aparece no `tooltip`.
 */
function useFerramentasDeExtensao(): Ferramenta[] {
  const extensoes = useExtensoesStore((state) => state.extensoes);

  return useMemo(
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
}

/**
 * Um botão de ferramenta, com o nome e o que ela faz no `tooltip`.
 *
 * Lê o store por conta própria em vez de receber "está ativa?" de fora: ele
 * aparece na bolsa do rodapé E na régua do quadro, e a versão que recebia a
 * resposta pronta obrigava cada dono a repetir a mesma comparação -- que é
 * justamente onde o tipo de forma seria esquecido.
 */
function BotaoDeFerramenta({
  ferramenta,
  desabilitada = false,
  aoEscolher,
}: {
  ferramenta: Ferramenta;
  desabilitada?: boolean;
  /** Depois de escolher. É por aqui que a bolsa se fecha. */
  aoEscolher?: () => void;
}) {
  const tool = useToolStore((state) => state.tool);
  const tipoDeForma = useToolStore((state) => state.tipoDeForma);
  const setTool = useToolStore((state) => state.setTool);
  const setForma = useToolStore((state) => state.setForma);

  const { tool: value, label, hint, icon: Icon } = ferramenta;
  const ativa = ehAtiva(ferramenta, tool, tipoDeForma);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={ativa ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label={label}
            aria-pressed={ativa}
            disabled={desabilitada}
            onClick={() => {
              if (ferramenta.tipoDeForma)
                setForma({ tipoDeForma: ferramenta.tipoDeForma });
              setTool(value);
              aoEscolher?.();
            }}
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

/**
 * A régua de DESENHO, encostada na borda esquerda do palco.
 *
 * À vista, e não dentro de uma bolsa: desenhar é trocar de ferramenta a cada
 * gesto -- escreve o rótulo, cerca a região, risca o eixo --, e a bolsa cobrava
 * dois cliques por troca e ainda exigia saber que a régua morava atrás de um
 * ícone.
 *
 * À esquerda e no meio da altura, e não no rodapé junto das outras: é a borda
 * que o editor de desenho usa para isto desde sempre, fica longe do zoom e das
 * câmeras, e deixa o rodapé para o que é do PALCO -- selecionar, deslocar,
 * riscar --, que continua valendo em mapa e em quadro.
 *
 * Nos DOIS tipos de cena, e o que muda é só o que ela carrega -- ver `DA_REGUA`.
 * Ela nasceu só no quadro porque só o quadro tinha o que desenhar; com a letra
 * e a forma valendo também no mapa, deixá-la no quadro obrigaria as mesmas
 * ferramentas a morar em dois lugares diferentes conforme a cena, que é
 * exatamente o que faz alguém não achar uma delas.
 *
 * O controle da ferramenta ativa vem no fim da régua, e não no rodapé: escolher
 * o quadrado e ter de atravessar o palco para trocar a cor dele seria separar
 * duas metades do mesmo gesto.
 */
export function ReguaDeDesenho({ scene }: { scene: Scene }) {
  const dasExtensoes = useFerramentasDeExtensao();
  const quadro = ehQuadro(scene);

  return (
    <div className="bg-background/85 pointer-events-auto flex flex-col items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
      {DA_REGUA[quadro ? "quadro" : "mapa"].map((ferramenta) => (
        <BotaoDeFerramenta
          key={ferramenta.tipoDeForma ?? ferramenta.tool}
          ferramenta={ferramenta}
        />
      ))}

      {/* As de plugin acompanham a régua só no quadro. No mapa elas já estão na
          bolsa, e o mesmo botão em dois cantos do palco seria duas respostas
          para a pergunta de onde ele mora. */}
      {quadro && dasExtensoes.length > 0 ? (
        <>
          <span className="bg-border my-1 h-px w-5" />
          {dasExtensoes.map((ferramenta) => (
            <BotaoDeFerramenta key={ferramenta.tool} ferramenta={ferramenta} />
          ))}
        </>
      ) : null}

      {/* Os controles se escondem sozinhos quando não é a vez deles, e por isso
          o separador também precisa saber: sem ele, a régua ficaria com um
          risco solto no pé metade do tempo. */}
      <SeparadorDoControle quadro={quadro} />
    </div>
  );
}

/**
 * O risco e o controle da ferramenta na mão, ou nada.
 *
 * O da forma acompanha a régua nos dois tipos de cena, porque é na régua que a
 * forma é escolhida. O do postit só no quadro: no mapa o papel é escolhido na
 * bolsa do rodapé, e a cor dele fica ao lado de onde a escolha aconteceu.
 */
function SeparadorDoControle({ quadro }: { quadro: boolean }) {
  const tool = useToolStore((state) => state.tool);
  const postit = quadro && tool === "postit";

  if (!postit && tool !== "forma") return null;

  return (
    <>
      <span className="bg-border my-1 h-px w-5" />
      {postit ? <PostitControl lado="right" /> : null}
      <FormaControl lado="right" />
    </>
  );
}

/**
 * As ferramentas do RODAPÉ, em bolsas no canto do palco.
 *
 * Como pasta de aplicativos no celular: um ou dois botões à vista, e cada um
 * abre a fileira do grupo por cima. Eram nove alvos numa fileira só, e a
 * fileira não dizia por que o lápis ficava ao lado do alfinete — nem precisava
 * estar toda à vista o tempo todo, porque a maior parte da sessão no mapa é
 * com uma ferramenta na mão. Palco é o que se faz com a mão a cada minuto;
 * Mapa é o que se marca no chão uma vez e fica. A grade e a régua vieram do
 * zoom para a bolsa do mapa: são sobre o mapa, e moravam longe das outras que
 * também são.
 *
 * NO QUADRO a segunda bolsa não existe: as ferramentas dele estão à vista na
 * régua da borda esquerda, porque montar uma rede de pistas é trocar de
 * ferramenta a cada gesto e a bolsa cobrava dois cliques por troca. Ver
 * `ReguaDeDesenho`. Sobra aqui a bolsa do PALCO, que vale nos dois.
 *
 * NO MAPA as duas convivem, e a divisão é a mesma de sempre: a régua leva o que
 * se DESENHA -- letra e forma --, a bolsa leva o que se marca no chão -- ponto,
 * papel, névoa, grade, régua de medir.
 *
 * O botão da bolsa mostra a ferramenta ATIVA dela, e não um ícone fixo: com a
 * bolsa fechada, o que está na mão é a única informação que importa. Escolher
 * uma ferramenta fecha a bolsa — escolheu, vai usar. Ligar a grade não fecha,
 * porque o ajuste dela fica logo ao lado.
 *
 * A cor do lápis fica FORA das bolsas, ao lado dos botões: dentro, sumiria
 * junto com a bolsa no instante em que o mestre escolhesse a ferramenta que a
 * pede. A regra é sempre a mesma -- o controle fica ao lado de onde a
 * ferramenta foi escolhida --, e é ela que manda a cor da forma para a régua
 * nos dois tipos de cena e deixa a do postit aqui só no mapa.
 */
export function MestreToolbar({ scene }: { scene: Scene }) {
  const tool = useToolStore((state) => state.tool);
  const setTool = useToolStore((state) => state.setTool);
  const tipoDeForma = useToolStore((state) => state.tipoDeForma);
  const dasExtensoes = useFerramentasDeExtensao();

  const [aberta, setAberta] = useState<"palco" | "mapa" | null>(null);

  const regua: Ferramenta = {
    tool: "regua",
    label: "Régua",
    hint: scene.grid
      ? `Arraste para colocar um medidor: régua, círculo, cone ou retângulo. Cada quadrado da grade vale ${METROS_POR_QUADRADO} m.`
      : "Ligue a grade primeiro: é o quadrado dela que diz quanto vale um metro.",
    icon: Ruler,
  };

  const quadro = ehQuadro(scene);
  const doMapa = [...FERRAMENTAS_MAPA, regua, ...dasExtensoes];

  // Trocar de um mapa para um quadro com a névoa na mão deixaria a ferramenta
  // ativa sem botão na barra -- e o clique seguinte cobriria o quadro de preto.
  useEffect(() => {
    if (quadro && (tool === "fog" || tool === "regua" || tool === "pin"))
      setTool("select");
    // E o inverso: só a SETA agora. A letra e a forma atravessam a troca de
    // cena porque valem nos dois lados -- ver `FERRAMENTAS_DE_DESENHO` --, e
    // largá-las aqui faria o mestre perder a ferramenta ao ir buscar um mapa.
    if (!quadro && tool === "ligacao") setTool("select");
  }, [quadro, tool, setTool]);

  // A ferramenta ativa de cada bolsa, para o botão dela mostrar. `select` é
  // sempre do palco; então a bolsa do mapa só tem ativa quando é dela.
  const daBolsa = (lista: Ferramenta[]) =>
    lista.find((f) => ehAtiva(f, tool, tipoDeForma));

  const fechar = () => setAberta(null);

  return (
    <div className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
      <Bolsa
        nome="Ferramentas do palco"
        dica="Selecionar, deslocar, lápis e borracha."
        aberta={aberta === "palco"}
        onAberta={(v) => setAberta(v ? "palco" : null)}
        ativa={daBolsa(FERRAMENTAS_PALCO)}
        icone={MousePointer2}
      >
        {FERRAMENTAS_PALCO.map((ferramenta) => (
          <BotaoDeFerramenta
            key={ferramenta.tool}
            ferramenta={ferramenta}
            aoEscolher={fechar}
          />
        ))}
      </Bolsa>

      {quadro ? null : (
        <Bolsa
          nome="Ferramentas do mapa"
          dica="Ponto, postit, área escondida, grade e régua."
          aberta={aberta === "mapa"}
          onAberta={(v) => setAberta(v ? "mapa" : null)}
          ativa={daBolsa(doMapa)}
          icone={Map}
        >
          {FERRAMENTAS_MAPA.map((ferramenta) => (
            <BotaoDeFerramenta
              key={ferramenta.tool}
              ferramenta={ferramenta}
              aoEscolher={fechar}
            />
          ))}

          <span className="bg-border mx-1 h-5 w-px" />

          <GridControl scene={scene} />
          {/* A régua só mede com a grade ligada: é o quadrado que diz quanto
              vale um metro. */}
          <BotaoDeFerramenta
            ferramenta={regua}
            desabilitada={!scene.grid}
            aoEscolher={fechar}
          />

          {dasExtensoes.length > 0 ? (
            <>
              <span className="bg-border mx-1 h-5 w-px" />
              {dasExtensoes.map((ferramenta) => (
                <BotaoDeFerramenta
                  key={ferramenta.tool}
                  ferramenta={ferramenta}
                  aoEscolher={fechar}
                />
              ))}
            </>
          ) : null}
        </Bolsa>
      )}

      {/* Só com a ferramenta correspondente na mão; todos se escondem sozinhos.
          O da FORMA nunca aparece aqui: a forma é escolhida na régua da
          esquerda nos dois tipos de cena, e a cor dela acompanha a régua -- um
          controle em cada canto seria o mesmo botão em dois lugares. O do
          POSTIT aparece só no mapa, que é onde o papel é escolhido na bolsa
          logo ao lado. */}
      <PencilControl />
      <ReguaControl />
      {quadro ? null : <PostitControl />}

      {/* Largar a ferramenta, para quem escolheu e desistiu. O Esc faz o mesmo,
          mas um botão à vista é o que diz que dá para desistir. Só aparece com
          algo na mão -- sem ferramenta não há o que largar, e um X permanente
          na barra leria como "fechar a barra". */}
      {tool !== "select" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Largar a ferramenta"
                onClick={() => {
                  setTool("select");
                  fechar();
                }}
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
