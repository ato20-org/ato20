"use client";

import {
  DoorOpen,
  Eraser,
  Flame,
  Hand,
  MapPin,
  MousePointer2,
  Pencil,
  Ruler,
  Spline,
  StickyNote,
  Type,
} from "lucide-react";
import { createElement, useEffect, useMemo } from "react";

import { BarreiraDeExtensao } from "@/components/mestre/barreira-de-extensao";
import { BotaoDeElementos } from "@/components/mestre/pilula-de-desenho";
import { ReguaControl } from "@/components/mestre/regua-control";
import { PostitControl } from "@/components/mestre/postit-control";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { garantirCarregada } from "@/lib/extensoes/carregar";
import { iconeDeExtensao } from "@/lib/extensoes/icones";
import { chaveContribuicao } from "@/lib/extensoes/manifesto";
import { METROS_POR_QUADRADO } from "@/lib/geometry/grid";
import { t } from "@/lib/i18n/bancada";
import { useContribuicoesStore } from "@/lib/store/use-contribuicoes-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import {
  ferramentaDeExtensao,
  useToolStore,
  type Tool,
} from "@/lib/store/use-tool-store";
import {
  ehQuadro,
  temAnotacao,
  temAreaDeEfeito,
  temLuz,
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
    label: t.mestreToolbar.selecionar,
    hint: t.mestreToolbar.selecionarDica,
    icon: MousePointer2,
  },
  {
    tool: "hand",
    label: t.mestreToolbar.deslocar,
    hint: t.mestreToolbar.deslocarDica,
    icon: Hand,
  },
  {
    tool: "lapis",
    label: t.mestreToolbar.lapis,
    hint: t.mestreToolbar.lapisDica,
    icon: Pencil,
  },
  {
    tool: "borracha",
    label: t.mestreToolbar.borracha,
    hint: t.mestreToolbar.borrachaDica,
    icon: Eraser,
  },
];

/**
 * As do MAPA: marcam o chão -- pontos e papéis. Junto delas fica a régua, que
 * também é sobre o mapa e não sobre o que anda nele.
 *
 * A área escondida e a parede saíram daqui para os Elementos: as duas são
 * REGIÕES, e a pergunta "qual o desenho dela" passou a ser a mesma nas quatro
 * naturezas. Ver `BotaoDeElementos`.
 *
 * Moram na régua da borda direita, à vista -- ver `ReguaDoMapa`. No quadro só o
 * postit sobrevive, e sobe para a barra do topo: ver `DO_QUADRO`.
 */
const FERRAMENTAS_MAPA: Ferramenta[] = [
  {
    tool: "pin",
    label: t.mestreToolbar.ponto,
    hint: t.mestreToolbar.pontoDica,
    icon: MapPin,
  },
  {
    tool: "postit",
    label: t.mestreToolbar.postit,
    hint: t.mestreToolbar.postitDica,
    icon: StickyNote,
  },
];

/**
 * A luz: crava uma tocha no clique.
 *
 * Na régua do mapa, com o ponto e o papel, e não na pílula de desenho com a
 * parede: as três CRAVAM no clique, e a parede se desenha no arrasto. Fora da
 * lista de cima porque só o mapa tem luz -- o fundo fica com o ponto e o papel.
 */
const FERRAMENTA_LUZ: Ferramenta = {
  tool: "luz",
  label: t.mestreToolbar.luz,
  hint: t.mestreToolbar.luzDica,
  icon: Flame,
};

/**
 * A porta: traça a folha da dobradiça até a ponta.
 *
 * Embaixo da luz porque é a luz que ela deixa passar: o mestre acende a sala,
 * fecha a porta e confere o escuro do outro lado, sem atravessar a barra.
 */
const FERRAMENTA_PORTA: Ferramenta = {
  tool: "porta",
  label: t.mestreToolbar.porta,
  hint: t.mestreToolbar.portaDica,
  icon: DoorOpen,
};

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
    label: t.mestreToolbar.texto,
    hint: t.mestreToolbar.textoDica,
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
    label: t.mestreToolbar.seta,
    hint: t.mestreToolbar.setaDica,
    icon: Spline,
  },
];

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
 * O ícone vem pelo NOME, da lista do aplicativo (`icones.ts`), e não por um
 * arquivo da extensão: carregar imagem aqui pagaria um pedido por ferramenta
 * numa barra que o mestre olha o tempo todo, e uma que falhasse deixaria um
 * buraco no lugar de um botão. Nome que não está na lista, ou nenhum, desenha
 * a peça de quebra-cabeça. O nome da ferramenta aparece no `tooltip`.
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
            icon: iconeDeExtensao(ferramenta.icone),
          })),
        ),
    [extensoes],
  );
}

/**
 * As opções da ferramenta de plugin que está na mão, ou nada.
 *
 * A pílula do plugin, pela regra de sempre: ao lado de onde a ferramenta foi
 * escolhida. O plugin entrega um componente em `registrar.ferramenta({
 * opcoes })`, e ele aparece aqui enquanto a ferramenta estiver ativa -- dentro
 * da barreira, porque é código de terceiro numa barra que o mestre olha o
 * tempo todo.
 */
function ControleDeExtensao() {
  const tool = useToolStore((state) => state.tool);
  const daExtensao = ferramentaDeExtensao(tool);
  const registrada = useContribuicoesStore((state) =>
    daExtensao
      ? state.ferramentas[chaveContribuicao(daExtensao.extensaoId, daExtensao.ferramentaId)]
      : undefined,
  );
  const extensao = useExtensoesStore((state) =>
    daExtensao ? state.extensoes.find((atual) => atual.id === daExtensao.extensaoId) : undefined,
  );

  if (!registrada?.opcoes || !extensao) return null;

  return (
    <>
      <Separador />
      <BarreiraDeExtensao nome={extensao.nome} reserva={null}>
        {createElement(registrada.opcoes)}
      </BarreiraDeExtensao>
    </>
  );
}

/**
 * Um botão de ferramenta, com o nome e o que ela faz no `tooltip`.
 *
 * Lê o store por conta própria em vez de receber "está ativa?" de fora: ele
 * aparece na barra do topo e na régua do mapa, e a versão que recebia a
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
   * De que lado a dica abre. Ausente = em cima. A régua do mapa pede `left`:
   * encostada na borda direita, a dica em cima cobriria o botão de cima da
   * própria régua. A barra do topo pede `bottom`: em cima não há palco.
   */
  dica?: "top" | "left" | "bottom";
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
              // Escolher a ferramenta de um plugin é o terceiro gatilho da
              // ativação preguiçosa, ao lado de abrir um painel e disparar um
              // comando. Sem isto, um plugin que só traz ferramenta nunca era
              // importado: o palco achava a ferramenta declarada e não
              // registrada, e o clique não fazia nada -- que é o certo para
              // o palco, e errado para o mestre que acabou de apertar o botão.
              const daExtensao = ferramentaDeExtensao(value);
              if (daExtensao) {
                const extensao = useExtensoesStore
                  .getState()
                  .extensoes.find((atual) => atual.id === daExtensao.extensaoId);
                if (extensao?.habilitada) void garantirCarregada(extensao);
              }
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
    label: t.mestreToolbar.regua,
    hint: scene.grid
      ? t.mestreToolbar.reguaDica(METROS_POR_QUADRADO)
      : // Onde ela mora agora, e não só "ligue a grade": o botão que a ligava
        // era o vizinho de cima, e quem o procurar aqui não vai achar.
        t.mestreToolbar.reguaSemGrade,
    icon: Ruler,
  };
}

/**
 * A régua do MAPA, encostada na borda direita do palco.
 *
 * O que se marca no chão e fica: ponto, papel, medida. Estava numa bolsa
 * do rodapé, atrás de dois cliques, e a bolsa dizia o que tinha dentro só
 * depois de aberta -- num mapa novo, ninguém descobre o que nunca viu.
 *
 * À DIREITA, à parte da barra do topo: as duas respondem perguntas diferentes
 * -- a do topo, "o que eu faço com a mão e o que eu desenho"; esta, "o que eu
 * marco no chão". Ver `MestreToolbar`.
 *
 * Fora do QUADRO, que não tem chão: nem ponto, nem medida. O postit dele é
 * conteúdo, e por isso mora na barra do topo -- ver `DO_QUADRO`.
 *
 * No FUNDO ela aparece pela metade: ponto e postit ficam -- anotar sobre a
 * imagem é o mesmo gesto de anotar sobre o mapa --, e a medida sai com o
 * separador. A régua inteira sumir no fundo tiraria do mestre o único lugar
 * onde ele guarda o que a mesa não vê.
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

      {temLuz(scene) ? (
        <BotaoDeFerramenta ferramenta={FERRAMENTA_LUZ} dica="left" />
      ) : null}
      {temSol(scene) ? (
        <BotaoDeFerramenta ferramenta={FERRAMENTA_PORTA} dica="left" />
      ) : null}

      {/* A medida depois do ponto e do papel: ela é sobre o CHÃO e não sobre
          o que se crava nele.

          A grade estava aqui ao lado dela e foi para as configurações do mapa:
          ligar a grade não é pegar uma ferramenta, é um estado da cena, como o
          sol. A régua ficou porque ela É gesto -- e continua apagada sem grade,
          que é quem diz quanto vale um quadrado. Ver `GridControl`.

          O separador vem junto com ela: o fundo não mede, e sem isso ele
          ficaria com um risco solto no pé da régua. */}
      {temMedida(scene) ? (
        <>
          <span className="bg-border my-1 h-px w-5" />

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
      <ControleDeExtensao />
    </div>
  );
}

/**
 * O risco e o controle da ferramenta do mapa que está na mão, ou nada.
 *
 * Postit e régua de medir são as duas do mapa com preferência antes do gesto --
 * a cor do papel, a forma do medidor. O ponto não tem o que perguntar antes.
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
 * O que o QUADRO acrescenta à barra, depois das seis de sempre: o postit -- que
 * ali é conteúdo, e não anotação -- e a seta entre duas coisas. No mapa o
 * postit mora na régua da direita, e a seta não existe: ver `ReguaDoMapa` e
 * `FERRAMENTAS_QUADRO`.
 */
const DO_QUADRO: Ferramenta[] = [
  ...FERRAMENTAS_MAPA.filter((f) => f.tool === "postit"),
  ...FERRAMENTAS_QUADRO,
];

/**
 * A barra de ferramentas, no TOPO do palco, ao centro.
 *
 * Seta, Mão, Lápis, Borracha, Texto, Elementos: o que se faz com a mão a cada
 * minuto e o que se desenha, numa fileira só, à vista. Eram duas barras e uma
 * bolsa -- o palco no rodapé, atrás de um botão que abria a fileira; o desenho
 * numa régua na borda esquerda --, e trocar do lápis para o texto atravessava
 * a tela. A régua do MAPA continua na borda direita: o que se marca no chão é
 * outra pergunta, e ela segue respondida lá.
 *
 * No topo e não no rodapé: o canto de baixo à esquerda ficou para os painéis
 * da ferramenta na mão -- o do pincel, o de Elementos, o de texto --, que
 * crescem para cima. A barra em cima e o painel embaixo nunca disputam o
 * mesmo lugar.
 *
 * Sem o botão de largar que o rodapé tinha: a Seta está sempre à vista na
 * barra, e escolhê-la é largar o que estava na mão. O Esc continua.
 *
 * No QUADRO, depois de um separador, vêm as que só existem lá -- o postit e a
 * seta --, as dos plugins e o controle da que está na mão.
 */
export function MestreToolbar({ scene }: { scene: Scene }) {
  const tool = useToolStore((state) => state.tool);
  const setTool = useToolStore((state) => state.setTool);
  const dasExtensoes = useFerramentasDeExtensao();
  const quadro = ehQuadro(scene);

  // Trocar de um mapa para um quadro com a névoa na mão deixaria a ferramenta
  // ativa sem botão na barra -- e o clique seguinte cobriria o quadro de preto.
  //
  // Uma linha por FERRAMENTA, e cada uma pergunta pela capacidade que ela usa.
  // Era uma condição só, com as quatro do mapa de um lado e a seta do outro, e
  // ela dizia a verdade enquanto os tipos eram dois: no fundo, a névoa e a
  // medida caem mas o alfinete FICA, e a lista única largaria os três juntos.
  useEffect(() => {
    if (tool === "fog" && !temNevoa(scene)) setTool("select");
    if (tool === "efeito" && !temAreaDeEfeito(scene)) setTool("select");
    if (tool === "regua" && !temMedida(scene)) setTool("select");
    // Parede é do chão, e o chão que a tem é o do mapa: ver `Tool`.
    if (tool === "parede" && !temSol(scene)) setTool("select");
    if (tool === "luz" && !temLuz(scene)) setTool("select");
    if (tool === "porta" && !temSol(scene)) setTool("select");
    if (tool === "pin" && !temAnotacao(scene)) setTool("select");
    // A letra e a forma atravessam a troca de cena porque valem nos três --
    // ver `FERRAMENTAS_DE_DESENHO` --, e largá-las aqui faria o mestre perder
    // a ferramenta ao ir buscar um mapa.
    if (tool === "ligacao" && !ehQuadro(scene)) setTool("select");
  }, [scene, tool, setTool]);

  // A ferramenta de um plugin que foi desligado ou desinstalado cai também. O
  // botão dela some da barra com o plugin, mas o valor ficava no store: o
  // palco continuava em modo de mira, com cursor de cruz e sem nenhum botão
  // aceso dizendo por quê -- e o clique não fazia nada.
  const extensoes = useExtensoesStore((state) => state.extensoes);
  useEffect(() => {
    const daExtensao = ferramentaDeExtensao(tool);
    if (!daExtensao) return;

    const dona = extensoes.find((atual) => atual.id === daExtensao.extensaoId);
    if (!dona?.habilitada) setTool("select");
  }, [extensoes, tool, setTool]);

  return (
    <div className="bg-background/85 pointer-events-auto flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
      {FERRAMENTAS_PALCO.map((ferramenta) => (
        <BotaoDeFerramenta key={ferramenta.tool} ferramenta={ferramenta} dica="bottom" />
      ))}
      {FERRAMENTAS_DE_DESENHO.map((ferramenta) => (
        <BotaoDeFerramenta key={ferramenta.tool} ferramenta={ferramenta} dica="bottom" />
      ))}
      <BotaoDeElementos scene={scene} dica="bottom" />

      {quadro ? (
        <>
          <Separador />
          {DO_QUADRO.map((ferramenta) => (
            <BotaoDeFerramenta key={ferramenta.tool} ferramenta={ferramenta} dica="bottom" />
          ))}
          {/* As de plugin acompanham a barra só no quadro. No mapa elas já
              estão na régua da direita, e o mesmo botão em dois cantos do
              palco seria duas respostas para a pergunta de onde ele mora. */}
          {dasExtensoes.map((ferramenta) => (
            <BotaoDeFerramenta key={ferramenta.tool} ferramenta={ferramenta} dica="bottom" />
          ))}
          {/* O controle da que está na mão, ao lado de onde ela foi
              escolhida: a cor do postit, as opções do plugin. */}
          {tool === "postit" ? (
            <>
              <Separador />
              <PostitControl lado="bottom" />
            </>
          ) : null}
          <ControleDeExtensao />
        </>
      ) : null}
    </div>
  );
}

/** O risco entre dois grupos da barra. */
function Separador() {
  return <span className="bg-border mx-1 h-5 w-px" />;
}
