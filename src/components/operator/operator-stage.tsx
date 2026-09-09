"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { PinLayer } from "@/components/operator/pin-layer";
import { AlignmentGuides } from "@/components/playground/alignment-guides";
import { CameraFrame } from "@/components/playground/camera-frame";
import { MarqueeBox } from "@/components/playground/marquee-box";
import { PortraitAnchors } from "@/components/playground/portrait-anchors";
import { SceneLayer } from "@/components/playground/scene-layer";
import { useSceneScale } from "@/components/playground/scene-stage";
import { SelectionBox } from "@/components/playground/selection-box";
import { TransformHandles } from "@/components/playground/transform-handles";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useCharacters } from "@/hooks/use-characters";
import { usePanMode } from "@/hooks/use-pan-mode";
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
  areasDeRetrato,
  portraitBox,
  portraitFraction,
  portraitsBounds,
  retratosDaCena,
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
import { selectAbaAtiva, useLayoutStore } from "@/lib/store/use-layout-store";
import { usePinWindowStore } from "@/lib/store/use-pin-window-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type AncoraRetrato,
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
  /**
   * Abrir a nota de um ponto.
   *
   * Do store das notas, e não de um estado local aqui: quantas notas estão na
   * tela e em que ordem é assunto delas, e o palco só precisa saber pedir a
   * abertura de uma. Foi este `useState` que sobrou quando o popover
   * intermediário caiu — ele guardava "qual popover está aberto", e não existe
   * mais um.
   */
  const abrirNota = usePinWindowStore((state) => state.abrir);

  const tool = useToolStore((state) => state.tool);
  const setTool = useToolStore((state) => state.setTool);

  // Por tecla OU por ferramenta; ver `usePanMode`.
  const panMode = usePanMode();
  const abrirJanela = useAbrirJanela();
  const { personagens } = useCharacters();

  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const selectedFogId = useSelectionStore((state) => state.selectedFogId);
  const selectedPortraitIds = useSelectionStore((state) => state.selectedPortraitIds);
  const select = useSelectionStore((state) => state.select);
  const toggle = useSelectionStore((state) => state.toggle);
  const selectFog = useSelectionStore((state) => state.selectFog);
  const selectPortrait = useSelectionStore((state) => state.selectPortrait);
  const selectPortraits = useSelectionStore((state) => state.selectPortraits);
  const togglePortrait = useSelectionStore((state) => state.togglePortrait);
  const clear = useSelectionStore((state) => state.clear);

  const addItem = useSceneStore((state) => state.addItem);
  const updateItem = useSceneStore((state) => state.updateItem);
  const updateItems = useSceneStore((state) => state.updateItems);
  const addFog = useSceneStore((state) => state.addFog);
  const updateFog = useSceneStore((state) => state.updateFog);
  const addPin = useSceneStore((state) => state.addPin);
  const setSceneCamera = useSceneStore((state) => state.setSceneCamera);

  const guardados = usePortraitStore((state) => state.portraits);
  const filaAuto = usePortraitStore((state) => state.filaAuto);
  const ancorar = usePortraitStore((state) => state.ancorar);

  /**
   * Os retratos desta cena, com a imagem resolvida da ficha.
   *
   * Derivado e não a lista crua do store: retrato agora é de personagem, e quem
   * decide se ele existe nesta cena é o token dele estar nela. Ver
   * `retratosDaCena` -- o painel e o publicador usam a mesma função, cada um
   * com a sua cena.
   */
  const portraits = retratosDaCena(guardados, scene.items, personagens ?? []);
  // A aba aberta declara a intenção: em Retratos, o mestre está mexendo neles,
  // e ver todos de uma vez é o que torna o ajuste possível. Fora dela, o mapa
  // é o assunto e só o selecionado aparece.
  /**
   * Retrato só é editável no palco quando a LISTA dele está à vista.
   *
   * Era `leftTab === "retratos"`: uma aba fixa do painel esquerdo. Com o dock, a
   * lista pode estar em qualquer grupo de qualquer coluna, então a pergunta
   * deixou de ser "qual aba do painel esquerdo" e passou a ser "esta aba está
   * ativa em algum lugar". Ver `selectAbaAtiva`.
   */
  const editingPortraits = useLayoutStore(selectAbaAtiva("retratos"));
  const updatePortrait = usePortraitStore((state) => state.update);
  const updatePortraits = usePortraitStore((state) => state.updateMany);

  const selectedItems = scene.items.filter((item) => selectedIds.includes(item.id));
  const single = selectedItems.length === 1 ? selectedItems[0] : undefined;

  /**
   * De quem é o item selecionado, quando ele é um token de personagem que
   * AINDA EXISTE.
   *
   * A checagem contra o índice não é zelo: apagar o personagem não mexe nos
   * itens das cenas -- a imagem dele está no acervo, que sobrevive --, então o
   * token continua no mapa com um `personagemId` apontando para o vazio. Sem
   * isto, o botão azul seguia ali abrindo uma ficha que se fecha sozinha no
   * quadro seguinte: um clique que não faz nada.
   *
   * `null` é "ainda não leu", e nesse caso o botão aparece: esconder e mostrar
   * depois seria a fileira do gizmo mudando de tamanho na frente de quem olha.
   *
   * Fora do JSX porque `single.personagemId` dentro do callback não estreita o
   * tipo -- do ponto de vista do compilador, ele pode ter mudado entre a
   * leitura e o clique.
   */
  const personagemDoItem =
    single?.personagemId &&
    (personagens === null || personagens.some((atual) => atual.id === single.personagemId))
      ? single.personagemId
      : undefined;
  const selectedFog = scene.fog.find((region) => region.id === selectedFogId);
  const selectedPortraits = portraits.filter((portrait) =>
    selectedPortraitIds.includes(portrait.id),
  );
  const singlePortrait = selectedPortraits.length === 1 ? selectedPortraits[0] : undefined;
  /**
   * Os retratos que a fila governa, na ordem dela.
   *
   * No ar e não soltos -- os mesmos que `useFilaDeRetratos` posiciona. Fora do
   * ar não ocupa vaga, e solto tem posição própria.
   */
  const fila = filaAuto
    ? portraits.filter((retrato) => retrato.visible && !retrato.foraDaFila)
    : [];

  const naFila = (retrato: Portrait) => fila.some((atual) => atual.id === retrato.id);

  /** A seleção É a fila inteira? É o que decide o rótulo da caixa. */
  const filaSelecionada =
    fila.length > 0 &&
    fila.length === selectedPortraitIds.length &&
    fila.every((retrato) => selectedPortraitIds.includes(retrato.id));

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

  /**
   * A área sob o ponteiro enquanto a fila de retratos é arrastada.
   *
   * `null` fora do gesto, e é o que faz as seis áreas não existirem no resto do
   * tempo: são retângulos sobre o mapa, e à vista o tempo todo poluiriam a
   * imagem que a mesa está olhando.
   */
  const [areaDaFila, setAreaDaFila] = useState<AncoraRetrato | null>(null);
  const [arrastandoFila, setArrastandoFila] = useState(false);

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
    /** A que se alinhar além dos alvos. Padrão: o plano. Ver `computeSnap`. */
    frame?: Bounds,
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
            frame,
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

    // Retrato da fila não se mexe sozinho: posição e tamanho dele são da fila.
    // Arrastá-lo livremente faria a figura voltar no quadro seguinte, quando o
    // efeito reaplicasse o layout.
    //
    // Então o clique seleciona a FILA INTEIRA. É o que torna o grupo evidente
    // sem precisar de aviso: aparece a caixa pontilhada em volta dos cinco, com
    // o rótulo, e o gizmo que sobe é o do grupo -- que escala todos por um
    // fator só. Selecionar um e mexer nos outros seria o mesmo efeito com
    // aparência de defeito.
    if (naFila(portrait)) {
      selectPortraits(fila.map((atual) => atual.id));
      arrastarFila(event);
      return;
    }

    const origins = moving.map(({ id, x, y }) => ({ id, x, y }));

    const movendo = new Set(moving.map((atual) => atual.id));
    const caixa = portraitsBounds(moving, camera);

    // Alinha aos OUTROS retratos e à câmera, e não aos itens do mapa: retrato é
    // preso à câmera, e um item do mapa passa por baixo dele quando o mestre
    // desloca a cena -- grudar num alvo que anda seria pior que não grudar.
    const alvos = portraits
      .filter((atual) => !movendo.has(atual.id))
      .map((atual) => boxBounds(portraitBox(atual, camera)));

    if (!caixa) return;

    dragBox(
      event,
      caixa,
      alvos,
      (dx, dy) =>
        updatePortraits(
          origins.map((origin) => ({
            id: origin.id,
            patch: {
              // De volta para fração da câmera, que é onde o retrato mora.
              x: origin.x + dx / (camera?.width ?? SCENE_WIDTH),
              y: origin.y + dy / (camera?.height ?? SCENE_HEIGHT),
            },
          })),
        ),
      camera ? boundsFromBox(camera) : undefined,
    );
  }

  /**
   * Leva a fila de retratos para outra área.
   *
   * A fila não segue o ponteiro: as seis áreas acendem, a de baixo do cursor
   * destaca, e soltar troca a âncora. Seguir o ponteiro exigiria um layout por
   * quadro para uma escolha que tem seis respostas possíveis -- movimento a
   * mais para a mesma decisão.
   */
  function arrastarFila(event: ReactPointerEvent) {
    const areas = areasDeRetrato(scene.camera);

    const sob = (clientX: number, clientY: number) => {
      const ponto = toScene(clientX, clientY);

      return (
        areas.find(
          ({ box }) =>
            ponto.x >= box.x &&
            ponto.x <= box.x + box.width &&
            ponto.y >= box.y &&
            ponto.y <= box.y + box.height,
        )?.ancora ?? null
      );
    };

    setArrastandoFila(true);
    setAreaDaFila(sob(event.clientX, event.clientY));

    startDrag(event, {
      onMove: (_delta, native) => setAreaDaFila(sob(native.clientX, native.clientY)),
      onEnd: (native) => {
        const escolhida = sob(native.clientX, native.clientY);
        if (escolhida) ancorar(escolhida);

        setArrastandoFila(false);
        setAreaDaFila(null);
      },
    });
  }

  /** Arrasto no vazio: desenha área escondida (ferramenta névoa) ou marca vários. */
  function handleCanvasPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) {
      clear();
      return;
    }

    const anchor = toScene(event.clientX, event.clientY);

    // Clique, e não arrasto: o ponto não tem tamanho. Cravar já abre a nota,
    // porque cravar sem escrever nada deixaria na tela um alfinete numerado que
    // não diz nada — e o gesto seguinte é sempre escrever.
    if (tool === "pin") {
      abrirNota(addPin(scene.id, { x: Math.round(anchor.x), y: Math.round(anchor.y) }));
      // Volta ao modo normal, como a névoa: cravar dois pontos seguidos é
      // raro, e ficar preso na ferramenta faz o mestre semear o mapa de
      // alfinetes por acidente ao tentar mover um token.
      setTool("select");

      return;
    }

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
  /**
   * Ferramenta de mira ativa: névoa ou ponto.
   *
   * As duas precisam do mesmo bloqueio. Repassar os handlers de item enquanto
   * uma delas está escolhida faria o gesto sobre um token virar "mover token"
   * em vez de cobrir a região ou cravar o alfinete ali.
   */
  const aiming = drawingFog || (tool === "pin" && !panMode);
  // Mão aberta sempre que o espaço estiver segurado.
  //
  // Antes era `panMode && !isFullViewport(viewport)`, porque no encaixe o clamp
  // não deixava deslocar nada e o cursor prometeria um movimento que não
  // aconteceria. Com a folga além das bordas do plano (ver `FOLGA_X`) há para
  // onde ir em qualquer ampliação, inclusive no encaixe — e a condição antiga
  // passou a mentir ao contrário, escondendo a mão num gesto que funciona.
  const canPan = panMode;

  return (
    <>
      {/* Pointerdown que chega até aqui é clique no vazio. Os itens e as áreas
          interrompem a propagação quando estão clicáveis.

          Com espaço segurado, nenhum handler é passado adiante: quem trata o
          gesto é o listener de deslocamento do `SceneStage`, que fica num
          ancestral e dispararia junto se este também respondesse. */}
      <div
        className="absolute inset-0"
        style={{ cursor: canPan ? "grab" : aiming ? "crosshair" : undefined }}
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
          // Com ferramenta de mira escolhida, o gesto sempre vale para ela:
          // repassar os handlers faria clicar sobre um item existente virar
          // "mover item".
          onItemPointerDown={panMode || aiming ? undefined : onItemPointerDown}
          onFogPointerDown={panMode || aiming ? undefined : onFogPointerDown}
          onPortraitPointerDown={panMode || aiming ? undefined : onPortraitPointerDown}
        />
      </div>

      {/* Irmão do `SceneLayer`, e de propósito FORA dele: o `SceneLayer` é o
          mesmo componente do Assistir e da Plateia, e um ponto de anotação
          desenhado lá apareceria na TV virada para a mesa. */}
      <PinLayer scene={scene} panMode={panMode} />

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
          // Azul quando é token: numa cena com mobília, mapa e quatro tokens,
          // saber que a caixa em volta é de uma PESSOA muda o que o mestre vai
          // fazer com ela.
          tom={personagemDoItem ? "personagem" : "default"}
          onChange={(patch) => updateItem(scene.id, single.id, patch)}
          onFlip={() => flipSelection("x")}
          // Token abre a ficha de quem ele é. É o atalho que faltava no meio da
          // sessão: o mestre clica na figura no mapa, e não na lista de
          // personagens, porque no mapa é onde a mão dele já está.
          onOpenSheet={
            personagemDoItem
              ? () => abrirJanela({ tipo: "personagem", personagemId: personagemDoItem })
              : undefined
          }
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

            const escalados = scalePortraitGroup(
              frozen.portraits,
              frozen.bounds,
              boundsFromBox({
                x: patch.x,
                y: patch.y ?? frozen.bounds.minY,
                width: patch.width,
                height: patch.height ?? 0,
              }),
              scene.camera,
            );

            // Sendo a fila, o gizmo só manda no TAMANHO: a posição é dela, e
            // deixar os dois escreverem no mesmo quadro faz o retrato pular --
            // o gizmo o põe onde a escala calculou, e o efeito o traz de volta
            // para a fila no quadro seguinte.
            updatePortraits(
              filaSelecionada
                ? escalados.map(({ id, patch: mudanca }) => ({
                    id,
                    patch: { width: mudanca.width, height: mudanca.height },
                  }))
                : escalados,
            );
          }}
          onDelete={removePortraitSelection}
        />
      ) : null}

      {/* A caixa do grupo de retratos, que o gizmo dele não desenha -- ele só
          põe as alças nos cantos. Sem ela, mexer em cinco rostos de uma vez não
          tinha nenhum sinal na tela de que cinco estavam em jogo. */}
      {portraitGroupBounds && !panMode ? (
        <SelectionBox
          bounds={portraitGroupBounds}
          rotulo={
            filaSelecionada
              ? `fila · ${fila.length}`
              : `${selectedPortraitIds.length} retratos`
          }
        />
      ) : null}

      {arrastandoFila ? (
        <PortraitAnchors camera={scene.camera} alvo={areaDaFila} />
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
