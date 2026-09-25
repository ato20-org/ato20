"use client";

import {
  Eraser,
  Hand,
  MapPin,
  MousePointer2,
  Pencil,
  X,
  Puzzle,
  Ruler,
  Spline,
  StickyNote,
  Type,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FormaControl } from "@/components/mestre/forma-control";
import { GridControl } from "@/components/mestre/grid-control";
import { PencilControl } from "@/components/mestre/pencil-control";
import { PilulaDeDesenho } from "@/components/mestre/pilula-de-desenho";
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
import {
  ehQuadro,
  temAnotacao,
  temMedida,
  temNevoa,
  temSol,
  type FormatoDeArea,
  type Scene,
  type TipoDeForma,
} from "@/types/scene";

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
  /**
   * O mesmo truque do tipo de forma, para a área escondida. Hoje quem faz essa
   * escolha é a pílula de desenho, e não um botão por formato na barra; o campo
   * fica porque a régua e a bolsa continuam sabendo desenhar um botão de
   * ferramenta qualquer.
   */
  formatoDeArea?: FormatoDeArea;
};

/**
 * As do PALCO: mexem no que está em cena — escolher, arrastar, riscar, apagar.
 * São as da mão, as que o mestre troca a cada minuto.
 *
 * O lápis e a borracha ficam aqui e não na pílula de desenho, embora as duas
 * também marquem o mapa: a pílula faz duas perguntas -- qual o desenho, e o que
 * ele significa --, e nenhuma das duas cabe no risco à mão livre. Ele não tem
 * caixa, não tem formato e não vira parede nem névoa.
 */
const FERRAMENTAS_PALCO: Ferramenta[] = [
  {
    tool: "select",
    label: "Selecionar",
    hint: "Clique escolhe. Arraste no vazio para marcar vários.",
    icon: MousePointer2,
  },
  {
    tool: "hand",
    label: "Deslocar",
    hint: "Arraste para percorrer o mapa. Segurar Espaço faz o mesmo.",
    icon: Hand,
  },
  {
    tool: "lapis",
    label: "Lápis",
    hint: "Risca o mapa à mão livre. A mesa vê.",
    icon: Pencil,
  },
  {
    tool: "borracha",
    label: "Borracha",
    hint: "Passe sobre um risco para apagá-lo inteiro.",
    icon: Eraser,
  },
];

/**
 * As do MAPA: marcam o chão -- pontos e papéis. Junto delas ficam a grade e a
 * régua, que também são sobre o mapa e não sobre o que anda nele.
 *
 * A área escondida e a parede saíram daqui para a pílula de desenho: as duas
 * são REGIÕES, e a pergunta "qual o desenho dela" passou a ser a mesma nas
 * três naturezas. Ver `PilulaDeDesenho`.
 *
 * Moram na régua da borda direita, à vista -- ver `ReguaDoMapa`. No quadro só o
 * postit sobrevive, e sobe para a régua da esquerda: ver `DA_REGUA`.
 */
const FERRAMENTAS_MAPA: Ferramenta[] = [
  {
    tool: "pin",
    label: "Ponto",
    hint: "Crava um ponto com nota e anexos. Só você vê.",
    icon: MapPin,
  },
  {
    tool: "postit",
    label: "Postit",
    hint: "Cola um papel com texto à vista. Só você vê.",
    icon: StickyNote,
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
    hint: "Escreve direto na cena, sem papel. Nasce só para você.",
    icon: Type,
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
    hint: "Liga duas coisas do quadro. Clique num ponto de encaixe e depois no outro.",
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
 * No MAPA: só as de desenhar. O ponto e o postit são do CHÃO, e o chão tem
 * régua própria na borda oposta -- ver `ReguaDoMapa`. Uma barra para cada
 * pergunta: à esquerda o que eu desenho, à direita o que eu marco.
 */
const DA_REGUA: Record<"quadro" | "mapa", Ferramenta[]> = {
  quadro: [
    // Do que é do mapa, só o POSTIT sobe para a régua do quadro: ali ele é
    // conteúdo, e não anotação. O alfinete não tem o que fazer numa folha, e a
    // área escondida e a parede saíram para a pílula.
    ...FERRAMENTAS_MAPA.filter((f) => f.tool === "postit"),
    ...FERRAMENTAS_DE_DESENHO,
    ...FERRAMENTAS_QUADRO,
  ],
  mapa: FERRAMENTAS_DE_DESENHO,
};

/**
 * Esta ferramenta é a que está na mão? O tipo de forma e o formato de área
 * entram na conta — são eles que separam botões que compartilham a ferramenta.
 */
function ehAtiva(
  ferramenta: Ferramenta,
  tool: Tool,
  tipoDeForma: TipoDeForma,
  formatoDeArea: FormatoDeArea,
): boolean {
  return (
    ferramenta.tool === tool &&
    (!ferramenta.tipoDeForma || ferramenta.tipoDeForma === tipoDeForma) &&
    (!ferramenta.formatoDeArea || ferramenta.formatoDeArea === formatoDeArea)
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
 * aparece nas duas réguas e na bolsa do rodapé, e a versão que recebia a
 * resposta pronta obrigava cada dono a repetir a mesma comparação -- que é
 * justamente onde o tipo de forma seria esquecido.
 */
function BotaoDeFerramenta({
  ferramenta,
  desabilitada = false,
  dica,
  aoEscolher,
}: {
  ferramenta: Ferramenta;
  desabilitada?: boolean;
  /**
   * De que lado a dica abre. Ausente = em cima, que é o do rodapé. A régua do
   * mapa pede `left`: encostada na borda direita, a dica em cima cobriria o
   * botão de cima da própria régua.
   */
  dica?: "top" | "left";
  /** Depois de escolher. É por aqui que a bolsa se fecha. */
  aoEscolher?: () => void;
}) {
  const tool = useToolStore((state) => state.tool);
  const tipoDeForma = useToolStore((state) => state.tipoDeForma);
  const formatoDeArea = useToolStore((state) => state.formatoDeArea);
  const setTool = useToolStore((state) => state.setTool);
  const setForma = useToolStore((state) => state.setForma);
  const setFormatoDeArea = useToolStore((state) => state.setFormatoDeArea);

  const { tool: value, label, hint, icon: Icon } = ferramenta;
  const ativa = ehAtiva(ferramenta, tool, tipoDeForma, formatoDeArea);

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
              if (ferramenta.formatoDeArea)
                setFormatoDeArea(ferramenta.formatoDeArea);
              setTool(value);
              aoEscolher?.();
            }}
          >
            <Icon />
          </Button>
        }
      />
      <TooltipContent side={dica}>
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground max-w-48">{hint}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A régua de medir, que depende da grade para saber quanto vale um metro.
 *
 * Montada a cada desenho e não posta na tabela: a dica dela muda com a cena --
 * sem grade, o que o botão tem a dizer é que falta ligar a grade.
 */
function reguaDeMedir(scene: Scene): Ferramenta {
  return {
    tool: "regua",
    label: "Régua",
    hint: scene.grid
      ? `Mede distância e área. Cada quadrado vale ${METROS_POR_QUADRADO} m.`
      : "Ligue a grade primeiro.",
    icon: Ruler,
  };
}

/**
 * A régua do MAPA, encostada na borda direita do palco.
 *
 * O que se marca no chão e fica: ponto, papel, grade, medida. Estava numa bolsa
 * do rodapé, atrás de dois cliques, e a bolsa dizia o que tinha dentro só
 * depois de aberta -- num mapa novo, ninguém descobre o que nunca viu.
 *
 * À DIREITA, de frente para a régua de desenho: as duas são barras expostas e
 * as duas respondem perguntas diferentes -- a da esquerda, "o que eu desenho";
 * esta, "o que eu marco no chão". Um canto para cada, e nenhuma delas atravessa
 * o rodapé, que continua sendo do PALCO.
 *
 * Fora do QUADRO, que não tem chão: nem ponto, nem grade, nem medida. O postit
 * dele é conteúdo, e por isso mora na régua da esquerda -- ver `DA_REGUA`.
 *
 * No FUNDO ela aparece pela metade: ponto e postit ficam -- anotar sobre a
 * imagem é o mesmo gesto de anotar sobre o mapa --, e a grade e a medida saem
 * com o separador. A régua inteira sumir no fundo tiraria do mestre o único
 * lugar onde ele guarda o que a mesa não vê.
 */
export function ReguaDoMapa({ scene }: { scene: Scene }) {
  const dasExtensoes = useFerramentasDeExtensao();
  const regua = reguaDeMedir(scene);

  return (
    <div className="bg-background/85 pointer-events-auto flex flex-col items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
      {FERRAMENTAS_MAPA.map((ferramenta) => (
        <BotaoDeFerramenta
          key={ferramenta.tool}
          ferramenta={ferramenta}
          dica="left"
        />
      ))}

      {/* A grade e a medida depois do risco: as duas são sobre o CHÃO e não
          sobre o que se crava nele, e a régua só mede porque a grade diz
          quanto vale um quadrado. O separador vai junto com elas: sem isso o
          fundo ficaria com um risco solto no pé da régua. */}
      {temMedida(scene) ? (
        <>
          <span className="bg-border my-1 h-px w-5" />

          <GridControl scene={scene} lado="left" />
          <BotaoDeFerramenta
            ferramenta={regua}
            desabilitada={!scene.grid}
            dica="left"
          />
        </>
      ) : null}

      {dasExtensoes.length > 0 ? (
        <>
          <span className="bg-border my-1 h-px w-5" />
          {dasExtensoes.map((ferramenta) => (
            <BotaoDeFerramenta
              key={ferramenta.tool}
              ferramenta={ferramenta}
              dica="left"
            />
          ))}
        </>
      ) : null}

      {/* O controle da ferramenta na mão vem no pé da régua, pela regra de
          sempre: ele fica ao lado de onde a escolha aconteceu. Os dois se
          escondem sozinhos, e por isso o risco pergunta antes de aparecer. */}
      <ControleDoMapa />
    </div>
  );
}

/**
 * O risco e o controle da ferramenta do mapa que está na mão, ou nada.
 *
 * Postit e régua de medir são as duas do mapa com preferência antes do gesto --
 * a cor do papel, a forma do medidor. Ponto e grade não têm o que perguntar
 * antes.
 */
function ControleDoMapa() {
  const tool = useToolStore((state) => state.tool);

  if (tool !== "postit" && tool !== "regua") return null;

  return (
    <>
      <span className="bg-border my-1 h-px w-5" />
      {tool === "postit" ? <PostitControl lado="left" /> : null}
      <ReguaControl lado="left" />
    </>
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
      {/* A pílula primeiro, porque ela é a porta do que se DESENHA: quadrado,
          círculo e traço livre, cada um virando parede, área escondida ou
          elemento. O que sobra na régua abaixo dela são os alvos diretos, que
          não têm desenho a escolher. Ver `PilulaDeDesenho`. */}
      <PilulaDeDesenho scene={scene} />

      <span className="bg-border my-1 h-px w-5" />

      {DA_REGUA[quadro ? "quadro" : "mapa"].map((ferramenta) => (
        <BotaoDeFerramenta
          key={
            ferramenta.tipoDeForma ??
            ferramenta.formatoDeArea ??
            ferramenta.tool
          }
          ferramenta={ferramenta}
        />
      ))}

      {/* As de plugin acompanham a régua só no quadro. No mapa elas já estão na
          régua da direita, e o mesmo botão em dois cantos do palco seria duas
          respostas para a pergunta de onde ele mora. */}
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
 * régua da direita, e a cor dele fica ao lado de onde a escolha aconteceu.
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
 * As ferramentas do RODAPÉ: a bolsa do PALCO, e só ela.
 *
 * Como pasta de aplicativos no celular: um botão à vista, e ele abre a fileira
 * do grupo por cima. O que mora aqui é o que se faz com a MÃO a cada minuto --
 * escolher, deslocar, riscar, apagar --, e vale nos dois tipos de cena.
 *
 * As outras duas famílias saíram para as bordas, cada uma numa barra exposta: o
 * que se DESENHA à esquerda (`ReguaDeDesenho`) e o que se marca no CHÃO à
 * direita (`ReguaDoMapa`). A bolsa do mapa era a última que sobrava, e ela
 * cobrava dois cliques por troca e só dizia o que tinha dentro depois de
 * aberta.
 *
 * O botão da bolsa mostra a ferramenta ATIVA dela, e não um ícone fixo: com a
 * bolsa fechada, o que está na mão é a única informação que importa. Escolher
 * uma ferramenta fecha a bolsa — escolheu, vai usar.
 *
 * A cor do lápis fica FORA da bolsa, ao lado dos botões: dentro, sumiria junto
 * com ela no instante em que o mestre escolhesse a ferramenta que a pede. A
 * regra é sempre a mesma -- o controle fica ao lado de onde a ferramenta foi
 * escolhida --, e é ela que leva a cor da forma para a régua da esquerda e a do
 * postit e do medidor para a régua do mapa.
 */
export function MestreToolbar({ scene }: { scene: Scene }) {
  const tool = useToolStore((state) => state.tool);
  const setTool = useToolStore((state) => state.setTool);
  const tipoDeForma = useToolStore((state) => state.tipoDeForma);
  const formatoDeArea = useToolStore((state) => state.formatoDeArea);

  const [aberta, setAberta] = useState<"palco" | null>(null);

  // Trocar de um mapa para um quadro com a névoa na mão deixaria a ferramenta
  // ativa sem botão na barra -- e o clique seguinte cobriria o quadro de preto.
  //
  // Uma linha por FERRAMENTA, e cada uma pergunta pela capacidade que ela usa.
  // Era uma condição só, com as quatro do mapa de um lado e a seta do outro, e
  // ela dizia a verdade enquanto os tipos eram dois: no fundo, a névoa e a
  // medida caem mas o alfinete FICA, e a lista única largaria os três juntos.
  useEffect(() => {
    if (tool === "fog" && !temNevoa(scene)) setTool("select");
    if (tool === "regua" && !temMedida(scene)) setTool("select");
    // Parede é do chão, e o chão que a tem é o do mapa: ver `Tool`.
    if (tool === "parede" && !temSol(scene)) setTool("select");
    if (tool === "pin" && !temAnotacao(scene)) setTool("select");
    // A letra e a forma atravessam a troca de cena porque valem nos três --
    // ver `FERRAMENTAS_DE_DESENHO` --, e largá-las aqui faria o mestre perder
    // a ferramenta ao ir buscar um mapa.
    if (tool === "ligacao" && !ehQuadro(scene)) setTool("select");
  }, [scene, tool, setTool]);

  // A ferramenta ativa da bolsa, para o botão dela mostrar.
  const daBolsa = (lista: Ferramenta[]) =>
    lista.find((f) => ehAtiva(f, tool, tipoDeForma, formatoDeArea));

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

      {/* Só com o LÁPIS na mão, e ele se esconde sozinho. É o único controle
          que sobrou no rodapé, pela regra de sempre: o lápis é escolhido aqui.
          A cor da forma acompanha a régua da esquerda; a do postit e a do
          medidor, a régua do mapa. */}
      <PencilControl />

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
