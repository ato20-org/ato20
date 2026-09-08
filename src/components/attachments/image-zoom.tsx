"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  clampZoomState,
  FIT,
  isFit,
  MAX_IMAGE_ZOOM,
  panBy,
  zoomAtPoint,
  type Point,
  type Size,
  type ZoomState,
} from "@/lib/attachments/zoom";

const WHEEL_STEP = 1.15;
const BUTTON_STEP = 1.5;

/**
 * Imagem com zoom e arraste.
 *
 * Ficha de personagem e mapa rabiscado só servem se puderem ser lidos de
 * perto. No encaixe a imagem cabe inteira; ampliando, arrasta-se para
 * percorrer. Vale igual para o jogador vendo o próprio arquivo e para o mestre
 * abrindo o de outro.
 */
export function ImageZoom({ src, alt }: { src: string; alt: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ZoomState>(FIT);
  const [container, setContainer] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainer({ width, height });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  /** Ponto do evento medido a partir do centro do contêiner. */
  function toCenter(clientX: number, clientY: number): Point {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    // Arrow e não declaração: `function` é hoisted, e o TypeScript então
    // perde a garantia de que `element` já passou pela guarda acima.
    const handleWheel = (event: WheelEvent) => {
      // Não-passivo para barrar a rolagem do diálogo: a roda aqui é zoom.
      event.preventDefault();

      const factor = event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      setState((current) =>
        zoomAtPoint(current, factor, toCenter(event.clientX, event.clientY), {
          width: element.clientWidth,
          height: element.clientHeight,
        }),
      );
    };

    element.addEventListener("wheel", handleWheel, { passive: false });

    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const active = new Map<number, Point>();
    let pinchDistance = 0;

    const size = () => ({ width: element.clientWidth, height: element.clientHeight });

    function distance(): number {
      const [a, b] = [...active.values()];
      if (!a || !b) return 0;

      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function midpoint(): Point {
      const points = [...active.values()];
      const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });

      return { x: sum.x / points.length, y: sum.y / points.length };
    }

    function handleDown(event: PointerEvent) {
      active.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (active.size === 2) pinchDistance = distance();
    }

    function handleMove(event: PointerEvent) {
      const previous = active.get(event.pointerId);
      if (!previous) return;

      const next = { x: event.clientX, y: event.clientY };
      active.set(event.pointerId, next);

      if (active.size >= 2) {
        const now = distance();
        if (pinchDistance > 0 && now > 0) {
          const center = midpoint();
          setState((current) =>
            zoomAtPoint(current, now / pinchDistance, toCenter(center.x, center.y), size()),
          );
        }
        pinchDistance = now;
        return;
      }

      setState((current) =>
        panBy(current, next.x - previous.x, next.y - previous.y, size()),
      );
    }

    function handleUp(event: PointerEvent) {
      active.delete(event.pointerId);
      if (active.size < 2) pinchDistance = 0;
    }

    element.addEventListener("pointerdown", handleDown);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    return () => {
      element.removeEventListener("pointerdown", handleDown);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, []);

  function step(factor: number) {
    setState((current) => zoomAtPoint(current, factor, { x: 0, y: 0 }, container));
  }

  const fitted = isFit(state);

  return (
    <div className="relative">
      <div
        ref={frameRef}
        className="relative h-[70dvh] overflow-hidden rounded-md bg-black"
        // Sem isto o browser rouba o gesto de duas mãos para dar zoom na página.
        style={{ touchAction: "none", cursor: fitted ? "default" : "grab" }}
        onDoubleClick={() =>
          setState((current) =>
            isFit(current)
              ? clampZoomState(
                  { zoom: 2, x: 0, y: 0 },
                  { width: frameRef.current?.clientWidth ?? 0, height: frameRef.current?.clientHeight ?? 0 },
                )
              : FIT,
          )
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 size-full object-contain select-none"
          style={{
            transform: `translate(${state.x}px, ${state.y}px) scale(${state.zoom})`,
            transformOrigin: "center",
          }}
        />
      </div>

      <div className="bg-background/85 absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border p-1 backdrop-blur">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Menos zoom"
          disabled={fitted}
          onClick={() => step(1 / BUTTON_STEP)}
        >
          <ZoomOut />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums">
          {Math.round(state.zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Mais zoom"
          disabled={state.zoom >= MAX_IMAGE_ZOOM}
          onClick={() => step(BUTTON_STEP)}
        >
          <ZoomIn />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Encaixar na tela"
          disabled={fitted}
          onClick={() => setState(FIT)}
        >
          <Maximize />
        </Button>
      </div>
    </div>
  );
}
