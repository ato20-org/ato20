"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { FlipHorizontal, RotateCw, Trash2 } from "lucide-react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
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
  outline = true,
  round = true,
  onDelete,
  onFlip,
  onGestureStart,
  onChange,
}: TransformHandlesProps) {
  const { scale, toScene } = useSceneScale();
  const startDrag = useSceneDrag();

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
          style={{ outline: `${px(OUTLINE_PX)}px solid var(--primary)` }}
        />
      ) : null}

      {/* Fileira acima da caixa. Girar e excluir moram juntos porque nenhum
          dos dois é redimensionamento, e ficariam competindo com as alças se
          fossem postos nas bordas. */}
      {rotatable || onFlip || onDelete ? (
        <div
          className="pointer-events-none absolute flex items-center"
          style={{
            left: "50%",
            top: 0,
            gap: px(4),
            transform: `translate(-50%, calc(-100% - ${px(ROTATE_OFFSET_PX - HANDLE_PX * 2)}px))`,
          }}
        >
          {rotatable ? (
            <button
              type="button"
              aria-label="Rotacionar"
              className="text-primary-foreground bg-primary pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full"
              style={{
                width: px(HANDLE_PX * 2),
                height: px(HANDLE_PX * 2),
                cursor: "grab",
              }}
              onPointerDown={startRotate}
            >
              <RotateCw style={{ width: px(HANDLE_PX * 1.2), height: px(HANDLE_PX * 1.2) }} />
            </button>
          ) : null}

          {onFlip ? (
            <button
              type="button"
              aria-label="Espelhar na horizontal"
              className="text-primary-foreground bg-primary pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full"
              style={{ width: px(HANDLE_PX * 2), height: px(HANDLE_PX * 2) }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onFlip();
              }}
            >
              <FlipHorizontal
                style={{ width: px(HANDLE_PX * 1.2), height: px(HANDLE_PX * 1.2) }}
              />
            </button>
          ) : null}

          {onDelete ? (
            <button
              type="button"
              aria-label="Excluir"
              className="pointer-events-auto grid shrink-0 touch-none place-items-center rounded-full bg-red-600 text-white"
              style={{ width: px(HANDLE_PX * 2), height: px(HANDLE_PX * 2) }}
              // `pointerdown` e não `click`: o palco inteiro reage a
              // pointerdown, e esperar o clique deixaria a seleção mudar antes.
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 style={{ width: px(HANDLE_PX * 1.2), height: px(HANDLE_PX * 1.2) }} />
            </button>
          ) : null}
        </div>
      ) : null}

      {handles.map((handle) => (
        <button
          key={handle}
          type="button"
          aria-label={`Redimensionar ${handle}`}
          className="bg-background border-primary pointer-events-auto absolute touch-none rounded-[1px]"
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
