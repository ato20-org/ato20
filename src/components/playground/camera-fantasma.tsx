"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { CircleDot, Crosshair } from "lucide-react";

import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { TransformHandles } from "@/components/playground/transform-handles";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { CORNER_HANDLES } from "@/lib/geometry/transform";
import { clampViewport } from "@/lib/geometry/viewport";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { CameraSalva, Scene, Viewport } from "@/types/scene";

/** Abaixo da moldura da câmera no ar: a que está no ar é a que manda. */
const FANTASMA_Z = 11_800;
const ALCAS_Z = 11_900;

const BORDA_PX = 1.5;
const GRIP_PX = 12;
/** Menos que isto entre o aperto e a soltura é clique, não arrasto. */
const CLIQUE_PX = 4;

type CamerasFantasmaProps = {
  scene: Scene;
  /** A câmera selecionada: essa a moldura de verdade já desenha. */
  selecionadaId: string | null;
  /** Ausente = só olhar. Com espaço segurado o gesto é do palco. */
  editavel: boolean;
};

/**
 * As outras câmeras desenhadas no palco do mestre, apagadas, todas de uma vez.
 *
 * Sem isto o mestre só via a câmera selecionada. Aqui ele vê onde cada uma
 * está, arrasta e redimensiona qualquer uma, e um clique a seleciona -- sem
 * nada disso chegar à TV. A que está NO AR leva o REC no rótulo, para o
 * mestre saber qual delas a mesa vê enquanto edita outra.
 *
 * A que segue tokens não arrasta: mover uma câmera que segue seria brigar
 * com o que ela segue. Redimensionar pode: a ampliação é dela.
 *
 * NUNCA chega à mesa: `Scene.cameras` sai em `sceneForTable`, e este
 * componente é montado só pelo `MestreStage`.
 */
export function CamerasFantasma({
  scene,
  selecionadaId,
  editavel,
}: CamerasFantasmaProps) {
  const cameras = scene.cameras ?? [];

  return (
    <>
      {cameras.map((camera, index) =>
        camera.id === selecionadaId ? null : (
          <Fantasma
            key={camera.id}
            scene={scene}
            camera={camera}
            posicao={index + 1}
            transmitindo={scene.cameraNoArId === camera.id}
            editavel={editavel}
          />
        ),
      )}
    </>
  );
}

type FantasmaProps = {
  scene: Scene;
  camera: CameraSalva;
  posicao: number;
  transmitindo: boolean;
  editavel: boolean;
};

function Fantasma({
  scene,
  camera,
  posicao,
  transmitindo,
  editavel,
}: FantasmaProps) {
  const { scale } = useSceneScale();
  const startDrag = useSceneDrag();
  const atualizarCamera = useSceneStore((state) => state.atualizarCamera);
  const selecionar = useCameraLockStore((state) => state.selecionar);
  const conteudo = useViewportStore((state) => state.conteudo);

  const px = (value: number) => value / scale;
  const segue = (camera.alvoIds?.length ?? 0) > 0;
  // O recorte guardado já é onde ela está: quem segue tokens é mantido lá
  // pelo seguidor a cada movimento. Ver `useCameraLockStore`.
  const caixa = camera.viewport;

  function gravar(viewport: Viewport) {
    atualizarCamera(scene.id, camera.id, {
      viewport: clampViewport(viewport, conteudo),
    });
  }

  /**
   * Um gesto, dois sentidos: soltar sem andar SELECIONA a câmera; andar move
   * a câmera, sem selecionar. A distância decide, e não o tempo: um clique
   * lento ainda é clique. Nada aqui transmite.
   */
  function pegar(event: ReactPointerEvent) {
    if (!editavel) return;

    const origem = { x: camera.viewport.x, y: camera.viewport.y };
    let andou = false;

    startDrag(event, {
      onMove: (delta) => {
        if (!andou && Math.hypot(delta.x, delta.y) * scale < CLIQUE_PX) return;
        andou = true;

        // A que segue não anda: quem manda na posição dela são os tokens.
        if (segue) return;

        gravar({ ...camera.viewport, x: origem.x + delta.x, y: origem.y + delta.y });
      },
      onEnd: () => {
        if (!andou) selecionar(camera.id);
      },
    });
  }

  const gripClass = editavel
    ? "pointer-events-auto absolute touch-none"
    : "pointer-events-none absolute";
  const cursor = editavel ? (segue ? "pointer" : "move") : undefined;

  return (
    <>
      <div
        className={`${transmitindo ? "border-red-400/70" : "border-foreground/45"} pointer-events-none absolute border-dashed`}
        style={{
          left: caixa.x,
          top: caixa.y,
          width: caixa.width,
          height: caixa.height,
          borderWidth: px(BORDA_PX),
          zIndex: FANTASMA_Z,
        }}
      >
        {editavel
          ? (
              [
                // Tamanho FIXO com a ampliação desfeita por `transform`, e a
                // origem na borda em que a faixa encosta. Era `px(GRIP_PX)`,
                // que divide pelo `scale` -- e o `scale` muda a cada notch da
                // roda, então cada faixa reescrevia caixa e marcava o
                // DOCUMENTO INTEIRO para refazer o layout. A medida está em
                // `scripts/perf/README.md`.
                {
                  left: 0,
                  top: 0,
                  width: "100%",
                  height: GRIP_PX,
                  transformOrigin: "0 0",
                  transform: `scaleY(${1 / scale})`,
                },
                {
                  left: 0,
                  bottom: 0,
                  width: "100%",
                  height: GRIP_PX,
                  transformOrigin: "0 100%",
                  transform: `scaleY(${1 / scale})`,
                },
                {
                  left: 0,
                  top: 0,
                  width: GRIP_PX,
                  height: "100%",
                  transformOrigin: "0 0",
                  transform: `scaleX(${1 / scale})`,
                },
                {
                  right: 0,
                  top: 0,
                  width: GRIP_PX,
                  height: "100%",
                  transformOrigin: "100% 0",
                  transform: `scaleX(${1 / scale})`,
                },
              ] as const
            ).map((position, index) => (
              <span
                key={index}
                className={gripClass}
                style={{ ...position, cursor }}
                onPointerDown={pegar}
              />
            ))
          : null}

        <span
          className={`bg-background/85 text-foreground/80 flex items-center border font-medium tabular-nums ${gripClass}`}
          // Conteúdo em pixel de tela, pela mesma razão do rótulo da moldura:
          // o traço dos ícones engorda sob `zoom` quando é sub-pixel.
          style={{
            left: 0,
            top: 0,
            fontSize: 12,
            gap: 5,
            padding: "2px 6px",
            borderWidth: 1,
            cursor,
            ...emPixelDeTela(scale),
          }}
          title={
            editavel
              ? `Clique seleciona (Shift+${posicao}). ${segue ? "Segue tokens." : "Arraste move."}`
              : undefined
          }
          onPointerDown={pegar}
        >
          <span className="opacity-60">{posicao}</span>
          {transmitindo ? (
            <CircleDot className="text-red-400" style={{ width: 11, height: 11 }} />
          ) : null}
          {camera.nome}
          {segue ? (
            <Crosshair style={{ width: 11, height: 11 }} />
          ) : null}
        </span>
      </div>

      {editavel ? (
        <TransformHandles
          box={{ ...caixa, rotation: 0 }}
          rotatable={false}
          handles={CORNER_HANDLES}
          keepAspect
          outline={false}
          round={false}
          zIndex={ALCAS_Z}
          onChange={({ x, y, width, height }) =>
            gravar({
              x: x ?? caixa.x,
              y: y ?? caixa.y,
              width: width ?? caixa.width,
              height: height ?? caixa.height,
            })
          }
        />
      ) : null}
    </>
  );
}
