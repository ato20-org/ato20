"use client";

import {
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AArrowDown,
  AArrowUp,
  Blend,
  Bold,
  Drama,
  Eye,
  EyeOff,
  FlipHorizontal,
  Info,
  Italic,
  MoveVertical,
  Palette,
  PanelTop,
  PanelTopDashed,
  Trash2,
  Underline,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSceneScale } from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { itemBounds } from "@/lib/geometry/bounds";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import {
  angleTo,
  cursorDeGiro,
  handleCursor,
  handleDirection,
  itemCenter,
  normalizeAngle,
  resizeItem,
  RESIZE_HANDLES,
  rotateVec,
  snapAngle,
  type ResizeHandle,
  type TransformBox,
} from "@/lib/geometry/transform";

/** Acima de qualquer `z` de item: o gizmo nunca fica atrás do que ele controla. */
const GIZMO_Z = 10_000;

// Tamanhos em pixels de tela. Divididos pelo scale do palco, resultam em
// controles com o mesmo tamanho aparente em qualquer zoom.
const HANDLE_PX = 10;
const OUTLINE_PX = 1.5;
/** Altura da fileira de botões acima da caixa. */
const ROTATE_OFFSET_PX = 30;
/**
 * Lado da zona de giro que fica do lado de FORA de cada canto.
 *
 * Não há botão de girar: como no Figma, encostar o mouse perto do canto, mas
 * fora da alça, mostra o cursor de giro e arrasta o ângulo. A zona é maior que
 * a alça porque ninguém mira num quadrado de 10 pixels para começar um giro.
 */
const ROTATE_ZONE_PX = 24;

const CORNER_HANDLES = ["nw", "ne", "se", "sw"] as const satisfies readonly ResizeHandle[];

/**
 * Cursor de giro do canto: a seta curva, apontada na direção em que ele empurra.
 *
 * O ângulo já soma a rotação do item, assim como `handleCursor` faz para as
 * setas de redimensionar. O desenho é o de `cursorDeGiro` -- o mesmo que o anel
 * do token no celular do jogador usa.
 */
function rotateCursor(handle: ResizeHandle, rotation: number): string {
  const world = rotateVec(handleDirection(handle), rotation);

  // O desenho base aponta para o canto nordeste (-45deg); gira até o canto real.
  return cursorDeGiro((Math.atan2(world.y, world.x) * 180) / Math.PI + 45);
}

/**
 * Onde a zona de giro de cada canto se ancora: o canto da CAIXA é o canto
 * interno da zona, e ela cresce para fora. Assim a parte de dentro da caixa
 * continua sendo arrastar, e a alça, desenhada depois, fica por cima.
 */
const ROTATE_ZONE_POSITION: Record<
  (typeof CORNER_HANDLES)[number],
  { left: string; top: string; translate: string; origin: string }
> = {
  // `origin` é o ponto da ZONA que encosta no canto da caixa, e é o que fica
  // parado quando o `scale` desfaz a ampliação do plano. Sem ele, o `scale`
  // encolheria em volta do centro e a zona sairia de junto do canto.
  nw: {
    left: "0%",
    top: "0%",
    translate: "translate(-100%, -100%)",
    origin: "100% 100%",
  },
  ne: {
    left: "100%",
    top: "0%",
    translate: "translate(0, -100%)",
    origin: "0% 100%",
  },
  se: {
    left: "100%",
    top: "100%",
    translate: "translate(0, 0)",
    origin: "0% 0%",
  },
  sw: {
    left: "0%",
    top: "100%",
    translate: "translate(-100%, 0)",
    origin: "100% 0%",
  },
};
/** Folga entre a borda direita da caixa e o painel de opacidade. */
const PAINEL_GAP_PX = 12;

/**
 * O menor e o maior tijolo que a régua da parede alcança, em metros.
 *
 * Meio metro é uma mureta de jardim, e é o mínimo que ainda joga sombra que se
 * vê. Oito é uma muralha de castelo: acima disso a sombra atravessa o mapa
 * inteiro e a pergunta deixa de ser a altura da parede.
 */
const ALTURA_MINIMA_M = 0.5;
const ALTURA_MAXIMA_M = 8;

/**
 * O mínimo que o slider de opacidade alcança, em porcento.
 *
 * Não vai a zero pela mesma razão dos degraus do menu: item invisível continua
 * na cena, mas some da prévia e da lista de camadas — e o mestre fica com uma
 * imagem que não está em lugar nenhum e continua ali. Sumir de verdade é névoa
 * ou lixeira.
 */
const OPACIDADE_MINIMA = 10;

/**
 * A cor do gizmo, por tom.
 *
 * Existe porque token de personagem tem de se distinguir de qualquer outra
 * imagem selecionada: numa cena com mobília, mapa e quatro tokens, saber que a
 * caixa em volta é de uma PESSOA muda o que o mestre vai fazer com ela. Azul
 * porque o resto do palco já é do tom primário -- a moldura da câmera, a
 * seleção comum -- e um segundo item no mesmo tom não seria distinção nenhuma.
 *
 * O traço é uma string de CSS e não classe porque o contorno é `outline`
 * inline: `outline` com espessura em unidade de cena não sai de utilitário. A
 * alça usa o mesmo valor na sombra que faz a borda dela -- ver o `boxShadow`
 * lá embaixo.
 */
const TOM = {
  default: {
    traco: "var(--primary)",
    botao: "bg-primary text-primary-foreground",
  },
  personagem: {
    traco: "var(--color-sky-400)",
    botao: "bg-sky-500 text-white",
  },
} as const;

const HANDLE_POSITION: Record<ResizeHandle, { left: string; top: string }> = {
  nw: { left: "0%", top: "0%" },
  n: { left: "50%", top: "0%" },
  ne: { left: "100%", top: "0%" },
  e: { left: "100%", top: "50%" },
  se: { left: "100%", top: "100%" },
  s: { left: "50%", top: "100%" },
  sw: { left: "0%", top: "100%" },
  w: { left: "0%", top: "50%" },
};

type TransformHandlesProps = {
  box: TransformBox;
  /** Área escondida não gira: um retângulo torto não ajuda a cobrir nada. */
  rotatable?: boolean;
  /** Subconjunto de alças. Padrão: as oito. */
  handles?: readonly ResizeHandle[];
  /**
   * Proporção travada sempre, independente do Shift. Para caixas cuja
   * proporção é uma regra e não uma preferência, como a câmera da mesa.
   */
  keepAspect?: boolean;
  /** Empilhamento, para o gizmo da câmera ficar acima do da seleção. */
  zIndex?: number;
  /**
   * A cor do gizmo. `personagem` pinta contorno, alças e botões de azul.
   *
   * Não é derivado de `onOpenSheet` estar presente, apesar de hoje os dois
   * andarem juntos: cor e ação são coisas diferentes, e amarrá-las faria um
   * item com ficha mas sem botão -- travado, por exemplo -- perder a cor que o
   * identifica.
   */
  tom?: keyof typeof TOM;
  /**
   * Contorno sólido em volta da caixa. Desligado quando quem chama já desenha
   * o próprio contorno, como a câmera com sua borda tracejada.
   */
  outline?: boolean;
  /**
   * Arredondar a caixa para inteiro. Desligar quando quem consome re-deriva
   * uma dimensão da outra — ver `ResizeOptions.round`.
   */
  round?: boolean;
  /**
   * Presente = mostra o botão de excluir junto do gizmo. Ausente = nada a
   * excluir por ali, como no caso da câmera, que se desliga por outro caminho.
   */
  onDelete?: () => void;
  /** Presente = mostra o botão de espelhar na horizontal. */
  onFlip?: () => void;
  /**
   * Presente = mostra o botão que abre o slider de opacidade.
   *
   * Um par valor/callback e não só o callback, ao contrário dos outros botões:
   * este controle não dispara uma ação, ele MOSTRA um estado — um slider que
   * não soubesse a opacidade atual começaria sempre no cheio e mentiria sobre
   * o item.
   *
   * Ausente em tudo que não é imagem — névoa, moldura de câmera e retrato não
   * têm o campo.
   */
  opacidade?: { valor: number; onChange: (valor: number) => void };
  /**
   * Presente = mostra os botões de ênfase da letra, na mesma fileira do
   * espelhar e do excluir.
   *
   * Só o texto solto do quadro passa: negrito num token não quer dizer nada.
   * Os três são de ALTERNAR, e o botão mostra o estado -- aceso é ligado.
   */
  estilo?: {
    negrito?: boolean;
    italico?: boolean;
    sublinhado?: boolean;
    onChange: (patch: {
      negrito?: boolean;
      italico?: boolean;
      sublinhado?: boolean;
    }) => void;
  };
  /**
   * Presente = mostra o botão que abre as cores do PAPEL, no painel de baixo.
   *
   * As opções chegam prontas -- valor, rótulo e a classe que pinta a bolinha
   * --, e não uma lista de cores CSS como em `paleta`: a cor do papel é um
   * NOME no modelo (`amarelo`, `rosa`), e o que cada nome vale em fundo, anel
   * e texto é assunto de quem desenha o papel. Ver `CORES_POSTIT`.
   */
  papel?: {
    escolhida: string;
    opcoes: { valor: string; rotulo: string; classe: string }[];
    onEscolher: (valor: string) => void;
  };
  /**
   * Presente = mostra o botão de ajuda, que abre este conteúdo num popover.
   *
   * O conteúdo vem de fora porque é do ELEMENTO: os sinais que o postit
   * entende não têm por que morar no gizmo, que não sabe o que é um postit.
   */
  ajuda?: ReactNode;
  /**
   * Presente = mostra os dois botões de tamanho da letra, na mesma fileira.
   *
   * Só o cartão de nota passa: ele é o único elemento do quadro cujo texto tem
   * tamanho próprio e não vem da caixa -- redimensionar o cartão muda quanto
   * texto CABE, e não o tamanho da letra. Os dois gestos são diferentes e por
   * isso têm controles diferentes.
   *
   * Callback ausente = botão apagado, que é como o degrau do fim da escala se
   * anuncia. `valor` só aparece no rótulo de acessibilidade: um número no meio
   * da fileira faria os botões redondos deixarem de ser uma fileira de botões
   * redondos.
   */
  fonte?: {
    valor: number;
    menor?: () => void;
    maior?: () => void;
  };
  /**
   * Presente = mostra o botão da paleta, que abre cor e fundo no painel ao
   * lado.
   *
   * Serve ao texto ("Letra") e à forma ("Traço") -- as duas coisas do quadro
   * que têm cor própria. As cores são as do lápis, que é a paleta da casa.
   *
   * `null` no callback é "de volta ao padrão": cor do tema na letra, sem fundo
   * atrás dela. `undefined` não viaja, senão apagar a escolha e não mexer nela
   * seriam a mesma coisa.
   */
  paleta?: {
    /** O que a primeira fileira pinta: "Letra", "Traço". */
    titulo: string;
    cor?: string;
    fundo?: string;
    onChange: (patch: { cor?: string | null; fundo?: string | null }) => void;
  };
  /**
   * Presente = mostra o olho, que decide se a mesa vê este elemento.
   *
   * Só a letra solta e a forma passam, e só num MAPA: no quadro a folha vai
   * inteira para a mesa, e um olho lá seria um botão que não faz nada. Num
   * mapa elas nascem fechadas -- ver `naMesa` --, e este é o caminho para
   * abri-las uma a uma.
   *
   * Um par estado/ação e não só a ação, como em `opacidade` e ao contrário dos
   * outros botões: este controle MOSTRA um estado, e um olho que não soubesse
   * se o elemento está no ar seria um interruptor sem lâmpada.
   */
  mesa?: { naMesa: boolean; onToggle: () => void };
  /**
   * Presente = mostra a bolinha do teto, que decide se esta parede tem LAJE.
   *
   * Só a parede FECHADA passa: numa `linha` não há interior para cobrir, e um
   * botão apagado ali seria um controle que não controla nada. Ver `semTeto` em
   * `Parede`.
   *
   * Um par estado/ação como o olho, e pela mesma razão: o teto é um estado do
   * desenho -- coberto ou a céu aberto --, e um botão que não soubesse em qual
   * dos dois a parede está seria um interruptor sem lâmpada.
   */
  teto?: { coberta: boolean; onToggle: () => void };
  /**
   * Presente = mostra o botão da ALTURA, que abre a régua ao lado da caixa.
   *
   * Só a parede passa. Altura aqui não é o tamanho do desenho -- esse é o
   * gizmo, e o mestre já o arrasta pelos cantos --, é quão alto o tijolo sobe:
   * o que decide o comprimento da sombra e o degrau de quem for desenhado em
   * cima. Ver `altura` em `Parede`.
   *
   * Em METROS, porque é a régua de quem mestra: "dois metros" é uma parede, e
   * "110 unidades de cena" não é nada. Quem traduz é o chamador.
   */
  altura?: {
    metros: number;
    onChange: (metros: number) => void;
  };
  /**
   * Presente = mostra o botão que abre a ficha de quem este item é.
   *
   * Só aparece em token, que é item com `personagemId`. Uma imagem de mobília
   * não tem ficha para abrir, e um botão que existisse sempre — cinza na maior
   * parte dos itens — faria a fileira do gizmo crescer sem dizer nada.
   */
  onOpenSheet?: () => void;
  /**
   * Avisado no pointerdown de redimensionar ou girar.
   *
   * Existe para quem transforma um conjunto: o gizmo já congela a própria
   * caixa no início do gesto, mas quem aplica precisa congelar os itens também
   * — aplicar cada frame sobre o resultado do frame anterior comporia a escala.
   */
  onGestureStart?: () => void;
  /** A mão soltou a alça. É quando quem separa gesto de documento grava. */
  onGestureEnd?: () => void;
  onChange: (patch: Partial<TransformBox>) => void;
};

/**
 * Gizmo de seleção: contorno, alças de redimensionamento e zonas de giro fora
 * dos cantos. Vive no mesmo referencial rotacionado do item, então as alças
 * acompanham o giro.
 */
export function TransformHandles({
  box: item,
  rotatable = true,
  handles = RESIZE_HANDLES,
  keepAspect = false,
  zIndex = GIZMO_Z,
  tom = "default",
  outline = true,
  round = true,
  onDelete,
  onFlip,
  onOpenSheet,
  onGestureStart,
  onGestureEnd,
  onChange,
  opacidade,
  estilo,
  paleta,
  fonte,
  papel,
  ajuda,
  mesa,
  teto,
  altura,
}: TransformHandlesProps) {
  const { scale, toScene, planoDaMargem } = useSceneScale();
  const startDrag = useSceneDrag();

  /**
   * O painel começa fechado e é o botão que o abre.
   *
   * Fechado por padrão porque opacidade é ajuste de algumas imagens da cena, e
   * não de toda seleção: um painel sempre aberto cobriria o mapa à direita de
   * cada item clicado, inclusive nos noventa por cento dos cliques que são
   * para arrastar.
   *
   * Estado local, e não no store de seleção: abrir o painel não é um fato da
   * cena nem da sessão — quem remonta o gizmo (trocar de item selecionado, com
   * `key` no chamador) começa fechado de novo, que é o certo.
   */
  const [painelAberto, setPainelAberto] = useState(false);
  /**
   * A paleta é outro painel e outro estado: o gizmo do texto não tem
   * opacidade, e o da imagem não tem paleta -- mas um dia ter os dois não pode
   * significar abrir os dois com um clique só.
   */
  const [paletaAberta, setPaletaAberta] = useState(false);
  /** As cores do papel: outro painel, outro estado. Ver `paletaAberta`. */
  const [papelAberto, setPapelAberto] = useState(false);
  /** E a régua da altura da parede, pela mesma razão dos outros três. */
  const [alturaAberta, setAlturaAberta] = useState(false);

  const cor = TOM[tom];

  /** Pixels de tela convertidos para unidades de cena. */
  const px = (value: number) => value / scale;

  /**
   * Metade da altura da caixa ALINHADA AOS EIXOS que envolve o item já girado,
   * em unidade de cena, contada a partir do centro.
   *
   * É o que mantém a fileira de botões em cima do item mesmo torto. A borda de
   * cima do item girado aponta para o lado -- num item a 45 graus ela vira a
   * diagonal --, e ancorar a fileira nela levava os botões a passear em volta
   * do item a cada giro. Do centro para cima nesta medida cai sempre logo
   * acima do ponto mais alto do item, em qualquer ângulo.
   */
  const meiaAlturaDaCaixaGirada = itemCenter(item).y - itemBounds(item).minY;

  const startResize = (event: ReactPointerEvent, handle: ResizeHandle) => {
    onGestureStart?.();

    // Retrato do item no início do gesto: o delta do arrasto é acumulado desde
    // o pointerdown, então aplicá-lo sobre o estado corrente somaria duas vezes.
    const snapshot = item;

    startDrag(event, {
      onMove: (delta, native) =>
        onChange(
          resizeItem(snapshot, handle, delta, {
            keepAspect: keepAspect || native.shiftKey,
            round,
          }),
        ),
      onEnd: () => onGestureEnd?.(),
    });
  };

  const startRotate = (event: ReactPointerEvent) => {
    onGestureStart?.();

    // Rotação não usa delta: o ângulo vem da posição absoluta do cursor em
    // relação ao centro, que não se move enquanto o item gira.
    const center = itemCenter(item);
    const grabOffset = angleTo(center, toScene(event.clientX, event.clientY)) - item.rotation;

    startDrag(event, {
      onMove: (_delta, native) => {
        const pointer = toScene(native.clientX, native.clientY);
        const rotation = normalizeAngle(angleTo(center, pointer) - grabOffset);

        onChange({ rotation: native.shiftKey ? snapAngle(rotation) : Math.round(rotation) });
      },
      onEnd: () => onGestureEnd?.(),
    });
  };

  /**
   * O gizmo inteiro sai do plano de controles e vai para a MARGEM.
   *
   * Os dois envelopes têm a mesma geometria, então nada se move -- o que muda
   * é a FORMA de ampliar. Com a câmera parada o plano de controles amplia por
   * `zoom`, que é layout, e ali um valor de caixa abaixo de um pixel é levado
   * a um pixel inteiro antes de ser multiplicado: a borda de 1,5px da alça
   * virava 3px a 46%, e o `scale(1/scale)` da própria alça ainda multiplicava
   * o erro. Era o inchaço que aparecia na forma e no texto e não aparecia no
   * postit nem no cartão -- esses dois já desenhavam na margem.
   *
   * A margem amplia sempre por `transform`, que é pintura: não há piso de
   * caixa a atropelar medida nenhuma. E ela não tem caixa própria (0x0), então
   * um gizmo que passe da borda do plano -- alça de um token estacionado fora
   * do mapa -- não infla camada composta nenhuma. Ver `planoDaMargem` e
   * `debug-do-palco` §3.
   *
   * Sem margem -- a TV, que não a monta --, desenha onde está. Lá não há gizmo
   * de todo modo: ele é cromo do Mestre.
   */
  const conteudo = (
    <div
      className="pointer-events-none absolute"
      style={{
        // A posição entra no `transform` junto com o giro, e não em
        // `left`/`top`. O gizmo acompanha o que ele controla quadro a quadro
        // -- token arrastado, moldura de câmera puxada pelo canto --, e em
        // caixa isso marcava o documento inteiro para refazer o layout a cada
        // quadro. A medida está em `scripts/perf/README.md`.
        //
        // `translate` ANTES de `rotate` na lista, que é o mesmo que posicionar
        // e depois girar em torno do centro: a origem continua no meio da
        // caixa, e as alças ficam onde estavam.
        left: 0,
        top: 0,
        width: item.width,
        height: item.height,
        transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg)`,
        zIndex,
      }}
    >
      {outline ? (
        <TracoDaCaixa altura={item.height} cor={cor.traco} scale={scale} />
      ) : null}

      {/* Fileira acima da caixa. Botões moram aqui porque nenhum deles é
          redimensionamento, e ficariam competindo com as alças nas bordas. */}
      {onFlip ||
      onOpenSheet ||
      opacidade ||
      estilo ||
      paleta ||
      fonte ||
      papel ||
      ajuda ||
      mesa ||
      teto ||
      altura ||
      onDelete ? (
        <div
          className="pointer-events-none absolute flex items-center"
          // A POSIÇÃO continua em unidade de cena -- ela acompanha o item --, e
          // a ampliação é desfeita por `transform`, de uma vez, para a fileira
          // inteira.
          //
          // Por `transform` e não por `emPixelDeTela`: o gizmo mora na MARGEM,
          // que amplia por transform, e desfazer transform com transform
          // escala tudo junto -- caixa, borda e traço do ícone. Desfazer com
          // `zoom` misturava as duas formas, e aí cada medida pegava um
          // caminho: a caixa voltava ao tamanho certo e o traço do SVG saía
          // multiplicado, que era o ícone virando quadradinho cheio ao afastar
          // o palco. Ver o cabeçalho de `tracoDoIcone`.
          //
          // A origem é o CENTRO da caixa, e não o meio da borda de cima: com o
          // item torto, "em cima" não é a borda de cima DELE -- é a borda de
          // cima da caixa alinhada aos eixos que o envolve. Ancorar no centro e
          // subir `meiaAlturaDaCaixaGirada` deixa a fileira acima do item em
          // qualquer ângulo, e o contra-giro a deixa em pé: botão de excluir
          // não pode ficar de cabeça para baixo porque o token está deitado.
          style={{
            left: "50%",
            top: "50%",
            gap: 4,
            // Acima das zonas de giro, que são irmãs e vêm depois no DOM: numa
            // caixa estreita -- um texto de uma palavra -- a fileira transborda
            // para fora dos cantos, e a zona do canto de cima engolia o clique
            // do primeiro botão. Aqui o botão é o alvo explícito e ganha.
            zIndex: 1,
            // A lista é lida da direita para a esquerda pelo ponto:
            //
            // `translate(-50%, -100%)` encosta o MEIO DA BORDA DE BAIXO da
            // fileira na origem -- é ele que faz agora o papel do
            // `transformOrigin: 50% 100%` de antes, que aqui não serve porque a
            // origem precisa ser o centro da caixa para o giro rodar em volta
            // dele. `scale(1 / scale)` desfaz a ampliação do palco, em volta
            // desse mesmo ponto. `translate(0, -altura)` sobe a fileira até
            // acima do item.
            //
            // E `rotate(-giro)` por último na leitura, primeiro na lista, faz
            // as duas coisas de uma vez: deixa a fileira em pé, e faz o
            // `translate` de cima andar nos eixos da TELA em vez dos eixos do
            // item torto -- é o que mantém "subir" sendo subir com o item
            // deitado.
            transform:
              `rotate(${-item.rotation}deg) ` +
              `translate(0, ${-(meiaAlturaDaCaixaGirada + px(ROTATE_OFFSET_PX - HANDLE_PX * 2))}px) ` +
              `scale(${1 / scale}) translate(-50%, -100%)`,
            transformOrigin: "0 0",
            // CAMADA PRÓPRIA, e é o que mantém o botão nítido ampliado.
            //
            // A margem amplia por `transform`, e o WebKitGTK rasteriza uma
            // camada transformada no tamanho de LAYOUT para esticar a textura
            // depois -- é a mesma medida que fez o plano de conteúdo ganhar o
            // `zoom` (ver `conteudoNoLayout`). Dentro dessa camada esta fileira
            // é desenhada JÁ encolhida por `scale(1 / scale)`: a 1600% o botão
            // de 28px ocupa 3,2px de textura, e o compositor estica esses 3,2px
            // de volta para 28 na tela. Medido na captura do mestre: rampa de
            // vinte pixels onde devia haver borda de um.
            //
            // Promovida, ela é rasterizada na PRÓPRIA caixa -- 28px, porque
            // `transform` não mexe em layout --, e a matriz que o compositor
            // aplica depois é `scale × (1 / scale)`, ou seja, um. Textura 1:1.
            //
            // Não vale para o plano: promover o PLANO à mão borra sempre, e
            // está medido no cabeçalho de `SceneStage`. Aqui é o contrário --
            // o que se promove é justamente quem desfaz a ampliação.
            willChange: "transform",
          }}
        >
          {onFlip ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Espelhar na horizontal"
                    className={cn(
                      "pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full",
                      cor.botao,
                    )}
                    style={{ width: HANDLE_PX * 2, height: HANDLE_PX * 2 }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onFlip();
                    }}
                  >
                    <FlipHorizontal
                      style={{
                        width: HANDLE_PX * 1.2,
                        height: HANDLE_PX * 1.2,
                      }}
                    />
                  </button>
                }
              />
              <TooltipContent>Espelhar na horizontal</TooltipContent>
            </Tooltip>
          ) : null}

          {/* Antes do excluir, de propósito: o destrutivo fica na ponta da
              fileira, longe do que se clica sem medo. */}
          {onOpenSheet ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Abrir a ficha do personagem"
                    className={cn(
                      "pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full",
                      cor.botao,
                    )}
                    style={{ width: HANDLE_PX * 2, height: HANDLE_PX * 2 }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenSheet();
                    }}
                  >
                    <Drama
                      style={{
                        width: HANDLE_PX * 1.2,
                        height: HANDLE_PX * 1.2,
                      }}
                    />
                  </button>
                }
              />
              <TooltipContent>Abrir a ficha do personagem</TooltipContent>
            </Tooltip>
          ) : null}

          {/* Negrito, itálico e sublinhado, na ordem de qualquer editor: é
              memória motor, e trocá-la aqui não ganharia nada. */}
          {estilo
            ? (
                [
                  { chave: "negrito", rotulo: "Negrito", Icone: Bold },
                  { chave: "italico", rotulo: "Itálico", Icone: Italic },
                  {
                    chave: "sublinhado",
                    rotulo: "Sublinhado",
                    Icone: Underline,
                  },
                ] as const
              ).map(({ chave, rotulo, Icone }) => (
                <Tooltip key={chave}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={rotulo}
                        aria-pressed={Boolean(estilo[chave])}
                        className={cn(
                          "pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full",
                          cor.botao,
                          estilo[chave] && "ring-2 ring-white/70",
                        )}
                        style={{ width: HANDLE_PX * 2, height: HANDLE_PX * 2 }}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          estilo.onChange({ [chave]: !estilo[chave] });
                        }}
                      >
                        <Icone
                          style={{
                            width: HANDLE_PX * 1.2,
                            height: HANDLE_PX * 1.2,
                          }}
                        />
                      </button>
                    }
                  />
                  <TooltipContent>{rotulo}</TooltipContent>
                </Tooltip>
              ))
            : null}

          {/* Menor à esquerda, maior à direita: é a ordem da régua, e a mesma
              de qualquer editor. */}
          {fonte
            ? (
                [
                  {
                    chave: "menor",
                    rotulo: "Diminuir a fonte",
                    Icone: AArrowDown,
                    acao: fonte.menor,
                  },
                  {
                    chave: "maior",
                    rotulo: "Aumentar a fonte",
                    Icone: AArrowUp,
                    acao: fonte.maior,
                  },
                ] as const
              ).map(({ chave, rotulo, Icone, acao }) => (
                <Tooltip key={chave}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`${rotulo} (${fonte.valor})`}
                        disabled={!acao}
                        className={cn(
                          "pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full disabled:opacity-40",
                          cor.botao,
                        )}
                        style={{ width: HANDLE_PX * 2, height: HANDLE_PX * 2 }}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          acao?.();
                        }}
                      >
                        <Icone
                          style={{
                            width: HANDLE_PX * 1.2,
                            height: HANDLE_PX * 1.2,
                          }}
                        />
                      </button>
                    }
                  />
                  <TooltipContent>{rotulo}</TooltipContent>
                </Tooltip>
              ))
            : null}

          {paleta ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Cor e fundo"
                    aria-expanded={paletaAberta}
                    className={cn(
                      "pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full",
                      cor.botao,
                      paletaAberta && "ring-2 ring-white/70",
                    )}
                    style={{ width: HANDLE_PX * 2, height: HANDLE_PX * 2 }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setPaletaAberta((aberta) => !aberta);
                    }}
                  >
                    <Palette
                      style={{
                        width: HANDLE_PX * 1.2,
                        height: HANDLE_PX * 1.2,
                      }}
                    />
                  </button>
                }
              />
              <TooltipContent>Cor e fundo</TooltipContent>
            </Tooltip>
          ) : null}

          {opacidade ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Opacidade da imagem"
                    aria-expanded={painelAberto}
                    className={cn(
                      "pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full",
                      cor.botao,
                      // Aberto some o botão do fundo e deixa só o ícone: é o que
                      // conta que o painel à direita é deste item, e não do palco.
                      painelAberto && "ring-2 ring-white/70",
                    )}
                    style={{ width: HANDLE_PX * 2, height: HANDLE_PX * 2 }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setPainelAberto((aberto) => !aberto);
                    }}
                  >
                    <Blend
                      style={{
                        width: HANDLE_PX * 1.2,
                        height: HANDLE_PX * 1.2,
                      }}
                    />
                  </button>
                }
              />
              <TooltipContent>Opacidade da imagem</TooltipContent>
            </Tooltip>
          ) : null}

          {papel ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Cor do papel"
                    aria-expanded={papelAberto}
                    className={cn(
                      "pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full",
                      cor.botao,
                      papelAberto && "ring-2 ring-white/70",
                    )}
                    style={{ width: HANDLE_PX * 2, height: HANDLE_PX * 2 }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setPapelAberto((aberto) => !aberto);
                    }}
                  >
                    <Palette
                      style={{
                        width: HANDLE_PX * 1.2,
                        height: HANDLE_PX * 1.2,
                      }}
                    />
                  </button>
                }
              />
              <TooltipContent>Cor do papel</TooltipContent>
            </Tooltip>
          ) : null}

          {/* A ajuda é `Popover` e não `Tooltip`: é texto para ler, e some ao
              clicar fora. O conteúdo sai do palco por portal, então não encolhe
              com o zoom -- a 40% ele seria um selo ilegível. */}
          {ajuda ? (
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label="Como escrever aqui"
                    className={cn(
                      "pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full",
                      cor.botao,
                    )}
                    style={{ width: HANDLE_PX * 2, height: HANDLE_PX * 2 }}
                    // O pointerdown não pode virar clique no vazio do palco: lá
                    // ele esvaziaria a seleção, e o gizmo sumiria debaixo da mão
                    // antes de o popover abrir.
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <Info
                      style={{
                        width: HANDLE_PX * 1.2,
                        height: HANDLE_PX * 1.2,
                      }}
                    />
                  </button>
                }
              />
              <PopoverContent align="center" className="w-72 p-3" side="top">
                {ajuda}
              </PopoverContent>
            </Popover>
          ) : null}

          {/* Antes do excluir pela mesma razão do resto: o destrutivo fica na
              ponta da fileira. Aceso = a mesa vê; apagado = só o mestre. */}
          {mesa ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={
                      mesa.naMesa ? "Tirar da mesa" : "Mostrar para a mesa"
                    }
                    aria-pressed={mesa.naMesa}
                    className={cn(
                      "pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full",
                      mesa.naMesa ? "bg-emerald-600 text-white" : cor.botao,
                    )}
                    style={{ width: HANDLE_PX * 2, height: HANDLE_PX * 2 }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      mesa.onToggle();
                    }}
                  >
                    {mesa.naMesa ? (
                      <Eye
                        style={{ width: HANDLE_PX * 1.2, height: HANDLE_PX * 1.2 }}
                      />
                    ) : (
                      <EyeOff
                        style={{ width: HANDLE_PX * 1.2, height: HANDLE_PX * 1.2 }}
                      />
                    )}
                  </button>
                }
              />
              <TooltipContent>
                {mesa.naMesa
                  ? "A mesa está vendo. Clique para esconder."
                  : "Só você vê. Clique para mostrar na TV e nos celulares."}
              </TooltipContent>
            </Tooltip>
          ) : null}

          {/* A altura, antes do teto: primeiro quão alta é a parede, depois se
              ela é coberta. O botão fica aceso enquanto a régua está aberta,
              como o da opacidade. */}
          {altura ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Altura da parede"
                    aria-pressed={alturaAberta}
                    className={cn(
                      "pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full",
                      alturaAberta
                        ? "bg-amber-500 text-neutral-950"
                        : cor.botao,
                    )}
                    style={{ width: HANDLE_PX * 2, height: HANDLE_PX * 2 }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setAlturaAberta((aberta) => !aberta);
                    }}
                  >
                    <MoveVertical
                      style={{
                        width: HANDLE_PX * 1.2,
                        height: HANDLE_PX * 1.2,
                      }}
                    />
                  </button>
                }
              />
              <TooltipContent>
                <p className="font-medium">Altura da parede</p>
                <p className="text-muted-foreground max-w-52">
                  Quanto ela sobe. É o que decide o comprimento da sombra que
                  ela joga no mapa.
                </p>
              </TooltipContent>
            </Tooltip>
          ) : null}

          {/* O teto, na mesma fileira e antes do excluir. Aceso = tem laje;
              apagado = a céu aberto. O desenho é o mesmo nos dois, com a tampa
              cheia ou tracejada: trocar de ícone faria o olho procurar o que
              mudou em vez de ler o estado. */}
          {teto ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={teto.coberta ? "Tirar o teto" : "Pôr um teto"}
                    aria-pressed={teto.coberta}
                    className={cn(
                      "pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full",
                      teto.coberta
                        ? "bg-amber-500 text-neutral-950"
                        : cor.botao,
                    )}
                    style={{ width: HANDLE_PX * 2, height: HANDLE_PX * 2 }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      teto.onToggle();
                    }}
                  >
                    {teto.coberta ? (
                      <PanelTop
                        style={{
                          width: HANDLE_PX * 1.2,
                          height: HANDLE_PX * 1.2,
                        }}
                      />
                    ) : (
                      <PanelTopDashed
                        style={{
                          width: HANDLE_PX * 1.2,
                          height: HANDLE_PX * 1.2,
                        }}
                      />
                    )}
                  </button>
                }
              />
              <TooltipContent>
                {teto.coberta
                  ? "Coberta: a sombra não entra nela, porque o miolo é a pedra do mapa."
                  : "A céu aberto: a sombra dos muros cai dentro dela, como cai para fora."}
              </TooltipContent>
            </Tooltip>
          ) : null}

          {onDelete ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Excluir"
                    className="pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full bg-red-600 text-white"
                    style={{ width: HANDLE_PX * 2, height: HANDLE_PX * 2 }}
                    // `pointerdown` e não `click`: o palco inteiro reage a
                    // pointerdown, e esperar o clique deixaria a seleção mudar antes.
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDelete();
                    }}
                  >
                    <Trash2
                      style={{
                        width: HANDLE_PX * 1.2,
                        height: HANDLE_PX * 1.2,
                      }}
                    />
                  </button>
                }
              />
              <TooltipContent>Excluir do mapa</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      ) : null}

      {/* O painel, colado na borda DIREITA da caixa.

          À direita e não na fileira de cima porque ele não é um botão: é um
          controle que fica aberto enquanto se arrasta, e a fileira de cima tem
          30 pixels de altura contados para caber botões redondos.

          Contra-girado pelo ângulo do item, e por duas razões. A primeira é
          que um slider de cabeça para baixo num token girado 180 graus pede
          para arrastar ao contrário. A segunda é aritmética: o slider mede o
          ponteiro pelo retângulo do próprio controle, e retângulo de elemento
          girado é a caixa envolvente -- com o giro anulado, o que sobra na
          conta é só a escala do palco, que se cancela sozinha na razão.

          A ampliação do plano é desfeita de uma vez no filho, e não `px()` a
          `px()`: o slider é um componente de fora, com medidas em pixel de
          CSS, e dividir cada uma delas pelo scale exigiria uma cópia dele
          aqui. Ver o comentário no filho sobre por que é `emPixelDeTela`. */}
      {opacidade && painelAberto ? (
        <div
          className="pointer-events-auto absolute"
          style={{
            left: "100%",
            top: "50%",
            // Acima das zonas de giro, pelo mesmo motivo da fileira de botões.
            zIndex: 1,
            transform: `translate(${px(PAINEL_GAP_PX)}px, -50%) rotate(${-item.rotation}deg)`,
            transformOrigin: "0 50%",
          }}
          // O palco inteiro reage a pointerdown -- clicar aqui esvaziaria a
          // seleção e o painel sumiria debaixo da mão. Sem `preventDefault`:
          // o slider precisa do gesto que o `preventDefault` cancelaria.
          onPointerDown={(event) => event.stopPropagation()}
        >
          {/* Contra-escalado por `transform`, como a fileira de botões e pela
              mesma razão: uma só forma de desfazer a ampliação em todo o
              gizmo. Ver o comentário da fileira. */}
          <div
            className="bg-popover ring-foreground/10 flex flex-col items-center gap-2 rounded-lg px-2 py-3 shadow-md ring-1"
            style={{
              transform: `scale(${1 / scale})`,
              transformOrigin: "0 50%",
              // Camada própria, como a fileira. Ver o comentário lá.
              willChange: "transform",
            }}
          >
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {Math.round(opacidade.valor * 100)}%
            </span>
            <Slider
              aria-label="Opacidade da imagem"
              orientation="vertical"
              value={[Math.round(opacidade.valor * 100)]}
              min={OPACIDADE_MINIMA}
              max={100}
              step={1}
              // 160px: é o `min-h-40` que o `Slider` vertical já impõe no
              // trilho, e um valor menor aqui só faria o painel ficar menor
              // que o conteúdo.
              className="h-40"
              onValueChange={(valor) =>
                opacidade.onChange(
                  (Array.isArray(valor) ? (valor[0] ?? 100) : valor) / 100,
                )
              }
            />
          </div>
        </div>
      ) : null}

      {/* A régua da altura, no mesmo lugar do painel de opacidade e pelas
          mesmas razões -- ver o comentário lá. Os dois nunca aparecem juntos:
          parede não tem opacidade, e item não tem altura. */}
      {altura && alturaAberta ? (
        <div
          className="pointer-events-auto absolute"
          style={{
            left: "100%",
            top: "50%",
            zIndex: 1,
            transform: `translate(${px(PAINEL_GAP_PX)}px, -50%) rotate(${-item.rotation}deg)`,
            transformOrigin: "0 50%",
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            className="bg-popover ring-foreground/10 flex flex-col items-center gap-2 rounded-lg px-2 py-3 shadow-md ring-1"
            style={{
              transform: `scale(${1 / scale})`,
              transformOrigin: "0 50%",
              willChange: "transform",
            }}
          >
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {altura.metros.toFixed(1).replace(".", ",")} m
            </span>
            <Slider
              aria-label="Altura da parede, em metros"
              orientation="vertical"
              value={[altura.metros]}
              min={ALTURA_MINIMA_M}
              max={ALTURA_MAXIMA_M}
              step={0.5}
              className="h-40"
              onValueChange={(valor) =>
                altura.onChange(Array.isArray(valor) ? (valor[0] ?? 2) : valor)
              }
            />
          </div>
        </div>
      ) : null}

      {/* A paleta, ABAIXO da caixa e não ao lado como o painel de opacidade.
          Ao lado ela cobria a ponta da fileira de botões -- inclusive o
          excluir -- em toda caixa estreita, que é o caso comum de um texto de
          uma palavra. Embaixo, os dois controles do gizmo ficam em andares
          diferentes. Contra-girada pela mesma razão do outro painel: bolinhas
          de cabeça para baixo num texto torto pedem o clique errado. */}
      {paleta && paletaAberta ? (
        <div
          className="pointer-events-auto absolute"
          style={{
            left: "50%",
            top: "100%",
            zIndex: 1,
            transform: `translate(-50%, ${px(PAINEL_GAP_PX)}px) rotate(${-item.rotation}deg)`,
            transformOrigin: "50% 0",
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {/* Contra-escalado como a fileira. Ver o painel de opacidade. */}
          <div
            className="bg-popover ring-foreground/10 flex flex-col gap-2 rounded-lg px-2 py-2 shadow-md ring-1"
            style={{
              transform: `scale(${1 / scale})`,
              transformOrigin: "50% 0",
              // Camada própria, como a fileira. Ver o comentário lá.
              willChange: "transform",
            }}
          >
            <Fileira
              titulo={paleta.titulo}
              escolhida={paleta.cor}
              // O padrão volta pelo primeiro botão, e ele existe nas duas
              // fileiras: sem ele, escolher uma cor seria um caminho sem volta.
              padrao="A"
              onEscolher={(valor) => paleta.onChange({ cor: valor })}
            />
            <Fileira
              titulo="Fundo"
              escolhida={paleta.fundo}
              padrao="∅"
              translucido
              onEscolher={(valor) => paleta.onChange({ fundo: valor })}
            />
          </div>
        </div>
      ) : null}

      {/* As cores do papel, embaixo da caixa como a paleta e pela mesma razão:
          ao lado, elas cobriam a ponta da fileira de botões em todo papel
          estreito. */}
      {papel && papelAberto ? (
        <div
          className="pointer-events-auto absolute"
          style={{
            left: "50%",
            top: "100%",
            zIndex: 1,
            transform: `translate(-50%, ${px(PAINEL_GAP_PX)}px) rotate(${-item.rotation}deg)`,
            transformOrigin: "50% 0",
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            className="bg-popover ring-foreground/10 flex items-center gap-1 rounded-lg px-2 py-2 shadow-md ring-1"
            style={{
              transform: `scale(${1 / scale})`,
              transformOrigin: "50% 0",
              // Camada própria, como a fileira. Ver o comentário lá.
              willChange: "transform",
            }}
          >
            {papel.opcoes.map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                aria-label={opcao.rotulo}
                aria-pressed={opcao.valor === papel.escolhida}
                className={cn(
                  "size-5 rounded-full border transition-transform",
                  opcao.classe,
                  opcao.valor === papel.escolhida
                    ? "border-foreground scale-110"
                    : "border-white/20 hover:scale-105",
                )}
                onClick={() => papel.onEscolher(opcao.valor)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Antes das alças, de propósito: a alça fica por cima onde as duas se
          tocam, e em cima do ponto continua sendo redimensionar. */}
      {rotatable
        ? CORNER_HANDLES.map((handle) => (
            <div
              key={`rotate-${handle}`}
              role="button"
              aria-label={`Rotacionar pelo canto ${handle}`}
              className="pointer-events-auto absolute touch-none"
              style={{
                left: ROTATE_ZONE_POSITION[handle].left,
                top: ROTATE_ZONE_POSITION[handle].top,
                // Fixo mais `scale`, pela mesma razão das alças abaixo: a zona
                // de giro acompanha cada canto e mudava de caixa por notch.
                width: ROTATE_ZONE_PX,
                height: ROTATE_ZONE_PX,
                transformOrigin: ROTATE_ZONE_POSITION[handle].origin,
                transform: `${ROTATE_ZONE_POSITION[handle].translate} scale(${1 / scale})`,
                cursor: rotateCursor(handle, item.rotation),
              }}
              onPointerDown={startRotate}
            />
          ))
        : null}

      {handles.map((handle) => (
        <button
          key={handle}
          type="button"
          aria-label={`Redimensionar ${handle}`}
          className="bg-background pointer-events-auto absolute touch-none rounded-[1px]"
          style={{
            ...HANDLE_POSITION[handle],
            // Tamanho FIXO, e a ampliação do plano desfeita por `transform`.
            //
            // Era `px(HANDLE_PX)`, que divide pelo `scale` -- e o `scale` muda
            // a cada notch da roda. Cada alça reescrevia `width`, `height` e
            // `border-width`, que são caixa, e caixa marca o DOCUMENTO INTEIRO
            // para refazer o layout. Com sete câmeras na tela são vinte e oito
            // alças fazendo isso por notch: medido na webview, o campeão
            // absoluto do zoom do palco, com mais de doze mil mudanças de
            // layout numa corrida de oito segundos.
            //
            // Do jeito de agora as três medidas são constantes e só a matriz
            // muda, que é trabalho de compositor. O tamanho na tela é o mesmo:
            // `HANDLE_PX × (1 / scale) × scale`. E o centro continua no ponto,
            // porque as duas operações preservam o centro do elemento.
            width: HANDLE_PX,
            height: HANDLE_PX,
            // A borda é PINTADA, e não caixa -- e é o que a impede de inchar
            // quando o palco afasta.
            //
            // Como `border-width`, ela era 1,5px de autor dentro de um plano
            // sob `zoom: scale`: a 33% o valor usado dá 0,495px, o WebKit leva
            // sub-pixel de caixa PARA um pixel, e o `scale(1/scale)` desta alça
            // multiplica o pixel inteiro de volta -- três pixels na tela no
            // lugar de um e meio, e pior quanto mais longe. É o mesmo piso que
            // engrossava os ícones (ver `tracoDoIcone`), e aqui ele não tem
            // como ser desfeito por conta: quem floreia é o plano de cima.
            //
            // Sombra interna não é layout: ela é pintada com antialias, atravessa
            // o `zoom` sem piso, e desenha exatamente onde a borda desenhava --
            // a caixa é `border-box`, então a borda já ficava por dentro.
            boxShadow: `inset 0 0 0 ${OUTLINE_PX}px ${cor.traco}`,
            transform: `translate(-50%, -50%) scale(${1 / scale})`,
            // Camada própria, como a fileira de botões: sem isto a alça é
            // rasterizada encolhida dentro da camada da margem e esticada de
            // volta. Ver o comentário da fileira.
            willChange: "transform",
            // Compensa o giro: a seta aponta para onde a alça de fato empurra.
            cursor: handleCursor(handle, item.rotation),
          }}
          onPointerDown={(event) => startResize(event, handle)}
        />
      ))}
    </div>
  );

  return planoDaMargem ? createPortal(conteudo, planoDaMargem) : conteudo;
}

/**
 * Uma fileira de cores da paleta do gizmo, com o padrão na frente.
 *
 * As mesmas seis do lápis, e o primeiro botão volta ao padrão -- cor do tema
 * na letra, sem fundo atrás dela. `translucido` desenha as bolinhas do fundo
 * esmaecidas, que é como elas vão aparecer atrás da letra: fundo chapado
 * esconderia o que está embaixo, e o que se quer é marca-texto.
 */
/**
 * O retângulo da caixa, em quatro barras.
 *
 * Era um `outline` de `OUTLINE_PX / scale` unidades de cena, e é essa forma que
 * borra. O gizmo mora na MARGEM, que amplia sempre por `transform`, e o
 * WebKitGTK rasteriza camada transformada no tamanho de LAYOUT: a 1600% o traço
 * tinha 0,17px de textura, e o compositor esticava esses 0,17 de volta para 1,5
 * na tela. Medido na captura do mestre -- rampa de dezessete pixels, sem topo
 * reto, onde devia haver uma linha.
 *
 * Aqui cada barra tem o lado FINO em pixel de layout -- 1,5px, constante -- e
 * desfaz a ampliação só nesse eixo. Com camada própria ela é rasterizada na
 * caixa dela, e a matriz que sobra no eixo fino é `scale × (1 / scale)`, ou
 * seja, um: textura 1:1. O lado comprido é esticado pelo plano, e esticar cor
 * sólida não custa nitidez nenhuma.
 *
 * O lado comprido fica em `100%`, que é unidade de cena e CAIXA CONSTANTE. Em
 * pixel de tela ele mudaria a cada notch da roda, e caixa que muda marca o
 * documento inteiro para refazer o layout -- é a medida que tirou `px()` das
 * alças, doze mil mudanças de layout numa corrida de oito segundos. Aqui o que
 * muda por notch é só a matriz.
 *
 * As barras de pé cobrem os quatro cantos, esticadas por `scaleY` -- matriz, e
 * não caixa. Sem isso sobra um furo em cada canto, do tamanho do próprio traço.
 */
function TracoDaCaixa({
  altura,
  cor,
  scale,
}: {
  /** A altura da caixa, em unidades de cena: é o que dá o estico dos cantos. */
  altura: number;
  cor: string;
  scale: number;
}) {
  /** A espessura do traço em unidade de cena -- o quanto ele passa da caixa. */
  const fino = OUTLINE_PX / scale;
  /** Quanto as barras de pé crescem para alcançar os cantos. */
  const estico = altura > 0 ? (altura + 2 * fino) / altura : 1;

  const barra: CSSProperties = {
    position: "absolute",
    backgroundColor: cor,
    transformOrigin: "0 0",
    // Camada própria: é ela que faz o lado fino ser rasterizado com 1,5px em
    // vez de com 1,5/scale. Ver o cabeçalho.
    willChange: "transform",
  };

  return (
    <>
      <div
        style={{
          ...barra,
          left: 0,
          top: 0,
          width: "100%",
          height: OUTLINE_PX,
          // `translateY(-100%)` é o ÚLTIMO da lista, logo o primeiro a valer: a
          // barra sobe a própria espessura e só depois encolhe, encostando por
          // fora da borda de cima -- onde o `outline` desenhava.
          transform: `scaleY(${1 / scale}) translateY(-100%)`,
        }}
      />
      <div
        style={{
          ...barra,
          left: 0,
          top: "100%",
          width: "100%",
          height: OUTLINE_PX,
          transform: `scaleY(${1 / scale})`,
        }}
      />
      <div
        style={{
          ...barra,
          left: 0,
          top: 0,
          width: OUTLINE_PX,
          height: "100%",
          transform: `translateY(${-fino}px) scaleY(${estico}) scaleX(${1 / scale}) translateX(-100%)`,
        }}
      />
      <div
        style={{
          ...barra,
          left: "100%",
          top: 0,
          width: OUTLINE_PX,
          height: "100%",
          transform: `translateY(${-fino}px) scaleY(${estico}) scaleX(${1 / scale})`,
        }}
      />
    </>
  );
}

function Fileira({
  titulo,
  escolhida,
  padrao,
  translucido = false,
  onEscolher,
}: {
  titulo: string;
  escolhida?: string;
  padrao: string;
  translucido?: boolean;
  onEscolher: (cor: string | null) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-muted-foreground text-[10px]">{titulo}</span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`${titulo}: padrão`}
          aria-pressed={escolhida === undefined}
          className={cn(
            "grid size-5 place-items-center rounded-full border text-[9px] transition-transform",
            escolhida === undefined
              ? "border-foreground scale-110"
              : "border-white/20 hover:scale-105",
          )}
          onClick={() => onEscolher(null)}
        >
          {padrao}
        </button>

        {CORES_LAPIS.map((opcao) => (
          <button
            key={opcao}
            type="button"
            aria-label={`${titulo} ${opcao}`}
            aria-pressed={opcao === escolhida}
            className={cn(
              "size-5 rounded-full border transition-transform",
              opcao === escolhida
                ? "border-foreground scale-110"
                : "border-white/20 hover:scale-105",
            )}
            style={{ background: opcao, opacity: translucido ? 0.35 : 1 }}
            onClick={() => onEscolher(opcao)}
          />
        ))}
      </div>
    </div>
  );
}
