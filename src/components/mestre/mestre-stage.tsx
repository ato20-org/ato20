"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { DadoLayer } from "@/components/mestre/dado-layer";
import { PinLayer } from "@/components/mestre/pin-layer";
import { PostitFantasma } from "@/components/mestre/postit-fantasma";
import { PostitLayer } from "@/components/mestre/postit-layer";
import { LigacaoLayer } from "@/components/mestre/ligacao-layer";
import { TextoLayer } from "@/components/mestre/texto-layer";
import { ligavelEm } from "@/lib/mestre/ligacoes";
import { postitNaArea } from "@/lib/geometry/postit";
import { medidorVazio, moverMedidor } from "@/lib/geometry/medidor";
import type { PontaDoMedidor } from "@/components/playground/medidor-layer";
import { AlignmentGuides } from "@/components/playground/alignment-guides";
import { CameraFrame } from "@/components/playground/camera-frame";
import { CamerasFantasma } from "@/components/playground/camera-fantasma";
import { MarqueeBox } from "@/components/playground/marquee-box";
import { PortraitAnchors } from "@/components/playground/portrait-anchors";
import { SceneLayer } from "@/components/playground/scene-layer";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import { useSceneScale } from "@/components/playground/scene-stage";
import { SelectionBox } from "@/components/playground/selection-box";
import { TransformHandles } from "@/components/playground/transform-handles";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useCharacters } from "@/hooks/use-characters";
import { useModoCinegrafista } from "@/hooks/use-modo-cinegrafista";
import { usePanMode } from "@/hooks/use-pan-mode";
import { gravarCameraManual } from "@/lib/mestre/camera-actions";
import {
  alvoDoClique,
  escalarPatches,
  girarPatches,
  guardarNoHandout,
  PASSO_DE_GIRO,
  PASSO_DE_TAMANHO,
} from "@/lib/mestre/item-actions";
import { naBoca, useHandoutStore } from "@/lib/store/use-handout-store";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import {
  flipSelection,
  removeFogSelection,
  removePortraitSelection,
  removeSelection,
  setSelectionOpacity,
} from "@/lib/mestre/item-actions";
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
import { CamadasDeExtensoes } from "@/components/mestre/camadas-de-extensoes";
import { ArquivoFantasma } from "@/components/mestre/arquivo-fantasma";
import { TokenFantasma } from "@/components/mestre/token-fantasma";
import { useFontesDeRetrato } from "@/hooks/use-fontes-de-retrato";
import { chaveContribuicao } from "@/lib/extensoes/manifesto";
import { useContribuicoesStore } from "@/lib/store/use-contribuicoes-store";
import {
  areasDeRetrato,
  portraitBox,
  portraitFraction,
  portraitsBounds,
  retratosDaCena,
  scalePortraitGroup,
} from "@/lib/geometry/portrait";
import {
  computeSnap,
  SNAP_THRESHOLD_PX,
  type Guide,
} from "@/lib/geometry/snap";
import { CORNER_HANDLES, MIN_ITEM_SIZE } from "@/lib/geometry/transform";

import { selectAbaAtiva, useLayoutStore } from "@/lib/store/use-layout-store";
import { usePinWindowStore } from "@/lib/store/use-pin-window-store";
import { usePostitStore } from "@/lib/store/use-postit-store";
import { useQuadroStore } from "@/lib/store/use-quadro-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { ferramentaDeExtensao, useToolStore } from "@/lib/store/use-tool-store";
import {
  POSTIT_ALTURA,
  POSTIT_LARGURA,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  TEXTO_TAMANHO,
  type AncoraRetrato,
  type CanvasItem,
  type FogRegion,
  type Medidor,
  type Portrait,
  type Scene,
  type Traco,
} from "@/types/scene";

const NO_GUIDES: Guide[] = [];

/** Identidade estável: um `Set` novo por render reiniciaria a memo da camada. */
const NADA_APAGANDO: ReadonlySet<string> = new Set<string>();

/**
 * Distância mínima entre duas amostras de um risco, em pixels de TELA.
 *
 * Em pixel de tela e não de cena: riscar ampliado guarda mais detalhe, que é o
 * que se quer quando se amplia justamente para marcar algo pequeno.
 */
const AMOSTRA_PX = 3;

/**
 * Folga da borracha além da própria espessura, em pixels de tela.
 *
 * Existe porque acertar um fio de três unidades com o ponteiro exigiria
 * pontaria, e apagar é gesto de correção -- quem apaga já errou uma vez.
 */
const ALCANCE_BORRACHA_PX = 6;

/**
 * A borracha alcançou este risco?
 *
 * Testa a distância do ponto a cada SEGMENTO, e não aos vértices: com risco
 * grosso e amostras espaçadas, testar só os vértices deixaria passar a borracha
 * pelo meio de um segmento longo sem apagar nada.
 */
function tracoAlcancado(
  traco: Traco,
  ponto: { x: number; y: number },
  alcance: number,
): boolean {
  const { pontos } = traco;

  for (let i = 0; i + 3 < pontos.length; i += 2) {
    if (
      distanciaAoSegmento(
        ponto,
        { x: pontos[i]!, y: pontos[i + 1]! },
        { x: pontos[i + 2]!, y: pontos[i + 3]! },
      ) <= alcance
    ) {
      return true;
    }
  }

  return false;
}

/** Distância de um ponto ao segmento `a`-`b`. */
function distanciaAoSegmento(
  ponto: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comprimento = dx * dx + dy * dy;

  // Segmento de comprimento zero é um ponto: acontece quando duas amostras
  // caem no mesmo lugar arredondado.
  if (comprimento === 0) return Math.hypot(ponto.x - a.x, ponto.y - a.y);

  // Onde no segmento cai a projeção do ponto, limitado às pontas.
  const t = Math.max(
    0,
    Math.min(1, ((ponto.x - a.x) * dx + (ponto.y - a.y) * dy) / comprimento),
  );

  return Math.hypot(ponto.x - (a.x + t * dx), ponto.y - (a.y + t * dy));
}

/**
 * Camada interativa do Mestre. Precisa viver dentro de `SceneStage` para ter
 * acesso ao fator de escala do palco.
 */
export function MestreStage({ scene }: { scene: Scene }) {
  const { scale, toScene } = useSceneScale();
  const startDrag = useSceneDrag();

  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [guides, setGuides] = useState<Guide[]>(NO_GUIDES);
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
  const cor = useToolStore((state) => state.cor);
  const espessura = useToolStore((state) => state.espessura);
  const corPostit = useToolStore((state) => state.corPostit);
  const formaMedidor = useToolStore((state) => state.formaMedidor);
  const corMedidor = useToolStore((state) => state.corMedidor);
  const setTool = useToolStore((state) => state.setTool);

  const editarPostit = usePostitStore((state) => state.editar);

  // Por tecla OU por ferramenta; ver `usePanMode`.
  const panMode = usePanMode();
  const abrirJanela = useAbrirJanela();
  const { personagens } = useCharacters();

  /**
   * Os dados que os jogadores jogaram, para pendurar nos retratos.
   *
   * A bandeja, e não o histórico: é o que está NA MESA agora, e é a mesma
   * lista que a fileira do canto desenha e que o quadro publicado leva para a
   * TV e para os celulares. Ver `useRolagensStore`.
   */
  const bandeja = useRolagensStore((state) => state.bandeja);

  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const selectedFogId = useSelectionStore((state) => state.selectedFogId);
  const selectedPortraitIds = useSelectionStore(
    (state) => state.selectedPortraitIds,
  );
  const select = useSelectionStore((state) => state.select);
  const toggle = useSelectionStore((state) => state.toggle);
  const selectFog = useSelectionStore((state) => state.selectFog);
  const selectedMedidorId = useSelectionStore(
    (state) => state.selectedMedidorId,
  );
  const selectMedidor = useSelectionStore((state) => state.selectMedidor);
  const selectPortrait = useSelectionStore((state) => state.selectPortrait);
  const selectPortraits = useSelectionStore((state) => state.selectPortraits);
  const togglePortrait = useSelectionStore((state) => state.togglePortrait);
  const clear = useSelectionStore((state) => state.clear);

  const updateItem = useSceneStore((state) => state.updateItem);
  const updateItems = useSceneStore((state) => state.updateItems);
  const addFog = useSceneStore((state) => state.addFog);
  const addMedidor = useSceneStore((state) => state.addMedidor);
  const updateMedidor = useSceneStore((state) => state.updateMedidor);
  const removeMedidores = useSceneStore((state) => state.removeMedidores);
  const updateFog = useSceneStore((state) => state.updateFog);
  const addTraco = useSceneStore((state) => state.addTraco);
  const removeTracos = useSceneStore((state) => state.removeTracos);
  const addPin = useSceneStore((state) => state.addPin);
  const addPostit = useSceneStore((state) => state.addPostit);
  const addTexto = useSceneStore((state) => state.addTexto);
  const addLigacao = useSceneStore((state) => state.addLigacao);

  // A seta em andamento e a seleção de texto/seta são desta cena: trocar de
  // cena ou largar a ferramenta de seta desfaz a primeira ponta clicada.
  const limparQuadro = useQuadroStore((state) => state.limpar);
  const setOrigem = useQuadroStore((state) => state.setOrigem);
  useEffect(() => {
    limparQuadro();
  }, [scene.id, limparQuadro]);
  useEffect(() => {
    if (tool !== "ligacao") setOrigem(null);
  }, [tool, setOrigem]);
  // A câmera que o mestre está editando. Ver `useCameraLockStore`.
  const selecionadaId = useCameraLockStore((state) => state.selecionadaId);
  const espelhoMestre = useCameraLockStore((state) => state.espelhoMestre);
  const fantasmasVisiveis = useCameraLockStore(
    (state) => state.fantasmasVisiveis,
  );
  const garantirCameraInicial = useCameraLockStore(
    (state) => state.garantirCameraInicial,
  );
  const selecionada = scene.cameras?.find(
    (camera) => camera.id === selecionadaId,
  );

  // Cena nova começa sem câmera; a selecionada, se houver, tem de existir nela.
  // Efeito e não render: cria câmera no store, e isso é escrita.
  useEffect(() => {
    garantirCameraInicial(scene);
  }, [scene, garantirCameraInicial]);

  // V segurado: a selecionada segue o mouse. Ver `useModoCinegrafista`.
  const cinegrafista = useModoCinegrafista({
    camera: selecionada?.viewport,
    ativo: !panMode,
    onChange: (viewport) => {
      if (selecionada) gravarCameraManual(selecionada.id, viewport);
    },
  });

  const guardados = usePortraitStore((state) => state.portraits);
  const filaAuto = usePortraitStore((state) => state.filaAuto);
  const ancorar = usePortraitStore((state) => state.ancorar);

  // As fontes das extensões, para o retrato ao vivo saber em que canvas a
  // página foi desenhada. Ver `useFontesDeRetrato`.
  const fontes = useFontesDeRetrato();

  /**
   * Os retratos desta cena, com a imagem resolvida da ficha.
   *
   * Derivado e não a lista crua do store: retrato agora é de personagem, e quem
   * decide se ele existe nesta cena é o token dele estar nela. Ver
   * `retratosDaCena` -- o painel e o publicador usam a mesma função, cada um
   * com a sua cena.
   */
  const portraits = retratosDaCena(
    guardados,
    scene.items,
    personagens ?? [],
    fontes,
  );
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

  const selectedItems = scene.items.filter((item) =>
    selectedIds.includes(item.id),
  );
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
    (personagens === null ||
      personagens.some((atual) => atual.id === single.personagemId))
      ? single.personagemId
      : undefined;
  const selectedFog = scene.fog.find((region) => region.id === selectedFogId);
  const selectedPortraits = portraits.filter((portrait) =>
    selectedPortraitIds.includes(portrait.id),
  );
  const singlePortrait =
    selectedPortraits.length === 1 ? selectedPortraits[0] : undefined;
  /**
   * Os retratos que a fila governa, na ordem dela.
   *
   * No ar e não soltos -- os mesmos que `useFilaDeRetratos` posiciona. Fora do
   * ar não ocupa vaga, e solto tem posição própria.
   */
  const fila = filaAuto
    ? portraits.filter((retrato) => retrato.visible && !retrato.foraDaFila)
    : [];

  const naFila = (retrato: Portrait) =>
    fila.some((atual) => atual.id === retrato.id);

  /** A seleção É a fila inteira? É o que decide o rótulo da caixa. */
  const filaSelecionada =
    fila.length > 0 &&
    fila.length === selectedPortraitIds.length &&
    fila.every((retrato) => selectedPortraitIds.includes(retrato.id));

  const portraitGroupBounds =
    selectedPortraits.length > 1
      ? portraitsBounds(selectedPortraits, scene.camera)
      : null;

  /**
   * Retrato do grupo no início do gesto.
   *
   * Mesmo motivo do grupo de itens: o gizmo entrega a caixa nova sempre
   * relativa ao começo do arrasto, e aplicá-la sobre retratos já escalados
   * comporia o fator.
   */
  const portraitSnapshot = useRef<{
    portraits: Portrait[];
    bounds: Bounds;
  } | null>(null);

  const groupBounds =
    selectedItems.length > 1 ? boundsOfItems(selectedItems) : null;

  /**
   * Retrato do grupo no início do gesto.
   *
   * O gizmo entrega a caixa nova a cada frame, sempre relativa ao começo do
   * arrasto. Aplicar isso sobre os itens já transformados comporia a escala —
   * dois segundos de arrasto multiplicariam o tamanho várias vezes.
   */
  const groupSnapshot = useRef<{ items: CanvasItem[]; bounds: Bounds } | null>(
    null,
  );

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
   * O risco em curso, e o que a borracha está tocando.
   *
   * Local e não no store: um risco de três segundos emite umas duzentas
   * amostras, e cada uma no store seria um passo no histórico de desfazer e uma
   * gravação atrasada do board. O gesto vive aqui e chega ao store UMA vez, ao
   * soltar -- um risco, um Ctrl+Z.
   *
   * `riscando` é só "há um risco em curso", e não os pontos: quem move a linha
   * é o DOM, pelo `previa`. Guardar os pontos em estado re-renderizava o palco
   * INTEIRO por amostra -- com o mapa, os tokens e as camadas dentro --, e o
   * risco engasgava justamente onde ele precisa acompanhar a mão.
   */
  const [riscando, setRiscando] = useState(false);

  const previa = useRef<SVGPolylineElement | null>(null);

  const [apagando, setApagando] = useState<ReadonlySet<string>>(NADA_APAGANDO);

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

  /**
   * Move uma caixa aplicando snap, e devolve a posição corrigida.
   *
   * `targets` nulo desliga o alinhamento de vez: a caixa vai exatamente onde a
   * mão a leva, sem guia nem atração. É o caso da imagem no mapa -- ver
   * `handleItemPointerDown`.
   */
  function dragBox(
    event: ReactPointerEvent,
    origin: Bounds,
    targets: Bounds[] | null,
    apply: (dx: number, dy: number) => void,
    /** A que se alinhar além dos alvos. Padrão: o plano. Ver `computeSnap`. */
    frame?: Bounds,
    /**
     * Quem mais quer saber por onde o ponteiro passa e onde ele solta, em
     * coordenadas de TELA. Existe para a bolinha do handout, que fica fora do
     * plano e recebe o item que o mestre larga sobre ela.
     */
    fora?: {
      onMove?: (native: PointerEvent) => void;
      onEnd?: (native: PointerEvent) => void;
    },
  ) {
    startDrag(event, {
      onMove: (delta, native) => {
        fora?.onMove?.(native);

        let dx = delta.x;
        let dy = delta.y;

        // Alt desliga a atração: às vezes o mestre quer a peça exatamente onde
        // soltou, encostada mas não alinhada.
        if (targets === null) {
          // Sem alinhamento: nada a limpar, nada a atrair.
        } else if (native.altKey) {
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
      onEnd: (native) => {
        clearGuides();
        fora?.onEnd?.(native);
      },
    });
  }

  function handleItemPointerDown(event: ReactPointerEvent, item: CanvasItem) {
    const alreadySelected = selectedIds.includes(item.id);
    // O item, ou a pasta fechada em que ele está. Ver `alvoDoClique`.
    const alvo = alvoDoClique(scene, item);

    if (event.button === 2) {
      // Botão direito aponta o menu para o item clicado, mas não desfaz uma
      // seleção múltipla que já o inclua.
      if (!alreadySelected) select(alvo);
      return;
    }

    if (event.button !== 0) return;

    // Shift e Ctrl somam à seleção: a pasta fechada inteira, ou o item.
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      for (const id of alvo) toggle(id);
      return;
    }

    const draggedIds = alreadySelected ? selectedIds : alvo;
    if (!alreadySelected) select(alvo);

    const moving = scene.items.filter(
      (candidate) => draggedIds.includes(candidate.id) && !candidate.locked,
    );
    const movingBounds = boundsOfItems(moving);
    if (!movingBounds) return;

    /**
     * O retrato do que está na mão, MUTÁVEL: a roda, durante o arrasto, muda
     * tamanho e ângulo, e o movimento seguinte precisa partir do retrato novo
     * e não do de quando a mão pegou -- senão cada empurrão desfaria a roda.
     */
    let origins: CanvasItem[] = moving.map((item) => ({ ...item }));
    const bounds = { ...movingBounds };
    let ultimo = { dx: 0, dy: 0 };

    const aplicar = () =>
      updateItems(
        scene.id,
        origins.map((origin) => ({
          id: origin.id,
          patch: {
            x: Math.round(origin.x + ultimo.dx),
            y: Math.round(origin.y + ultimo.dy),
            width: origin.width,
            height: origin.height,
            rotation: origin.rotation,
          },
        })),
      );

    /**
     * A roda, com o item na mão: tamanho, e com Shift o ângulo. Na captura e
     * com `stopPropagation` porque o palco também escuta a roda, e lá ela é
     * zoom -- sem barrar, o item cresceria e o mapa saltaria debaixo dele.
     */
    const aoRodar = (native: WheelEvent) => {
      native.preventDefault();
      native.stopPropagation();
      // Com Shift o browser vira a roda de lado: o entalhe chega em `deltaX`
      // e `deltaY` fica zero. Lê-se o eixo que andou, seja qual for.
      const delta =
        Math.abs(native.deltaX) > Math.abs(native.deltaY)
          ? native.deltaX
          : native.deltaY;
      if (delta === 0) return;
      const sinal = delta < 0 ? 1 : -1;

      const patches = native.shiftKey
        ? girarPatches(origins, sinal * PASSO_DE_GIRO)
        : escalarPatches(
            origins,
            sinal > 0 ? PASSO_DE_TAMANHO : 1 / PASSO_DE_TAMANHO,
            {
              x: (bounds.minX + bounds.maxX) / 2,
              y: (bounds.minY + bounds.maxY) / 2,
            },
          );
      if (patches.length === 0) return;

      const porId = new Map(patches.map(({ id, patch }) => [id, patch]));
      origins = origins.map((origin) => ({
        ...origin,
        ...porId.get(origin.id),
      }));
      // O centro do próximo entalhe é o da caixa que acabou de crescer.
      Object.assign(bounds, boundsOfItems(origins) ?? bounds);
      aplicar();
    };
    window.addEventListener("wheel", aoRodar, {
      capture: true,
      passive: false,
    });

    // Sem snap para imagem: as guias tipo Figma atrapalhavam mais do que
    // ajudavam num mapa -- token não precisa alinhar borda com estátua. A
    // névoa e o retrato continuam alinhando, porque ali borda é o que importa.
    dragBox(
      event,
      bounds,
      null,
      (dx, dy) => {
        ultimo = { dx, dy };
        aplicar();
      },
      undefined,
      {
        // A bolinha do handout incha quando o item passa por cima, e engole
        // o que for solto nela: sai da mesa, volta para a manga. Ver
        // `guardarNoHandout`.
        onMove: (native) =>
          useHandoutStore.getState().apontar(native.clientX, native.clientY),
        onEnd: (native) => {
          window.removeEventListener("wheel", aoRodar, true);
          useHandoutStore.getState().largar();
          if (naBoca(native.clientX, native.clientY)) {
            guardarNoHandout(origins.map((origin) => origin.id));
          }
        },
      },
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
    dragBox(
      event,
      boxBounds(region),
      snapTargets((id) => id === region.id),
      (dx, dy) =>
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
  function handlePortraitPointerDown(
    event: ReactPointerEvent,
    portrait: Portrait,
  ) {
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
   * Mede a distância entre dois pontos, em metros.
   *
   * Sem grade não mede: é o quadrado que diz quanto vale um metro. O botão da
   * régua fica desabilitado nesse caso, e esta guarda é o segundo cinto -- o
   * atalho de teclado ou um estado antigo poderiam chegar aqui com a grade
   * desligada.
   */
  function medir(event: ReactPointerEvent, anchor: { x: number; y: number }) {
    if (!scene.grid) return;

    // Nasce na cena já no primeiro toque, e cresce no arrasto: a mesa vê a
    // conta acontecendo, como via antes, e o que sobra ao soltar é um medidor
    // colocado. Um clique sem arrasto não deixa nada -- ver `medidorVazio`.
    const id = addMedidor(scene.id, {
      forma: formaMedidor,
      cor: corMedidor,
      x: anchor.x,
      y: anchor.y,
      x2: anchor.x,
      y2: anchor.y,
    });
    selectMedidor(id);

    startDrag(event, {
      onMove: (_delta, native) => {
        const ponta = toScene(native.clientX, native.clientY);
        updateMedidor(scene.id, id, { x2: ponta.x, y2: ponta.y });
      },
      onEnd: (native) => {
        const ponta = toScene(native.clientX, native.clientY);
        if (medidorVazio({ ...anchor, x2: ponta.x, y2: ponta.y })) {
          removeMedidores(scene.id, [id]);
          clear();
        }
      },
    });
  }

  /** Clique num medidor: seleciona e, se arrastar, move inteiro. */
  function onMedidorPointerDown(event: ReactPointerEvent, medidor: Medidor) {
    if (event.button !== 0) return;
    event.stopPropagation();

    selectMedidor(medidor.id);

    startDrag(event, {
      onMove: (delta) => {
        const movido = moverMedidor(medidor, delta);
        updateMedidor(scene.id, medidor.id, {
          x: movido.x,
          y: movido.y,
          x2: movido.x2,
          y2: movido.y2,
        });
      },
    });
  }

  /** Alça numa ponta: só aquela ponta anda. */
  function onMedidorAlcaPointerDown(
    event: ReactPointerEvent,
    medidor: Medidor,
    ponta: PontaDoMedidor,
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();

    startDrag(event, {
      onMove: (_delta, native) => {
        const onde = toScene(native.clientX, native.clientY);
        updateMedidor(
          scene.id,
          medidor.id,
          ponta === "origem"
            ? { x: onde.x, y: onde.y }
            : { x2: onde.x, y2: onde.y },
        );
      },
    });
  }

  /**
   * Risca à mão livre.
   *
   * Amostra por DISTÂNCIA e não por evento: mouse de alta taxa entrega
   * centenas de pontos num traço curto, e guardá-los todos engorda a cena e o
   * payload sem mudar nada na tela -- dois pontos a meio pixel um do outro
   * desenham a mesma linha que um.
   *
   * O passo é em unidades de cena divididas pela escala, então ele é constante
   * na TELA: riscar ampliado guarda mais detalhe, que é o que se quer quando se
   * amplia para marcar algo pequeno.
   */
  function riscar(event: ReactPointerEvent, anchor: { x: number; y: number }) {
    const pontos = [Math.round(anchor.x), Math.round(anchor.y)];
    const passo = AMOSTRA_PX / scale;

    setRiscando(true);

    startDrag(event, {
      onMove: (_delta, native) => {
        const ponto = toScene(native.clientX, native.clientY);

        const ultimoX = pontos[pontos.length - 2] ?? 0;
        const ultimoY = pontos[pontos.length - 1] ?? 0;

        if (Math.hypot(ponto.x - ultimoX, ponto.y - ultimoY) < passo) return;

        pontos.push(Math.round(ponto.x), Math.round(ponto.y));

        // Direto no atributo, como os gestos das janelas: pelo estado, cada
        // amostra custaria um render do palco inteiro.
        previa.current?.setAttribute("points", pontos.join(" "));
      },
      onEnd: () => {
        setRiscando(false);

        // Um ponto só é um clique, e clique não é risco: guardá-lo deixaria uma
        // bolinha no mapa que ninguém pediu.
        if (pontos.length < 4) return;

        addTraco(scene.id, { pontos, cor, espessura });
      },
    });
  }

  /**
   * Apaga os riscos por onde a borracha passar.
   *
   * O traço INTEIRO que ela tocar, e não o pedaço: cortar uma polilinha em duas
   * a cada passada exigiria recriar traços a cada quadro, e desfazer deixaria
   * de ser "o risco volta" para ser "o risco volta remendado".
   *
   * Marca durante o gesto e remove ao soltar, numa vez: a borracha atravessa
   * três riscos numa passada, e removê-los um por um daria três entradas no
   * desfazer para um gesto só. Enquanto isso eles ficam translúcidos, senão o
   * mestre não saberia o que vai levar.
   */
  function apagar(event: ReactPointerEvent, anchor: { x: number; y: number }) {
    const alvos = new Set<string>();

    // A folga é em pixel de TELA: acertar um fio de três unidades com o ponteiro
    // exigiria pontaria, e apagar é gesto de correção -- quem apaga já errou uma
    // vez. Constante no zoom porque a mão é a mesma em qualquer ampliação.
    const folga = ALCANCE_BORRACHA_PX / scale;

    const tocar = (ponto: { x: number; y: number }) => {
      const antes = alvos.size;

      for (const traco of scene.tracos ?? []) {
        if (alvos.has(traco.id)) continue;

        // O alcance sai da espessura DO RISCO, e não do lápis: com o lápis fino
        // escolhido, um risco grosso ficava difícil de acertar -- e a borracha
        // deixou de ler a espessura do lápis quando as duas viraram ferramentas
        // separadas.
        if (tracoAlcancado(traco, ponto, traco.espessura / 2 + folga))
          alvos.add(traco.id);
      }

      // Só quando o conjunto cresceu: a borracha passa a maior parte do gesto
      // sobre o que já marcou, e um `Set` novo por quadro renderizaria o palco
      // sem nada ter mudado.
      if (alvos.size !== antes) setApagando(new Set(alvos));
    };

    tocar(anchor);

    startDrag(event, {
      onMove: (_delta, native) =>
        tocar(toScene(native.clientX, native.clientY)),
      onEnd: () => {
        setApagando(NADA_APAGANDO);
        removeTracos(scene.id, [...alvos]);
      },
    });
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
      onMove: (_delta, native) =>
        setAreaDaFila(sob(native.clientX, native.clientY)),
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

    // Clique no vazio dentro de uma câmera seleciona a câmera -- a menor que
    // contém o ponto, para a de dentro ganhar da de fora. Só com a ferramenta
    // de seleção: com lápis ou névoa na mão o clique é um traço.
    if (tool === "select") {
      const dentro = (scene.cameras ?? [])
        .filter(({ viewport: v }) =>
          anchor.x >= v.x && anchor.x <= v.x + v.width &&
          anchor.y >= v.y && anchor.y <= v.y + v.height,
        )
        .sort((a, b) => a.viewport.width - b.viewport.width)[0];

      if (dentro && dentro.id !== selecionadaId)
        useCameraLockStore.getState().selecionar(dentro.id);
    }

    // Clique, e não arrasto: o ponto não tem tamanho. Cravar já abre a nota,
    // porque cravar sem escrever nada deixaria na tela um alfinete numerado que
    // não diz nada — e o gesto seguinte é sempre escrever.
    if (tool === "pin") {
      abrirNota(
        addPin(scene.id, { x: Math.round(anchor.x), y: Math.round(anchor.y) }),
      );
      // Volta ao modo normal, como a névoa: cravar dois pontos seguidos é
      // raro, e ficar preso na ferramenta faz o mestre semear o mapa de
      // alfinetes por acidente ao tentar mover um token.
      setTool("select");

      return;
    }

    // Clique também, e não arrasto, embora o postit TENHA tamanho: desenhar a
    // caixa antes de escrever pediria uma decisão — quanto papel isto vai
    // precisar — que o mestre só sabe responder depois de digitar. Nasce no
    // tamanho padrão, e a alça do canto ajusta depois.
    if (tool === "postit") {
      // Centrado no clique, e não com o canto nele: o gesto é "aqui", e o
      // "aqui" de um papel é o meio dele. Colado no canto, o papel apareceria
      // todo para baixo e para a direita do que o mestre estava apontando.
      //
      // Preso à área de trabalho e não ao plano, o mesmo limite do arrasto: o
      // mestre pode clicar na margem, fora do mapa, e é lá que o papel deve
      // nascer quando ele clica lá. Ver `postitNaArea`.
      const onde = postitNaArea(
        anchor.x - POSTIT_LARGURA / 2,
        anchor.y - POSTIT_ALTURA / 2,
        POSTIT_LARGURA,
        POSTIT_ALTURA,
      );

      editarPostit(addPostit(scene.id, { ...onde, cor: corPostit }));

      // Volta ao modo normal pela mesma razão do alfinete, e com mais força
      // aqui: o papel ocupa 260 por 180, e um clique acidental com a
      // ferramenta presa cobriria um pedaço do mapa.
      setTool("select");

      return;
    }

    // Clique, como o postit: o texto nasce onde o mestre apontou e já em
    // edição, porque texto vazio não é nada. Volta ao modo normal pela mesma
    // razão do alfinete.
    if (tool === "texto") {
      const id = addTexto(scene.id, {
        x: Math.round(anchor.x),
        y: Math.round(anchor.y - TEXTO_TAMANHO / 2),
      });
      useQuadroStore.getState().editarTexto(id);
      setTool("select");
      return;
    }

    // Dois cliques: de onde, para onde. A ferramenta FICA na mão depois da
    // seta pronta -- amarrar cinco ideias seguidas é o gesto normal num
    // quadro, e Esc larga. Clique no vazio sem ponta ainda não faz nada;
    // com uma ponta, desiste dela.
    if (tool === "ligacao") {
      const alvo = ligavelEm(scene, anchor);
      const origem = useQuadroStore.getState().origem;

      if (!origem) {
        if (alvo) setOrigem(alvo);
        return;
      }

      if (alvo) {
        const id = addLigacao(scene.id, origem, alvo);
        if (id) useQuadroStore.getState().selecionarLigacao(id);
      }
      setOrigem(null);
      return;
    }

    if (tool === "regua") {
      medir(event, anchor);
      return;
    }

    if (tool === "lapis") {
      riscar(event, anchor);
      return;
    }

    if (tool === "borracha") {
      apagar(event, anchor);
      return;
    }

    if (tool === "fog") {
      startDrag(event, {
        onMove: (delta) =>
          setMarquee(
            boundsFromPoints(anchor, {
              x: anchor.x + delta.x,
              y: anchor.y + delta.y,
            }),
          ),
        onEnd: (native) => {
          setMarquee(null);

          const area = boundsFromPoints(
            anchor,
            toScene(native.clientX, native.clientY),
          );
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

    // A ferramenta de uma extensão. Por último entre as de mira, e antes do
    // marquee: se caísse depois, o gesto viraria seleção por área e a
    // ferramenta do plugin nunca receberia nada.
    const daExtensao = ferramentaDeExtensao(tool);
    if (daExtensao) {
      const registrada =
        useContribuicoesStore.getState().ferramentas[
          chaveContribuicao(daExtensao.extensaoId, daExtensao.ferramentaId)
        ];

      // Declarada e não registrada -- módulo ainda não importado, ou plugin que
      // não a implementou. O clique não faz nada, e não faz nada é o certo:
      // cair no marquee daria seleção por área enquanto o mestre acha que está
      // usando outra coisa.
      if (!registrada) return;

      // As duas formas, e o plugin escolhe qual implementa. Arrasto vence
      // quando ele oferece os dois: `aoClicar` dispararia no começo do gesto e
      // o mestre veria a ação acontecer antes de soltar.
      if (registrada.aoArrastar) {
        startDrag(event, {
          onMove: (delta) =>
            setMarquee(
              boundsFromPoints(anchor, {
                x: anchor.x + delta.x,
                y: anchor.y + delta.y,
              }),
            ),
          onEnd: (native) => {
            setMarquee(null);

            const box = boundsToBox(
              boundsFromPoints(anchor, toScene(native.clientX, native.clientY)),
            );

            registrada.aoArrastar?.({
              x: Math.round(box.x),
              y: Math.round(box.y),
              largura: Math.round(box.width),
              altura: Math.round(box.height),
            });
          },
        });

        return;
      }

      registrada.aoClicar?.({
        x: Math.round(anchor.x),
        y: Math.round(anchor.y),
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
          .filter(
            (item) => !item.locked && boundsIntersect(itemBounds(item), area),
          )
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

  const onItemPointerDown = useCallback(
    (event: ReactPointerEvent, item: CanvasItem) => {
      handlersRef.current.item(event, item);
    },
    [],
  );

  const onFogPointerDown = useCallback(
    (event: ReactPointerEvent, region: FogRegion) => {
      handlersRef.current.fog(event, region);
    },
    [],
  );

  const onPortraitPointerDown = useCallback(
    (event: ReactPointerEvent, portrait: Portrait) => {
      handlersRef.current.portrait(event, portrait);
    },
    [],
  );

  // Espaço tem precedência sobre a ferramenta: segurar espaço desloca a cena,
  // mesmo com a névoa escolhida.
  const drawingFog = tool === "fog" && !panMode;
  /**
   * Ferramenta de mira ativa: névoa, ponto, postit, lápis, borracha, régua —
   * ou a de uma extensão.
   *
   * Todas precisam do mesmo bloqueio. Repassar os handlers de item enquanto uma
   * delas está escolhida faria o gesto sobre um token virar "mover token" em
   * vez de cobrir a região, cravar o alfinete, colar o papel, riscar ou apagar
   * ali — e riscar por cima de um token é justamente o gesto de circular um
   * inimigo.
   *
   * A de extensão entra por construção, e não por nome: o aplicativo não sabe o
   * que ela faz, e supor que ela não precisa do palco livre seria supor o caso
   * mais raro.
   */
  const aiming =
    drawingFog ||
    (!panMode &&
      (tool === "pin" ||
        tool === "postit" ||
        tool === "texto" ||
        tool === "ligacao" ||
        tool === "lapis" ||
        tool === "borracha" ||
        tool === "regua" ||
        Boolean(ferramentaDeExtensao(tool))));
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
      <SceneLayer
          // O envelope do palco desce junto com o conteúdo, para o plano de
          // baixo: em cima ele cobriria os tokens e engoliria o clique que
          // deveria pegá-los. Ver `palco` no `SceneLayer`.
          palco={{
            // A marca que o arrasto de token procura sob o ponteiro para saber
            // se está sobre o mapa. Por atributo e não por ref no store: quem
            // pergunta é `document.elementFromPoint`, que devolve o nó de cima
            // -- e é justamente "tem uma janela da bancada por cima?" o que se
            // quer saber.
            "data-palco": true,
            className: "absolute inset-0",
            style: {
              cursor: canPan ? "grab" : aiming ? "crosshair" : undefined,
            },
            onPointerDown: panMode ? undefined : handleCanvasPointerDown,
            // O cursor fica no envelope e a zona o HERDA: `cursor` é herdado, e
            // é o que faz a mira da ferramenta valer também fora do plano.
            // Sem handler de arrasto nativo: as três origens de dentro do
            // aplicativo chegam pelo gesto próprio -- ver `TokenFantasma` --, e
            // o arquivo vindo do sistema não passa pelo DOM, e sim pelo evento
            // do Tauri -- ver `ArquivoFantasma`.
          }}
          apagando={apagando}
          scene={scene}
          variant="mestre"
          // Os dados dos jogadores pendurados nos retratos, aqui também.
          //
          // O palco do mestre ficou de fora quando isto nasceu, com o
          // argumento de que a fileira do canto já os mostra e repetir daria
          // dois lugares para a mesma coisa. O argumento caiu quando o dado
          // passou a CAIR no retrato: a fileira diz o que foi rolado, e o
          // retrato diz de quem é, com a queda acontecendo no rosto da pessoa.
          // São duas leituras diferentes do mesmo fato, e o mestre precisa das
          // duas -- ele é quem narra o resultado para a mesa.
          rolagens={bandeja}
          // Todos enquanto a aba Retratos está aberta; fora dela, só o
          // selecionado. Desenhar todos sempre punha cabeça flutuando sobre a
          // moldura da câmera justamente enquanto o mestre monta o mapa.
          portraits={
            editingPortraits
              ? portraits
              : selectedPortraits.length > 0
                ? selectedPortraits
                : undefined
          }
          // Com ferramenta de mira escolhida, o gesto sempre vale para ela:
          // repassar os handlers faria clicar sobre um item existente virar
          // "mover item".
          onItemPointerDown={panMode || aiming ? undefined : onItemPointerDown}
          onFogPointerDown={panMode || aiming ? undefined : onFogPointerDown}
          onPortraitPointerDown={
            panMode || aiming ? undefined : onPortraitPointerDown
          }
          medidorSelecionadoId={selectedMedidorId}
          onMedidorPointerDown={
            panMode || aiming ? undefined : onMedidorPointerDown
          }
          onMedidorAlcaPointerDown={
            panMode || aiming ? undefined : onMedidorAlcaPointerDown
          }
        />

      {/* Irmão do `SceneLayer`, e de propósito FORA dele: o `SceneLayer` é o
          mesmo componente do Espectador e do Jogador, e um ponto de anotação
          desenhado lá apareceria na TV virada para a mesa. */}
      <PinLayer scene={scene} panMode={panMode} />

      {/* Irmã do `PinLayer`, e fora do `SceneLayer` pela mesma razão: o texto
          de um postit é preparação do mestre, e o `SceneLayer` é o mesmo
          componente que desenha na TV. */}
      <PostitLayer scene={scene} panMode={panMode} />

      {/* Onde o papel vai cair, enquanto a ferramenta está na mão. Só com ela
          escolhida, e nunca com espaço segurado -- aí o gesto é da câmera, e a
          prévia de um papel que não vai ser colado seria ruído no meio de um
          deslocamento. */}
      {tool === "postit" && !panMode ? (
        <PostitFantasma cor={corPostit} />
      ) : null}

      {/* As duas do quadro, irmãs do postit e fora do `SceneLayer` pela mesma
          razão. Cada uma devolve `null` sem conteúdo, e a de seta só ouve o
          mouse enquanto uma ponta está clicada: mapa sem nada disto não paga. */}
      <TextoLayer scene={scene} panMode={panMode} />
      <LigacaoLayer scene={scene} />

      {/* Fora do `SceneLayer` pela mesma razão do `PinLayer`: hoje o dado é só
          do mestre. Dentro dele, os dados apareceriam na TV — e a decisão de
          mostrar a rolagem para a mesa é do mestre, não deste arquivo.

          Dentro do plano, porém: o dado é jogado SOBRE o mapa, e tem de
          acompanhar zoom e deslocamento como a névoa e os riscos acompanham. */}
      <DadoLayer />

      {/* A sombra do que está sendo arrastado para o mapa: o personagem, a
          imagem do acervo ou o item de inventário. Irmã das três acima, e fora
          do `SceneLayer` pelo mesmo motivo: é decisão em andamento do mestre, e
          a TV só recebe o que foi decidido. */}
      <TokenFantasma sceneId={scene.id} grid={scene.grid} />

      {/* A mesma coisa para o arquivo arrastado de FORA do aplicativo, que não
          é gesto próprio e por isso não cabia na sombra acima: ele chega pelo
          sistema operacional, sem imagem legível e sem roda. */}
      <ArquivoFantasma sceneId={scene.id} />

      {/* As camadas das extensões, e aqui pelo mesmo motivo das três acima: o
          `SceneLayer` é o componente que desenha na TV, e plugin só alcança o
          Mestre nesta etapa. O que elas desenham é anotação do mestre, como
          o alfinete e o postit. */}
      <CamadasDeExtensoes />

      {outlineBounds ? <SelectionBox bounds={outlineBounds} /> : null}

      {/* Cada item da seleção múltipla com o próprio contorno: sem isto a
          caixa do grupo era quatro cantos soltos num mapa escuro, e não se
          via QUEM estava dentro. Tracejado fino, para não brigar com o
          contorno sólido da caixa. */}
      {groupBounds
        ? selectedItems.map((item) => {
            const caixa = itemBounds(item);

            return (
              <div
                key={item.id}
                className="outline-primary/80 pointer-events-none absolute outline-dashed"
                style={{
                  left: caixa.minX,
                  top: caixa.minY,
                  width: caixa.maxX - caixa.minX,
                  height: caixa.maxY - caixa.minY,
                  outlineWidth: 1.5 / scale,
                  outlineOffset: 2 / scale,
                  zIndex: 9_900,
                }}
              />
            );
          })
        : null}

      {groupBounds && !panMode ? (
        <TransformHandles
          box={{ ...boundsToBox(groupBounds), rotation: 0 }}
          // Só cantos e escala uniforme: escalar um item girado de forma
          // diferente em cada eixo exigiria cisalhamento, que o modelo de item
          // não representa.
          handles={CORNER_HANDLES}
          keepAspect
          // Contorno ligado: era só os cantos, e a área do grupo não se lia.
          onGestureStart={() => {
            groupSnapshot.current = {
              items: selectedItems,
              bounds: groupBounds,
            };
          }}
          onChange={(patch) => {
            const frozen = groupSnapshot.current;
            if (!frozen) return;

            // Girar e escalar chegam pelo mesmo callback: `rotation` só vem no
            // gesto de rotação, e a caixa só no de redimensionamento.
            if (patch.rotation !== undefined) {
              updateItems(
                scene.id,
                rotateGroup(
                  frozen.items,
                  boundsCenter(frozen.bounds),
                  patch.rotation,
                ),
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
          // Remonta ao trocar de item, e é o que fecha o painel de opacidade
          // junto: o painel é do item que estava selecionado, e deixá-lo aberto
          // sobre o próximo diria que o valor dali é deste novo item.
          key={single.id}
          box={single}
          handles={CORNER_HANDLES}
          keepAspect
          // Azul quando é token: numa cena com mobília, mapa e quatro tokens,
          // saber que a caixa em volta é de uma PESSOA muda o que o mestre vai
          // fazer com ela.
          tom={personagemDoItem ? "personagem" : "default"}
          onChange={(patch) => updateItem(scene.id, single.id, patch)}
          onFlip={() => flipSelection("x")}
          // `setSelectionOpacity` e não `updateItem`: a seleção aqui é este
          // item só, e a regra de que 100% APAGA o campo mora numa função só.
          opacidade={{
            valor: single.opacity ?? 1,
            onChange: setSelectionOpacity,
          }}
          // Token abre a ficha de quem ele é. É o atalho que faltava no meio da
          // sessão: o mestre clica na figura no mapa, e não na lista de
          // personagens, porque no mapa é onde a mão dele já está.
          onOpenSheet={
            personagemDoItem
              ? () =>
                  abrirJanela({
                    tipo: "personagem",
                    personagemId: personagemDoItem,
                  })
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
          onFlip={() =>
            updatePortrait(singlePortrait.id, { flipX: !singlePortrait.flipX })
          }
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
            if (!frozen || patch.x === undefined || patch.width === undefined)
              return;

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

      {/* O risco em curso, antes de virar traço da cena. Desenhado aqui e não
          na camada compartilhada porque ele não existe na cena ainda -- e a
          mesa não deve ver a linha crescendo. */}
      {riscando ? (
        <svg
          aria-hidden
          // `overflow-visible` pelo mesmo motivo do `TracoLayer`, e este é o
          // que o mestre vê PRIMEIRO: é a prévia, a linha que acompanha o dedo.
          // Sem isto o risco sumia na borda do mapa enquanto está sendo feito,
          // e reaparecia inteiro ao soltar — o que faz o gesto parecer quebrado
          // justamente no instante em que a pessoa está olhando para ele.
          className="pointer-events-none absolute inset-0 overflow-visible"
          width={SCENE_WIDTH}
          height={SCENE_HEIGHT}
          // Acima dos itens e abaixo da névoa (5000), que é onde o traço vai
          // parar quando virar da cena: sem isto a linha nasceria por cima da
          // névoa e escorregaria para baixo dela ao soltar.
          style={{ zIndex: 4_000 }}
        >
          <polyline
            ref={previa}
            fill="none"
            stroke={cor}
            strokeWidth={espessura}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}

      {marquee ? <MarqueeBox bounds={marquee} /> : null}
      <AlignmentGuides guides={guides} />

      {fantasmasVisiveis && scene.cameras ? (
        <CamerasFantasma
          scene={scene}
          selecionadaId={selecionadaId}
          editavel={!panMode}
        />
      ) : null}

      {/* Espelhando o palco, a moldura coincide com a tela: desenhá-la seria
          uma borda em volta do palco inteiro dizendo nada. */}
      {selecionada && !espelhoMestre ? (
        <CameraFrame
          camera={selecionada}
          transmitindo={scene.cameraNoArId === selecionada.id}
          cinegrafista={cinegrafista}
          // Com espaço segurado a moldura vira só informativa: o gesto pertence
          // ao deslocamento da cena.
          onChange={
            panMode
              ? undefined
              : (viewport) => gravarCameraManual(selecionada.id, viewport)
          }
        />
      ) : null}

      {/* Os itens que a selecionada segue, marcados: sem isto o mestre vê a
          câmera andar sozinha e não sabe atrás de quem. Só contorno,
          atravessável. */}
      {selecionada?.alvoIds
        ? scene.items
            .filter((item) => selecionada.alvoIds?.includes(item.id))
            .map((item) => {
              const caixa = itemBounds(item);

              return (
                <div
                  key={item.id}
                  className="outline-primary pointer-events-none absolute rounded-sm outline-dashed"
                  style={{
                    left: caixa.minX,
                    top: caixa.minY,
                    width: caixa.maxX - caixa.minX,
                    height: caixa.maxY - caixa.minY,
                    outlineWidth: 2 / scale,
                    outlineOffset: 4 / scale,
                    zIndex: 11_500,
                  }}
                />
              );
            })
        : null}
    </>
  );
}
