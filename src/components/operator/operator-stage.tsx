"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

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
  removePortraitSelection,
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
import {
  portraitBox,
  portraitFraction,
  portraitsBounds,
  scalePortraitGroup,
} from "@/lib/geometry/portrait";
import { computeSnap, SNAP_THRESHOLD_PX, type Guide } from "@/lib/geometry/snap";
import {
  boxAround,
  CORNER_HANDLES,
  fitInitialSize,
  MIN_ITEM_SIZE,
} from "@/lib/geometry/transform";
import { hasAssetDrag, readAssetDrag } from "@/lib/operator/asset-drag";
import { isFullViewport } from "@/lib/geometry/viewport";
import { usePanelsStore } from "@/lib/store/use-panels-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type FogRegion,
  type Portrait,
  type Scene,
} from "@/types/scene";

const NO_GUIDES: Guide[] = [];

/** Usado quando a medida do arquivo não veio — arquivo antigo ou corrompido. */
const FALLBACK_DROP_SIZE = { x: 480, y: 270 };

/**
 * Camada interativa do Operador. Precisa viver dentro de `SceneStage` para ter
 * acesso ao fator de escala do palco.
 */
export function OperatorStage({ scene }: { scene: Scene }) {
  const { scale, toScene } = useSceneScale();
  const startDrag = useSceneDrag();

  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [guides, setGuides] = useState<Guide[]>(NO_GUIDES);
  /** Imagem do acervo pairando sobre o palco. */
  const [receiving, setReceiving] = useState(false);

  const tool = useToolStore((state) => state.tool);
  const setTool = useToolStore((state) => state.setTool);

  const panMode = useViewportStore((state) => state.panMode);
  const viewport = useViewportStore((state) => state.viewport);

  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const selectedFogId = useSelectionStore((state) => state.selectedFogId);
  const selectedPortraitIds = useSelectionStore((state) => state.selectedPortraitIds);
  const select = useSelectionStore((state) => state.select);
  const toggle = useSelectionStore((state) => state.toggle);
  const selectFog = useSelectionStore((state) => state.selectFog);
  const selectPortrait = useSelectionStore((state) => state.selectPortrait);
  const togglePortrait = useSelectionStore((state) => state.togglePortrait);
  const clear = useSelectionStore((state) => state.clear);

  const addItem = useSceneStore((state) => state.addItem);
  const updateItem = useSceneStore((state) => state.updateItem);
  const updateItems = useSceneStore((state) => state.updateItems);
  const addFog = useSceneStore((state) => state.addFog);
  const updateFog = useSceneStore((state) => state.updateFog);
  const setSceneCamera = useSceneStore((state) => state.setSceneCamera);

  const portraits = usePortraitStore((state) => state.portraits);
  // A aba aberta declara a intenção: em Retratos, o mestre está mexendo neles,
  // e ver todos de uma vez é o que torna o ajuste possível. Fora dela, o mapa
  // é o assunto e só o selecionado aparece.
  const editingPortraits = usePanelsStore((state) => state.leftTab === "retratos");
  const updatePortrait = usePortraitStore((state) => state.update);
  const updatePortraits = usePortraitStore((state) => state.updateMany);

  const selectedItems = scene.items.filter((item) => selectedIds.includes(item.id));
  const single = selectedItems.length === 1 ? selectedItems[0] : undefined;
  const selectedFog = scene.fog.find((region) => region.id === selectedFogId);
  const selectedPortraits = portraits.filter((portrait) =>
    selectedPortraitIds.includes(portrait.id),
  );
  const singlePortrait = selectedPortraits.length === 1 ? selectedPortraits[0] : undefined;
  const portraitGroupBounds =
    selectedPortraits.length > 1 ? portraitsBounds(selectedPortraits, scene.camera) : null;

  /**
   * Retrato do grupo no início do gesto.
   *
   * Mesmo motivo do grupo de itens: o gizmo entrega a caixa nova sempre
   * relativa ao começo do arrasto, e aplicá-la sobre retratos já escalados
   * comporia o fator.
   */
  const portraitSnapshot = useRef<{ portraits: Portrait[]; bounds: Bounds } | null>(null);

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

  /**
   * Arrasto de retrato.
   *
   * O gesto acontece em coordenadas de cena, mas o retrato é guardado em
   * fração da câmera: o delta é dividido pelo tamanho do recorte antes de
   * entrar. Sem snap de propósito — retrato não se alinha a token de mapa, e
   * as guias só poluiriam o gesto.
   */
  function handlePortraitPointerDown(event: ReactPointerEvent, portrait: Portrait) {
    const alreadySelected = selectedPortraitIds.includes(portrait.id);

    if (event.button === 2) {
      // Botão direito aponta para o retrato clicado, mas não desfaz uma
      // seleção múltipla que já o inclua.
      if (!alreadySelected) selectPortrait(portrait.id);
      return;
    }

    if (event.button !== 0) return;

    if (event.shiftKey) {
      togglePortrait(portrait.id);
      return;
    }

    // Arrastar um do grupo move o grupo: quem selecionou vários quer mexer nos
    // vários, e reduzir para um seria desfazer o trabalho de selecionar.
    const moving = alreadySelected ? selectedPortraits : [portrait];
    if (!alreadySelected) selectPortrait(portrait.id);

    const camera = scene.camera;
    const origins = moving.map(({ id, x, y }) => ({ id, x, y }));

    startDrag(event, {
      onMove: (delta) =>
        updatePortraits(
          origins.map((origin) => ({
            id: origin.id,
            patch: {
              x: origin.x + delta.x / (camera?.width ?? SCENE_WIDTH),
              y: origin.y + delta.y / (camera?.height ?? SCENE_HEIGHT),
            },
          })),
        ),
    });
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

  /**
   * Envelope estável dos handlers de ponteiro.
   *
   * Os de dentro fecham sobre seleção, ferramenta e cena, então nascem
   * diferentes a cada render — e passá-los direto anularia o `memo` do
   * `CanvasItemView`, fazendo os quarenta itens do mapa re-renderizarem a cada
   * frame de um arrasto que move um. O envelope não muda; a ref é atualizada
   * em efeito, que é o que mantém os handlers sempre atuais.
   */
  const handlersRef = useRef({
    item: handleItemPointerDown,
    fog: handleFogPointerDown,
    portrait: handlePortraitPointerDown,
  });

  useEffect(() => {
    handlersRef.current = {
      item: handleItemPointerDown,
      fog: handleFogPointerDown,
      portrait: handlePortraitPointerDown,
    };
  });

  const onItemPointerDown = useCallback((event: ReactPointerEvent, item: CanvasItem) => {
    handlersRef.current.item(event, item);
  }, []);

  const onFogPointerDown = useCallback((event: ReactPointerEvent, region: FogRegion) => {
    handlersRef.current.fog(event, region);
  }, []);

  const onPortraitPointerDown = useCallback((event: ReactPointerEvent, portrait: Portrait) => {
    handlersRef.current.portrait(event, portrait);
  }, []);

  /**
   * Insere a imagem do acervo onde ela foi solta.
   *
   * Centrada no cursor, e não no plano como faz o `+` do acervo: o ponto do
   * gesto é a informação que o arrasto carrega, e ignorá-lo obrigaria a
   * reposicionar tudo à mão depois de cada inserção.
   */
  function handleDrop(event: ReactDragEvent) {
    const payload = readAssetDrag(event.dataTransfer);
    setReceiving(false);
    if (!payload) return;

    // Solto sobre o palco é para o palco: sem isto o navegador trataria o
    // arrasto como navegação.
    event.preventDefault();

    const size =
      payload.naturalWidth && payload.naturalHeight
        ? fitInitialSize(payload.naturalWidth, payload.naturalHeight)
        : FALLBACK_DROP_SIZE;

    const center = toScene(event.clientX, event.clientY);

    // Já selecionado: o gesto seguinte é quase sempre ajustar o que acabou de
    // entrar, e sem seleção seria preciso clicar na imagem antes.
    select([addItem(scene.id, { assetId: payload.assetId, ...boxAround(center, size.x, size.y) })]);
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
        // `dragover` precisa de `preventDefault` a cada evento, senão o
        // navegador recusa o drop e mostra o cursor de proibido.
        onDragOver={(event) => {
          if (!hasAssetDrag(event.dataTransfer)) return;

          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setReceiving(true);
        }}
        // `dragleave` dispara também ao cruzar para um filho; comparar o alvo
        // com o próprio nó evita o contorno piscando durante o percurso.
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setReceiving(false);
        }}
        onDrop={handleDrop}
      >
        <SceneLayer
          scene={scene}
          variant="operator"
          // Todos enquanto a aba Retratos está aberta; fora dela, só o
          // selecionado. Desenhar todos sempre punha cabeça flutuando sobre a
          // moldura da câmera justamente enquanto o mestre monta o mapa.
          portraits={
            editingPortraits ? portraits : selectedPortraits.length > 0 ? selectedPortraits : undefined
          }
          // Na ferramenta névoa, o arrasto sempre desenha: repassar os handlers
          // faria clicar sobre um item existente virar "mover item".
          onItemPointerDown={panMode || drawingFog ? undefined : onItemPointerDown}
          onFogPointerDown={panMode || drawingFog ? undefined : onFogPointerDown}
          onPortraitPointerDown={panMode || drawingFog ? undefined : onPortraitPointerDown}
        />
      </div>

      {/* Contorno enquanto a imagem paira: promete que soltar ali funciona, e
          é o que diferencia o palco do resto da janela durante o arrasto. */}
      {receiving ? (
        <div className="ring-primary/70 pointer-events-none absolute inset-0 ring-2 ring-inset" />
      ) : null}

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

      {/* Proporção travada: item de cena é sempre imagem, e esticar um eixo só
          deforma o desenho. Só cantos, pelo mesmo motivo — alça de aresta move
          um eixo, e travar a razão nela faria o item crescer sem o mouse pedir. */}
      {single && !single.locked && !panMode ? (
        <TransformHandles
          box={single}
          handles={CORNER_HANDLES}
          keepAspect
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

      {/* Proporção travada: retrato deformado fica grotesco, e a caixa aqui
          não é a proporção do arquivo — o `object-contain` já cuida disso —,
          mas manter a razão evita o mestre criar uma faixa sem querer. */}
      {singlePortrait && !panMode ? (
        <TransformHandles
          box={{ ...portraitBox(singlePortrait, scene.camera), rotation: 0 }}
          rotatable={false}
          handles={CORNER_HANDLES}
          keepAspect
          onChange={(patch) => {
            const current = portraitBox(singlePortrait, scene.camera);

            updatePortrait(
              singlePortrait.id,
              portraitFraction(
                {
                  x: patch.x ?? current.x,
                  y: patch.y ?? current.y,
                  width: patch.width ?? current.width,
                  height: patch.height ?? current.height,
                },
                scene.camera,
              ),
            );
          }}
          onFlip={() => updatePortrait(singlePortrait.id, { flipX: !singlePortrait.flipX })}
          // Mesma ação do atalho e do menu: implementações separadas divergem
          // no primeiro ajuste.
          onDelete={removePortraitSelection}
        />
      ) : null}

      {/* Grupo de retratos: um fator só para todos, tirado da largura. É o que
          mantém os rostos coerentes entre si — escalar cada um à mão sempre
          termina com um NPC maior que o outro sem motivo. */}
      {portraitGroupBounds && !panMode ? (
        <TransformHandles
          box={{ ...boundsToBox(portraitGroupBounds), rotation: 0 }}
          rotatable={false}
          handles={CORNER_HANDLES}
          keepAspect
          outline={false}
          onGestureStart={() => {
            portraitSnapshot.current = {
              portraits: selectedPortraits,
              bounds: portraitGroupBounds,
            };
          }}
          onChange={(patch) => {
            const frozen = portraitSnapshot.current;
            if (!frozen || patch.x === undefined || patch.width === undefined) return;

            updatePortraits(
              scalePortraitGroup(
                frozen.portraits,
                frozen.bounds,
                boundsFromBox({
                  x: patch.x,
                  y: patch.y ?? frozen.bounds.minY,
                  width: patch.width,
                  height: patch.height ?? 0,
                }),
                scene.camera,
              ),
            );
          }}
          onDelete={removePortraitSelection}
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
