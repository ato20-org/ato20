"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { Blend, Drama, FlipHorizontal, RotateCw, Trash2 } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { cn } from "@/lib/utils";
import {
  angleTo,
  handleCursor,
  itemCenter,
  normalizeAngle,
  resizeItem,
  RESIZE_HANDLES,
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
const ROTATE_OFFSET_PX = 30;
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
  onChange: (patch: Partial<TransformBox>) => void;
};

/**
 * Gizmo de seleção: contorno, alças de redimensionamento e um botão de
 * rotação. Vive no mesmo referencial rotacionado do item, então as alças
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
  onChange,
  opacidade,
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
    });
  };

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        transform: `rotate(${item.rotation}deg)`,
        zIndex,
      }}
    >
      {outline ? (
        <div
          className="absolute inset-0"
          style={{ outline: `${px(OUTLINE_PX)}px solid ${cor.traco}` }}
        />
      ) : null}

      {/* Fileira acima da caixa. Girar e excluir moram juntos porque nenhum
          dos dois é redimensionamento, e ficariam competindo com as alças se
          fossem postos nas bordas. */}
      {rotatable || onFlip || onOpenSheet || opacidade || onDelete ? (
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
            ...emPixelDeTela(scale),
            transform: `translate(-50%, calc(-100% - ${ROTATE_OFFSET_PX - HANDLE_PX * 2}px))`,
          }}
        >
          {rotatable ? (
            <button
              type="button"
              aria-label="Rotacionar"
              className={cn(
                "pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full",
                cor.botao,
              )}
              style={{
                width: HANDLE_PX * 2,
                height: HANDLE_PX * 2,
                cursor: "grab",
              }}
              onPointerDown={startRotate}
            >
              <RotateCw style={{ width: HANDLE_PX * 1.2, height: HANDLE_PX * 1.2 }} />
            </button>
          ) : null}

          {onFlip ? (
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
          ) : null}

          {/* Antes do excluir, de propósito: o destrutivo fica na ponta da
              fileira, longe do que se clica sem medo. */}
          {onOpenSheet ? (
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
          ) : null}

          {opacidade ? (
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
          ) : null}

          {onDelete ? (
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
            width: px(HANDLE_PX),
            height: px(HANDLE_PX),
            borderWidth: px(OUTLINE_PX),
            transform: "translate(-50%, -50%)",
            // Compensa o giro: a seta aponta para onde a alça de fato empurra.
            cursor: handleCursor(handle, item.rotation),
          }}
          onPointerDown={(event) => startResize(event, handle)}
        />
      ))}
    </div>
  );
}
