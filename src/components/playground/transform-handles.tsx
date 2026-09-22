"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Blend,
  Bold,
  Drama,
  FlipHorizontal,
  Italic,
  Palette,
  Trash2,
  Underline,
} from "lucide-react";

import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import {
  angleTo,
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
 * Cursor de giro: uma seta curva, apontada na direção em que o canto empurra.
 *
 * CSS não tem cursor de rotação, então o desenho vai em SVG inline. O ângulo
 * já soma a rotação do item, assim como `handleCursor` faz para as setas de
 * redimensionar.
 */
function rotateCursor(handle: ResizeHandle, rotation: number): string {
  const world = rotateVec(handleDirection(handle), rotation);
  // O desenho base aponta para o canto nordeste (-45deg); gira até o canto real.
  const degrees = (Math.atan2(world.y, world.x) * 180) / Math.PI + 45;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
    `<g transform='rotate(${degrees.toFixed(1)} 12 12)' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'>` +
    `<path d='M6 16a6 6 0 0 1 12-4'/><path d='M18 8v4h-4'/></g>` +
    `<g transform='rotate(${degrees.toFixed(1)} 12 12)' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>` +
    `<path d='M6 16a6 6 0 0 1 12-4'/><path d='M18 8v4h-4'/></g></svg>`;

  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 12 12, grab`;
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
  nw: { left: "0%", top: "0%", translate: "translate(-100%, -100%)", origin: "100% 100%" },
  ne: { left: "100%", top: "0%", translate: "translate(0, -100%)", origin: "0% 100%" },
  se: { left: "100%", top: "100%", translate: "translate(0, 0)", origin: "0% 0%" },
  sw: { left: "0%", top: "100%", translate: "translate(-100%, 0)", origin: "100% 0%" },
};
/** Folga entre a borda direita da caixa e o painel de opacidade. */
const PAINEL_GAP_PX = 12;

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
 * inline: `outline` com espessura em unidade de cena não sai de utilitário.
 */
const TOM = {
  default: {
    traco: "var(--primary)",
    alca: "border-primary",
    botao: "bg-primary text-primary-foreground",
  },
  personagem: {
    traco: "var(--color-sky-400)",
    alca: "border-sky-400",
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
}: TransformHandlesProps) {
  const { scale, toScene } = useSceneScale();
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

  const cor = TOM[tom];

  /** Pixels de tela convertidos para unidades de cena. */
  const px = (value: number) => value / scale;

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

  return (
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
        <div
          className="absolute inset-0"
          style={{ outline: `${px(OUTLINE_PX)}px solid ${cor.traco}` }}
        />
      ) : null}

      {/* Fileira acima da caixa. Botões moram aqui porque nenhum deles é
          redimensionamento, e ficariam competindo com as alças nas bordas. */}
      {onFlip || onOpenSheet || opacidade || estilo || paleta || onDelete ? (
        <div
          className="pointer-events-none absolute flex items-center"
          // A POSIÇÃO continua em unidade de cena -- ela acompanha o item. O
          // que muda é o conteúdo: `emPixelDeTela` desfaz a ampliação do plano,
          // e daqui para dentro tudo é medido em pixel de tela, sem sub-pixel
          // para o piso do `zoom` pegar.
          style={{
            left: "50%",
            top: 0,
            gap: 4,
            // Acima das zonas de giro, que são irmãs e vêm depois no DOM: numa
            // caixa estreita -- um texto de uma palavra -- a fileira transborda
            // para fora dos cantos, e a zona do canto de cima engolia o clique
            // do primeiro botão. Aqui o botão é o alvo explícito e ganha.
            zIndex: 1,
            ...emPixelDeTela(scale),
            transform: `translate(-50%, calc(-100% - ${ROTATE_OFFSET_PX - HANDLE_PX * 2}px))`,
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
                      style={{ width: HANDLE_PX * 1.2, height: HANDLE_PX * 1.2 }}
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
                    <Drama style={{ width: HANDLE_PX * 1.2, height: HANDLE_PX * 1.2 }} />
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
                  { chave: "sublinhado", rotulo: "Sublinhado", Icone: Underline },
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
                          style={{ width: HANDLE_PX * 1.2, height: HANDLE_PX * 1.2 }}
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
                    <Palette style={{ width: HANDLE_PX * 1.2, height: HANDLE_PX * 1.2 }} />
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
                    <Blend style={{ width: HANDLE_PX * 1.2, height: HANDLE_PX * 1.2 }} />
                  </button>
                }
              />
              <TooltipContent>Opacidade da imagem</TooltipContent>
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
                    <Trash2 style={{ width: HANDLE_PX * 1.2, height: HANDLE_PX * 1.2 }} />
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

          Contra-escalado pelo mesmo motivo dos `px()` em volta, mas de uma vez
          só: o slider é um componente de fora, com medidas em pixel de CSS, e
          dividir cada uma delas pelo scale exigiria uma cópia dele aqui. */}
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
          <div
            className="bg-popover ring-foreground/10 flex flex-col items-center gap-2 rounded-lg px-2 py-3 shadow-md ring-1"
            style={{ transform: `scale(${1 / scale})`, transformOrigin: "0 50%" }}
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
                opacidade.onChange((Array.isArray(valor) ? (valor[0] ?? 100) : valor) / 100)
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
          <div
            className="bg-popover ring-foreground/10 flex flex-col gap-2 rounded-lg px-2 py-2 shadow-md ring-1"
            style={{ transform: `scale(${1 / scale})`, transformOrigin: "50% 0" }}
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
          className={cn(
            "bg-background pointer-events-auto absolute touch-none rounded-[1px]",
            cor.alca,
          )}
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
            borderWidth: OUTLINE_PX,
            transform: `translate(-50%, -50%) scale(${1 / scale})`,
            // Compensa o giro: a seta aponta para onde a alça de fato empurra.
            cursor: handleCursor(handle, item.rotation),
          }}
          onPointerDown={(event) => startResize(event, handle)}
        />
      ))}
    </div>
  );
}

/**
 * Uma fileira de cores da paleta do gizmo, com o padrão na frente.
 *
 * As mesmas seis do lápis, e o primeiro botão volta ao padrão -- cor do tema
 * na letra, sem fundo atrás dela. `translucido` desenha as bolinhas do fundo
 * esmaecidas, que é como elas vão aparecer atrás da letra: fundo chapado
 * esconderia o que está embaixo, e o que se quer é marca-texto.
 */
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
