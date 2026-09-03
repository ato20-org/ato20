"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { AlignmentGuides } from "@/components/playground/alignment-guides";
import { CameraFrame } from "@/components/playground/camera-frame";
import { MarqueeBox } from "@/components/playground/marquee-box";
import { SceneLayer } from "@/components/playground/scene-layer";
import { useSceneScale } from "@/components/playground/scene-stage";
import { SelectionBox } from "@/components/playground/selection-box";
import { TransformHandles } from "@/components/playground/transform-handles";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import {
  flipSelection,
  removeFogSelection,
  removeSelection,
} from "@/lib/operator/item-actions";
import {
  boundsFromPoints,
  boundsIntersect,
  boundsOfItems,
  boundsToBox,
  boxBounds,
  itemBounds,
  translateBounds,
  type Bounds,
} from "@/lib/geometry/bounds";
import {
  boundsCenter,
  boundsFromBox,
  rotateGroup,
  scaleGroup,
} from "@/lib/geometry/group";
import { computeSnap, SNAP_THRESHOLD_PX, type Guide } from "@/lib/geometry/snap";
import { CORNER_HANDLES, MIN_ITEM_SIZE } from "@/lib/geometry/transform";
import { isFullViewport } from "@/lib/geometry/viewport";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { CanvasItem, FogRegion, Scene } from "@/types/scene";

const NO_GUIDES: Guide[] = [];

/**
 * Camada interativa do Operador. Precisa viver dentro de `SceneStage` para ter
 * acesso ao fator de escala do palco.
 */
export function OperatorStage({ scene }: { scene: Scene }) {
  const { scale, toScene } = useSceneScale();
  const startDrag = useSceneDrag();

  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [guides, setGuides] = useState<Guide[]>(NO_GUIDES);

  const tool = useToolStore((state) => state.tool);
  const setTool = useToolStore((state) => state.setTool);

  const panMode = useViewportStore((state) => state.panMode);
  const viewport = useViewportStore((state) => state.viewport);

  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const selectedFogId = useSelectionStore((state) => state.selectedFogId);
  const select = useSelectionStore((state) => state.select);
  const toggle = useSelectionStore((state) => state.toggle);
  const selectFog = useSelectionStore((state) => state.selectFog);
  const clear = useSelectionStore((state) => state.clear);

  const updateItem = useSceneStore((state) => state.updateItem);
  const updateItems = useSceneStore((state) => state.updateItems);
  const addFog = useSceneStore((state) => state.addFog);
  const updateFog = useSceneStore((state) => state.updateFog);
  const setSceneCamera = useSceneStore((state) => state.setSceneCamera);

  const selectedItems = scene.items.filter((item) => selectedIds.includes(item.id));
  const single = selectedItems.length === 1 ? selectedItems[0] : undefined;
  const selectedFog = scene.fog.find((region) => region.id === selectedFogId);

  const groupBounds = selectedItems.length > 1 ? boundsOfItems(selectedItems) : null;

  /**
   * Retrato do grupo no início do gesto.
   *
   * O gizmo entrega a caixa nova a cada frame, sempre relativa ao começo do
   * arrasto. Aplicar isso sobre os itens já transformados comporia a escala —
   * dois segundos de arrasto multiplicariam o tamanho várias vezes.
   */
  const groupSnapshot = useRef<{ items: CanvasItem[]; bounds: Bounds } | null>(null);

  // Item travado ganha contorno em vez de alças: sem gizmo não há como
  // redimensionar ou girar por acidente, mas ele fica visivelmente selecionado.
  // Com espaço segurado vale o mesmo — a seleção continua à vista, mas nada
  // nela é agarrável, senão a alça competiria com o gesto de deslocar.
  const outlineBounds =
    // Grupo ganha gizmo próprio abaixo; aqui fica só o contorno de quem não
    // pode ser transformado.
    selectedItems.length > 1 && panMode
      ? boundsOfItems(selectedItems)
      : single && (single.locked || panMode)
        ? itemBounds(single)
        : selectedFog && panMode
          ? boxBounds(selectedFog)
          : null;

  /** Evita re-render por frame quando não há guia nenhuma para mostrar. */
  function clearGuides() {
    setGuides((previous) => (previous.length === 0 ? previous : NO_GUIDES));
  }

  /** Bounds de tudo que não está se movendo — os candidatos a linha guia. */
  function snapTargets(exclude: (id: string) => boolean): Bounds[] {
    return [
      ...scene.items.filter((item) => !exclude(item.id)).map(itemBounds),
      ...scene.fog.filter((region) => !exclude(region.id)).map(boxBounds),
    ];
  }

  /** Move uma caixa aplicando snap, e devolve a posição corrigida. */
  function dragBox(
    event: ReactPointerEvent,
    origin: Bounds,
    targets: Bounds[],
    apply: (dx: number, dy: number) => void,
  ) {
    startDrag(event, {
      onMove: (delta, native) => {
        let dx = delta.x;
        let dy = delta.y;

        // Alt desliga a atração: às vezes o mestre quer a peça exatamente onde
        // soltou, encostada mas não alinhada.
        if (native.altKey) {
          clearGuides();
        } else {
          const snap = computeSnap(
            translateBounds(origin, dx, dy),
            targets,
            SNAP_THRESHOLD_PX / scale,
          );

          dx += snap.dx;
          dy += snap.dy;
          setGuides(snap.guides);
        }

        apply(dx, dy);
      },
      onEnd: clearGuides,
    });
  }

  function handleItemPointerDown(event: ReactPointerEvent, item: CanvasItem) {
    const alreadySelected = selectedIds.includes(item.id);

    if (event.button === 2) {
      // Botão direito aponta o menu para o item clicado, mas não desfaz uma
      // seleção múltipla que já o inclua.
      if (!alreadySelected) select([item.id]);
      return;
    }

    if (event.button !== 0) return;

    if (event.shiftKey) {
      toggle(item.id);
      return;
    }

    const draggedIds = alreadySelected ? selectedIds : [item.id];
    if (!alreadySelected) select([item.id]);

    const moving = scene.items.filter(
      (candidate) => draggedIds.includes(candidate.id) && !candidate.locked,
    );
    const movingBounds = boundsOfItems(moving);
    if (!movingBounds) return;

    const origins = moving.map(({ id, x, y }) => ({ id, x, y }));

    dragBox(event, movingBounds, snapTargets((id) => draggedIds.includes(id)), (dx, dy) =>
      updateItems(
        scene.id,
        origins.map((origin) => ({
          id: origin.id,
          patch: { x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) },
        })),
      ),
    );
  }

  function handleFogPointerDown(event: ReactPointerEvent, region: FogRegion) {
    if (event.button === 2) {
      selectFog(region.id);
      return;
    }

    if (event.button !== 0) return;

    selectFog(region.id);

    const origin = { x: region.x, y: region.y };
    dragBox(event, boxBounds(region), snapTargets((id) => id === region.id), (dx, dy) =>
      updateFog(scene.id, region.id, {
        x: Math.round(origin.x + dx),
        y: Math.round(origin.y + dy),
      }),
    );
  }

  /** Arrasto no vazio: desenha área escondida (ferramenta névoa) ou marca vários. */
  function handleCanvasPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) {
      clear();
      return;
    }

    const anchor = toScene(event.clientX, event.clientY);

    if (tool === "fog") {
      startDrag(event, {
        onMove: (delta) =>
          setMarquee(
            boundsFromPoints(anchor, { x: anchor.x + delta.x, y: anchor.y + delta.y }),
          ),
        onEnd: (native) => {
          setMarquee(null);

          const area = boundsFromPoints(anchor, toScene(native.clientX, native.clientY));
          const box = boundsToBox(area);
          // Clique sem arrasto criaria uma área invisível impossível de pegar.
          if (box.width < MIN_ITEM_SIZE || box.height < MIN_ITEM_SIZE) return;

          selectFog(
            addFog(scene.id, {
              x: Math.round(box.x),
              y: Math.round(box.y),
              width: Math.round(box.width),
              height: Math.round(box.height),
            }),
          );
          // Volta ao modo normal: desenhar duas áreas seguidas é raro, e ficar
          // preso na ferramenta faz o mestre cobrir a cena por acidente.
          setTool("select");
        },
      });

      return;
    }

    const additive = event.shiftKey;
    // Retrato da seleção antes do arrasto: com Shift a área soma ao que já
    // estava marcado, sem Shift começa do zero.
    const baseIds = additive ? selectedIds : [];
    if (!additive) clear();

    startDrag(event, {
      onMove: (delta) => {
        const area = boundsFromPoints(anchor, {
          x: anchor.x + delta.x,
          y: anchor.y + delta.y,
        });
        setMarquee(area);

        const hits = scene.items
          .filter((item) => !item.locked && boundsIntersect(itemBounds(item), area))
          .map((item) => item.id);

        select([...new Set([...baseIds, ...hits])]);
      },
      onEnd: () => setMarquee(null),
    });
  }

  // Espaço tem precedência sobre a ferramenta: segurar espaço desloca a cena,
  // mesmo com a névoa escolhida.
  const drawingFog = tool === "fog" && !panMode;
  // Mão aberta só quando há para onde deslocar. No encaixe, o cursor prometeria
  // um movimento que o clamp não permite.
  const canPan = panMode && !isFullViewport(viewport);

  return (
    <>
      {/* Pointerdown que chega até aqui é clique no vazio. Os itens e as áreas
          interrompem a propagação quando estão clicáveis.

          Com espaço segurado, nenhum handler é passado adiante: quem trata o
          gesto é o listener de deslocamento do `SceneStage`, que fica num
          ancestral e dispararia junto se este também respondesse. */}
      <div
        className="absolute inset-0"
        style={{ cursor: canPan ? "grab" : drawingFog ? "crosshair" : undefined }}
        onPointerDown={panMode ? undefined : handleCanvasPointerDown}
      >
        <SceneLayer
          scene={scene}
          variant="operator"
          // Na ferramenta névoa, o arrasto sempre desenha: repassar os handlers
          // faria clicar sobre um item existente virar "mover item".
          onItemPointerDown={panMode || drawingFog ? undefined : handleItemPointerDown}
          onFogPointerDown={panMode || drawingFog ? undefined : handleFogPointerDown}
        />
      </div>

      {outlineBounds ? <SelectionBox bounds={outlineBounds} /> : null}

      {groupBounds && !panMode ? (
        <TransformHandles
          box={{ ...boundsToBox(groupBounds), rotation: 0 }}
          // Só cantos e escala uniforme: escalar um item girado de forma
          // diferente em cada eixo exigiria cisalhamento, que o modelo de item
          // não representa.
          handles={CORNER_HANDLES}
          keepAspect
          outline={false}
          onGestureStart={() => {
            groupSnapshot.current = { items: selectedItems, bounds: groupBounds };
          }}
          onChange={(patch) => {
            const frozen = groupSnapshot.current;
            if (!frozen) return;

            // Girar e escalar chegam pelo mesmo callback: `rotation` só vem no
            // gesto de rotação, e a caixa só no de redimensionamento.
            if (patch.rotation !== undefined) {
              updateItems(
                scene.id,
                rotateGroup(frozen.items, boundsCenter(frozen.bounds), patch.rotation),
              );
              return;
            }

            if (patch.x === undefined || patch.width === undefined) return;

            updateItems(
              scene.id,
              scaleGroup(
                frozen.items,
                frozen.bounds,
                boundsFromBox({
                  x: patch.x,
                  y: patch.y ?? frozen.bounds.minY,
                  width: patch.width,
                  height: patch.height ?? 0,
                }),
              ),
            );
          }}
          onDelete={removeSelection}
        />
      ) : null}

      {single && !single.locked && !panMode ? (
        <TransformHandles
          box={single}
          onChange={(patch) => updateItem(scene.id, single.id, patch)}
          onFlip={() => flipSelection("x")}
          onDelete={removeSelection}
        />
      ) : null}

      {selectedFog && !panMode ? (
        <TransformHandles
          box={{ ...selectedFog, rotation: 0 }}
          rotatable={false}
          // Sem alça de rotação, o gizmo só emite caixa — nunca `rotation`.
          onChange={({ x, y, width, height }) =>
            updateFog(scene.id, selectedFog.id, { x, y, width, height })
          }
          onDelete={removeFogSelection}
        />
      ) : null}

      {marquee ? <MarqueeBox bounds={marquee} /> : null}
      <AlignmentGuides guides={guides} />

      {scene.camera ? (
        <CameraFrame
          camera={scene.camera}
          // Com espaço segurado a moldura vira só informativa: o gesto pertence
          // ao deslocamento da cena.
          onChange={panMode ? undefined : (camera) => setSceneCamera(scene.id, camera)}
        />
      ) : null}
    </>
  );
}
