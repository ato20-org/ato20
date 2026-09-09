"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { Vec } from "@/lib/geometry/transform";
import { FULL_VIEWPORT, panViewport, zoomViewport } from "@/lib/geometry/viewport";
import { cn } from "@/lib/utils";
import { SCENE_HEIGHT, SCENE_WIDTH, type Viewport } from "@/types/scene";

type SceneScale = {
  /** Fator entre pixels de tela e unidades de cena. 0 antes da primeira medida. */
  scale: number;
  /** Converte um ponto de `clientX/clientY` para coordenadas de cena. */
  toScene: (clientX: number, clientY: number) => Vec;
};

const SceneScaleContext = createContext<SceneScale | null>(null);

/**
 * Só funciona dentro de `SceneStage`. Alças e arrasto precisam do fator para
 * traduzir movimento de mouse em unidades de cena, e para desenhar controles
 * com tamanho constante na tela independente do zoom do palco.
 */
export function useSceneScale(): SceneScale {
  const value = useContext(SceneScaleContext);
  if (!value) throw new Error("useSceneScale() precisa estar dentro de <SceneStage>");

  return value;
}

/** Passo de zoom por notch da roda. */
const WHEEL_ZOOM_STEP = 1.15;

type SceneStageProps = {
  children?: ReactNode;
  className?: string;
  /** Recorte do plano a exibir. Ausente = plano inteiro. */
  viewport?: Viewport;
  /**
   * Presente = o palco aceita roda, pinça e arraste para navegar, e informa o
   * novo recorte. Ausente = palco fixo, que é o caso da miniatura.
   */
  onViewportChange?: (viewport: Viewport) => void;
  /**
   * Arrastar com um dedo/botão desloca a cena em vez de agir nos itens.
   *
   * No Operador é ligado enquanto o espaço está pressionado. As visões de
   * espectador não usam: quem enquadra é o mestre, e a câmera da cena é a
   * única fonte de enquadramento delas.
   */
  panOnDrag?: boolean;
  /** Contorno do limite do plano. Útil ao mestre quando está ampliado. */
  bounds?: boolean;
  /**
   * Interpola a câmera: zoom e deslocamento chegam em amostras, e sem isto a
   * tela inteira salta a cada uma. Ver `.scene-smooth-camera` em
   * `globals.css`.
   *
   * Desligado onde a câmera é gesto direto — o palco do Operador —, senão o
   * enquadramento correria atrás da roda do mouse.
   */
  smooth?: boolean;
};

/**
 * Moldura do plano de cena.
 *
 * Renderiza um retângulo de SCENE_WIDTH x SCENE_HEIGHT e o escala para que o
 * recorte pedido caiba no espaço disponível, então todo filho pode posicionar
 * em coordenadas de cena e ignorar tanto o tamanho da tela quanto o zoom. É
 * isso que faz o layout do Operador bater com o da TV.
 */
export function SceneStage({
  children,
  className,
  viewport = FULL_VIEWPORT,
  onViewportChange,
  panOnDrag = false,
  bounds = false,
  smooth = false,
}: SceneStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });


  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFrame({ width, height });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);


  // Zero em qualquer eixo significa que a moldura ainda não foi medida — ou
  // que a cadeia de altura acima dela quebrou. Nos dois casos não há escala
  // possível, e desenhar com `scale(0)` só mostraria preto.
  const scale =
    frame.width === 0 || frame.height === 0
      ? 0
      : Math.min(frame.width / viewport.width, frame.height / viewport.height);

  // Deslocamento que centraliza o recorte na moldura. Com `transform-origin`
  // no canto, translate e scale compõem de forma previsível.
  const offsetX = (frame.width - viewport.width * scale) / 2 - viewport.x * scale;
  const offsetY = (frame.height - viewport.height * scale) / 2 - viewport.y * scale;

  /**
   * Liga a transição da câmera só depois do primeiro paint já medido.
   *
   * Imperativo de propósito: se a classe entrasse no mesmo render em que a
   * escala deixa de ser zero, a abertura de toda tela começaria com a cena
   * crescendo do nada — o `scale(0)` do primeiro paint seria o quadro inicial
   * da animação. Aqui ela passa a valer para a mudança de câmera *seguinte*,
   * que é a que precisa ser suave.
   */
  useEffect(() => {
    if (!smooth || scale === 0) return;

    planeRef.current?.classList.add("scene-smooth-camera");
  }, [smooth, scale]);

  const toScene = useCallback(
    (clientX: number, clientY: number): Vec => {
      // `getBoundingClientRect` já devolve a caixa depois do transform, então o
      // canto do retângulo é o ponto (0,0) da cena na tela.
      const rect = planeRef.current?.getBoundingClientRect();
      if (!rect || scale === 0) return { x: 0, y: 0 };

      return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
    },
    [scale],
  );

  const value = useMemo<SceneScale>(() => ({ scale, toScene }), [scale, toScene]);

  // Guardados em ref porque os listeners nativos abaixo são registrados uma
  // vez e precisam ver sempre o estado atual. Atualizados em efeito, não em
  // render: escrever numa ref durante o render é o que o React proíbe.
  const stateRef = useRef({ viewport, scale, toScene, onViewportChange, panOnDrag });

  useEffect(() => {
    stateRef.current = { viewport, scale, toScene, onViewportChange, panOnDrag };
  });

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    function handleWheel(event: WheelEvent) {
      const { onViewportChange: notify, toScene: project } = stateRef.current;
      if (!notify) return;

      // Listener não-passivo justamente para poder barrar o scroll da página:
      // a roda sobre o palco é zoom, não rolagem.
      event.preventDefault();

      const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
      notify(
        zoomViewport(
          stateRef.current.viewport,
          factor,
          project(event.clientX, event.clientY),
        ),
      );
    }

    element.addEventListener("wheel", handleWheel, { passive: false });

    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    /** Ponteiros ativos, para distinguir arraste de pinça. */
    const active = new Map<number, Vec>();
    let pinchDistance = 0;
    let panning = false;

    function center(): Vec {
      const points = [...active.values()];
      const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
        x: 0,
        y: 0,
      });

      return { x: sum.x / points.length, y: sum.y / points.length };
    }

    function distance(): number {
      const [a, b] = [...active.values()];
      if (!a || !b) return 0;

      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function handleDown(event: PointerEvent) {
      const { onViewportChange: notify, panOnDrag: pan } = stateRef.current;
      if (!notify) return;

      // Botão do meio sempre navega, inclusive no Operador, onde o botão
      // esquerdo pertence à seleção.
      const wantsPan = pan || event.button === 1;
      if (!wantsPan && event.pointerType === "mouse") return;

      active.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (active.size === 2) {
        pinchDistance = distance();
        panning = false;
        return;
      }

      if (active.size === 1 && wantsPan) {
        panning = true;
        if (event.button === 1) event.preventDefault();
      }
    }

    function handleMove(event: PointerEvent) {
      const { onViewportChange: notify, scale: current, toScene: project } = stateRef.current;
      if (!notify || current === 0 || !active.has(event.pointerId)) return;

      const previous = active.get(event.pointerId)!;
      const next = { x: event.clientX, y: event.clientY };
      active.set(event.pointerId, next);

      if (active.size >= 2) {
        const now = distance();
        if (pinchDistance > 0 && now > 0) {
          const anchor = center();
          notify(
            zoomViewport(
              stateRef.current.viewport,
              now / pinchDistance,
              project(anchor.x, anchor.y),
            ),
          );
        }
        pinchDistance = now;
        return;
      }

      if (!panning) return;

      // Arrastar move a cena junto do dedo, logo o recorte anda ao contrário.
      notify(
        panViewport(
          stateRef.current.viewport,
          -(next.x - previous.x) / current,
          -(next.y - previous.y) / current,
        ),
      );
    }

    function handleUp(event: PointerEvent) {
      active.delete(event.pointerId);
      if (active.size < 2) pinchDistance = 0;
      if (active.size === 0) panning = false;
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

  return (
    <div
      ref={frameRef}
      className={cn("relative flex-1 overflow-hidden bg-black", className)}
      // Sem isto o browser rouba o gesto de duas mãos para dar zoom na página.
      style={onViewportChange ? { touchAction: "none" } : undefined}
    >
      <div
        ref={planeRef}
        // `scale === 0` é o primeiro paint, antes do ResizeObserver medir.
        // Renderizar nessa hora mostraria a cena em tamanho cheio por um frame.
        className={cn(
          "absolute top-0 left-0 bg-black",
          bounds && "outline outline-white/10",
          scale === 0 && "invisible",
        )}
        style={{
          width: SCENE_WIDTH,
          height: SCENE_HEIGHT,
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        {/* Sem escala, sem filhos.
            Treze lugares no palco convertem pixel de tela em unidade de cena
            dividindo por `scale` -- a borda do gizmo, a faixa da moldura de
            câmera, o alfinete, o traço do laço. Com `scale` em zero todos eles
            viram `Infinity`, e o React recusa o valor com um erro de console
            por propriedade: "`Infinity` is an invalid value for the `height`
            css style property".

            Esconder o plano não bastava, porque `invisible` esconde sem
            desmontar. Não renderizar é o que resolve na origem, e é honesto:
            enquanto não há medida não há cena para desenhar. Os filhos entram
            no mesmo quadro em que o plano deixa de estar invisível. */}
        <SceneScaleContext.Provider value={value}>
          {scale === 0 ? null : children}
        </SceneScaleContext.Provider>
      </div>
    </div>
  );
}
