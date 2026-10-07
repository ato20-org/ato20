"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { WandSparkles } from "lucide-react";

import { PainelDeCondicoesDoObjeto } from "@/components/mestre/condicoes-do-objeto";
import { PainelDeCondicoesDoPersonagem } from "@/components/mestre/condicoes-personagem";
import { AlcasDaArea } from "@/components/mestre/alcas-da-area";
import { AnelDoPincel } from "@/components/mestre/anel-do-pincel";
import { EscolhaDoEfeitoDaArea } from "@/components/mestre/efeito-da-area";
import { DadoLayer } from "@/components/mestre/dado-layer";
import { PinLayer } from "@/components/mestre/pin-layer";
import { LuzMarcadores } from "@/components/mestre/luz-marcadores";
import { PainelDaLuz } from "@/components/mestre/painel-da-luz";
import { ParedeLayer } from "@/components/mestre/parede-layer";
import { PortaMarcadores } from "@/components/mestre/porta-marcadores";
import {
  AncorasDeSeta,
  RAIO_DE_ENCAIXE_PX,
} from "@/components/mestre/ancoras-de-seta";
import { PostitFantasma } from "@/components/mestre/postit-fantasma";
import { PostitLayer } from "@/components/mestre/postit-layer";
import { LigacaoLayer } from "@/components/mestre/ligacao-layer";
import {
  FormaFantasma,
  FormaLayer,
} from "@/components/mestre/forma-layer";
import { TextoLayer } from "@/components/mestre/texto-layer";
import { ehDuploClique, type Toque } from "@/lib/mestre/duplo-clique";
import { ancorada, caixaDoTexto, pontaEm } from "@/lib/mestre/ligacoes";
import {
  empurrarTextos,
  escalarCaixa,
  escalarTextos,
  girarTextos,
  girarTextosNoLugar,
} from "@/lib/mestre/grupo-de-textos";
import { DocumentoLayer } from "@/components/mestre/documento-layer";
import { SelecaoDaMargem } from "@/components/mestre/selecao-da-margem";
import {
  caixaDoPapel,
  deslocamentoPreso,
  empurrarDocumentos,
  empurrarPostits,
  empurrarTracos,
} from "@/lib/mestre/grupo-sem-alca";
import { areaDoPoligono } from "@/lib/geometry/area-escondida";
import {
  ALTURA_DA_PAREDE,
  alturaDaParede,
  baseDaSombra,
  METROS_DA_PAREDE_PADRAO,
  modoDaSombra,
  pontoNaParede,
  recorteDaSombra,
  UNIDADES_POR_METRO,
} from "@/lib/geometry/sombra";
import { caixaDoTraco } from "@/lib/geometry/limites";
import {
  alternarPorta,
  pontaDaPorta,
  portaDoTraco,
} from "@/lib/geometry/porta";
import { postitNaArea } from "@/lib/geometry/postit";
import { reguaVazia, moverRegua } from "@/lib/geometry/regua";
import type { PontaDoMedidor } from "@/components/playground/regua-layer";
import { AlignmentGuides } from "@/components/playground/alignment-guides";
import { CameraFrame } from "@/components/playground/camera-frame";
import { CamerasFantasma } from "@/components/playground/camera-fantasma";
import { MarqueeBox } from "@/components/playground/marquee-box";
import { SceneLayer } from "@/components/playground/scene-layer";
import { efeitosDaCena } from "@/lib/condicao";
import { fichasDaCena } from "@/lib/mestre/fichas-da-cena";
import { transmissaoDaCamera } from "@/lib/mestre/camera-actions";
// `texto`, e não `t`: o palco tem `t` de conta, a fração ao longo do segmento.
import { t as texto } from "@/lib/i18n/bancada";
import {
  anotarPonteiro,
  esquecerPonteiro,
  registrarConversor,
} from "@/lib/mestre/ponteiro-no-palco";
import { usePingsStore } from "@/lib/store/use-pings-store";
import { RodaDePing } from "@/components/playground/roda-de-ping";
import { novoId } from "@/lib/id";
import { AUTOR_MESTRE, type TipoDePing } from "@/types/ping";
import { useSceneScale } from "@/components/playground/scene-stage";
import { SelectionBox } from "@/components/playground/selection-box";
import { TransformHandles } from "@/components/playground/transform-handles";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useCharacters } from "@/hooks/use-characters";
import { useModoCinegrafista } from "@/hooks/use-modo-cinegrafista";
import { usePanMode } from "@/hooks/use-pan-mode";
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
import {
  aplicarGesto,
  moverCameraNoGesto,
  moverNoGesto,
  terminarGesto,
  terminarGestoDaCamera,
  useGestoStore,
} from "@/lib/store/use-gesto-store";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useSilhueta } from "@/hooks/use-silhueta";
import {
  flipSelection,
  livre,
  removeAreaDeEfeitoSelection,
  removeFogSelection,
  removeParedeSelection,
  removePortaSelection,
  removeSelection,
  setSelectionOpacity,
  setSelectionSombra,
  toggleSelectionLock,
} from "@/lib/mestre/item-actions";
import {
  boundsFromPoints,
  boundsIntersect,
  boundsToBox,
  boxBounds,
  itemBounds,
  translateBounds,
  unionBounds,
  type Bounds,
} from "@/lib/geometry/bounds";
import {
  boundsCenter,
  boundsFromBox,
  moveGroup,
  rotateGroup,
  scaleGroup,
} from "@/lib/geometry/group";
import { CamadasDeExtensoes } from "@/components/mestre/camadas-de-extensoes";
import { ArquivoFantasma } from "@/components/mestre/arquivo-fantasma";
import { TokenFantasma } from "@/components/mestre/token-fantasma";
import { chaveContribuicao } from "@/lib/extensoes/manifesto";
import { useContribuicoesStore } from "@/lib/store/use-contribuicoes-store";
import { encaixarNaGrade, gradeDoEncaixe } from "@/lib/geometry/grid";
import {
  computeSnap,
  SNAP_THRESHOLD_PX,
  type Guide,
} from "@/lib/geometry/snap";
import {
  caminhoMacio,
  CORDA_MAXIMA_PX,
  cortarRisco,
  pontaNaCorda,
} from "@/lib/geometry/risco";
import { camposDaParedeNova } from "@/lib/mestre/elementos";
import { camposDoTextoNovo } from "@/lib/mestre/texto-actions";
import {
  furoDoTraco,
  furosNaCaixaNova,
  passadaTocaAArea,
  tokenSobOPonto,
} from "@/lib/geometry/nevoa-dinamica";
import {
  CORNER_HANDLES,
  MIN_ITEM_SIZE,
  type ResizeHandle,
  type Vec,
} from "@/lib/geometry/transform";
import { temFormatoDaMesa } from "@/lib/geometry/viewport";

import { usePinWindowStore } from "@/lib/store/use-pin-window-store";
import { usePostitStore } from "@/lib/store/use-postit-store";
import { useQuadroStore } from "@/lib/store/use-quadro-store";
import {
  useSceneStore,
  type FormaPatch,
  type ItemPatch,
  type TextoPatch,
} from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { ferramentaDeExtensao, useToolStore } from "@/lib/store/use-tool-store";
import { useBorrachaDaNevoaStore } from "@/lib/store/use-borracha-da-nevoa-store";
import { useBorrachaDosRiscosStore } from "@/lib/store/use-borracha-dos-riscos-store";
import { usePincelNaRoda } from "@/hooks/use-pincel-na-roda";
import { padraoDoQuadro } from "@/lib/configuracoes/quadro";
import {
  CORES_DA_LUZ,
  ehQuadro,
  itensVisiveis,
  RAIO_DA_LUZ_PADRAO,
  temCamera,
  POSTIT_ALTURA,
  POSTIT_LARGURA,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  TEXTO_TAMANHO,
  type AreaDeEfeito,
  type CanvasItem,
  type Documento,
  type FogRegion,
  type NewFogRegion,
  type Forma,
  type Regua,
  type Postit,
  type NewForma,
  type TipoDeForma,
  type NewParede,
  type NewPorta,
  type PontaDeLigacao,
  type Scene,
  type SceneGrid,
  type Texto,
  type Traco,
} from "@/types/scene";

const NO_GUIDES: Guide[] = [];
/** Ninguém anima: o Mestre durante um gesto. Identidade estável. */
const NINGUEM_ANIMA: ReadonlySet<string> = new Set<string>();
/** As listas vazias das três seleções que só andam. Ver `selectedPostits`. */
const NADA_DE_POSTIT: readonly Postit[] = [];
const NADA_DE_DOCUMENTO: readonly Documento[] = [];
const NADA_DE_TRACO: readonly Traco[] = [];

/** Identidade estável: um `Set` novo por render reiniciaria a memo da camada. */
const NADA_APAGANDO: ReadonlySet<string> = new Set<string>();

/**
 * A amostra das borrachas no meio do palco, enquanto a régua de tamanho anda:
 * um véu claro, e não uma cor -- a borracha não pinta, ela tira. Ver
 * `AnelDoPincel`.
 */
const AMOSTRA_DA_BORRACHA = { cor: "#ffffff", opacidade: 0.2 };

/** O gizmo da área com a borracha na mão: sem alça. Ver `furarNevoa`. */
const SEM_ALCAS: readonly ResizeHandle[] = [];

/**
 * Distância mínima entre duas amostras de um risco, em pixels de TELA.
 *
 * Em pixel de tela e não de cena: riscar ampliado guarda mais detalhe, que é o
 * que se quer quando se amplia justamente para marcar algo pequeno.
 */
const AMOSTRA_PX = 3;

/**
 * Quão perto do PRIMEIRO vértice o clique fecha o laço, em pixels de tela.
 *
 * Em pixel de tela, como a borracha e a amostra do risco: fechar é mira, e
 * mira se faz na tela -- ampliado, o mesmo raio em unidades de cena viraria
 * uma janela minúscula justamente onde o mestre está detalhando o contorno.
 */
const RAIO_DE_FECHO_PX = 12;

/**
 * O ponto preso ao plano.
 *
 * A área escondida cobre o MAPA, e o mestre desenha com a cena afastada, onde
 * sobra margem em volta dela: sem isto, um vértice cravado na margem daria uma
 * área maior que o plano -- e um filho maior que o plano é a armadilha que
 * pinta o palco deslocado e preto no zoom (`debug-do-palco` §3).
 */
function noPlano(ponto: Vec): Vec {
  return {
    x: Math.round(Math.min(Math.max(ponto.x, 0), SCENE_WIDTH)),
    y: Math.round(Math.min(Math.max(ponto.y, 0), SCENE_HEIGHT)),
  };
}

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
/** Menor arrasto que vira seta, em unidades de cena. Abaixo disso é clique. */
const ARRASTO_MINIMO_DA_SETA = 8;

/**
 * Menor parede que fica de pé, em unidades de cena. Abaixo disso o gesto foi um
 * clique, e o que ele deixaria é uma caixa invisível que não para luz nenhuma e
 * que ninguém consegue pegar de volta para apagar.
 */
const PAREDE_MINIMA = 8;

/**
 * Quanto a mão pode andar, em pixels de TELA, e o gesto sobre um item travado
 * ainda ser clique nele -- e não o começo de uma seleção por área. Ver
 * `travadoSobOClique`.
 */
const CLIQUE_NO_TRAVADO_PX = 4;

/**
 * O jeito com que uma forma NOVA nasce: o padrão da campanha, lido na hora.
 *
 * Canto só onde há canto -- elipse e linha não guardam um campo que não
 * desenham. Ver `padraoDoQuadro`.
 */
function jeitoDaForma(tipo: TipoDeForma): Pick<NewForma, "arredondado" | "aMao"> {
  const padrao = padraoDoQuadro();

  return {
    ...(padrao.arredondado && (tipo === "retangulo" || tipo === "poligono")
      ? { arredondado: true as const }
      : {}),
    ...(padrao.aMao ? { aMao: true as const } : {}),
  };
}

export function MestreStage({ scene: cenaDoBoard }: { scene: Scene }) {
  const { scale, toScene } = useSceneScale();
  const startDrag = useSceneDrag();

  // O N cria a câmera onde o mouse aponta, e o atalho não tem evento de
  // ponteiro para saber onde é: o palco empresta a própria conversão. Ver
  // `ponteiro-no-palco.ts`.
  useEffect(() => registrarConversor(toScene), [toScene]);

  // A cena que o palco DESENHA: a do board com o gesto em curso por cima.
  // Tudo abaixo -- `SceneLayer`, alças, setas, caixa de seleção -- lê `scene`
  // como sempre leu; o que mudou é que mover um token não grava no board a
  // cada quadro. Ver `useGestoStore`.
  const gestoSceneId = useGestoStore((state) => state.sceneId);
  const gestoPatches = useGestoStore((state) => state.patches);
  const gestoTextos = useGestoStore((state) => state.textos);
  const gestoFormas = useGestoStore((state) => state.formas);
  const gestoPostits = useGestoStore((state) => state.postits);
  const gestoDocumentos = useGestoStore((state) => state.documentos);
  const gestoTracos = useGestoStore((state) => state.tracos);
  const gestoCamera = useGestoStore((state) => state.camera);
  const gestoPorta = useGestoStore((state) => state.porta);
  const scene = useMemo(
    () =>
      aplicarGesto(cenaDoBoard, {
        sceneId: gestoSceneId,
        patches: gestoPatches,
        textos: gestoTextos,
        formas: gestoFormas,
        postits: gestoPostits,
        documentos: gestoDocumentos,
        tracos: gestoTracos,
        camera: gestoCamera,
        porta: gestoPorta,
      }),
    [
      cenaDoBoard,
      gestoSceneId,
      gestoPatches,
      gestoTextos,
      gestoFormas,
      gestoPostits,
      gestoDocumentos,
      gestoTracos,
      gestoCamera,
      gestoPorta,
    ],
  );

  /**
   * Os itens que o palco mostra: sem os de olho apagado na lista de camadas.
   *
   * É por esta lista, e não por `scene.items`, que a área laça, que a guia
   * encaixa e que o gizmo emoldura: o que não se vê não se pega pelo mapa. A
   * lista de camadas continua alcançando todos -- é por ela que voltam.
   */
  const visiveis = useMemo(
    () => itensVisiveis(scene.items, scene.grupos),
    [scene.items, scene.grupos],
  );

  const [marquee, setMarquee] = useState<Bounds | null>(null);
  /**
   * O item TRAVADO sob o último pointerdown, esperando o palco decidir.
   *
   * O clique num travado segue para o vazio, como sempre seguiu: o mapa que o
   * mestre põe como imagem e trava é o chão da seleção por área, e arrastar
   * sobre ele tem de laçar os tokens em cima. Mas o clique SEM arrasto agora o
   * seleciona -- é o caminho até o cadeado do gizmo, e o boss travado no altar
   * precisa ser destravável ali mesmo. Quem decide entre os dois é o fim do
   * gesto, no `handleCanvasPointerDown`.
   *
   * Ref e não estado: vale um pointerdown só, e o palco lê no mesmo evento.
   */
  const travadoSobOClique = useRef<string[] | null>(null);

  /**
   * A forma que está sendo desenhada agora, com tudo o que ela vai ter. `null`
   * fora do gesto. Ver `FormaFantasma`.
   */
  const [rascunhoDaForma, setRascunhoDaForma] = useState<NewForma | null>(null);
  /**
   * A parede que o arrasto está desenhando, antes de entrar na cena.
   *
   * Uma prévia PRÓPRIA, e não a caixa de seleção que o resto do palco usa: a
   * caixa é um retângulo azul, e ela não conta nada sobre um círculo nem sobre
   * um contorno à mão. Ver `ParedeLayer`.
   */
  const [rascunhoDaParede, setRascunhoDaParede] = useState<NewParede | null>(
    null,
  );
  /** A porta que o arrasto está traçando. Ver `PortaMarcadores`. */
  const [rascunhoDaPorta, setRascunhoDaPorta] = useState<NewPorta | null>(null);

  /**
   * O laço da área escondida livre: os vértices já cravados, em coordenadas de
   * cena. `null` quando não há laço em curso.
   *
   * Em estado, e não em ref como o risco: aqui cada vértice é um CLIQUE, e não
   * uma amostra de 60 por segundo -- um render por clique é barato, e é o que
   * mantém as alças-fantasma e a linha desenhadas sem sincronizar DOM à mão.
   * Quem anda por quadro é só a ponta que segue o cursor, e essa vai pela ref
   * abaixo, pelo mesmo motivo do risco.
   */
  const [laco, setLaco] = useState<{ sceneId: string; pontos: Vec[] } | null>(
    null,
  );
  const previaDoLaco = useRef<SVGPolygonElement | null>(null);

  /**
   * Os vértices do laço desta cena, ou `null`.
   *
   * A cena dona vai JUNTO do laço, e é o que faz trocar de mapa no meio do
   * contorno não deixar um laço órfão esperando para ser cravado no mapa
   * seguinte.
   */
  const pontosDoLaco = laco?.sceneId === scene.id ? laco.pontos : null;
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
  const opacidadeDoLapis = useToolStore((state) => state.opacidade);
  const suavizarDoLapis = useToolStore((state) => state.suavizar);
  const tamanhoEmAjuste = useToolStore((state) => state.tamanhoEmAjuste);
  const raioDaBorracha = useToolStore((state) => state.raioDaBorracha);
  const efeitoDaArea = useToolStore((state) => state.efeitoDaArea);
  const paredeNova = useToolStore((state) => state.paredeNova);
  const nevoaNovaDinamica = useToolStore((state) => state.nevoaNovaDinamica);
  const modoDaBorracha = useToolStore((state) => state.modoDaBorracha);
  const raioDaBorrachaDaNevoa = useBorrachaDaNevoaStore((state) => state.raio);
  // Alt+roda muda o pincel na mão, antes de a roda virar zoom.
  usePincelNaRoda();
  const corPostit = useToolStore((state) => state.corPostit);
  const formaMedidor = useToolStore((state) => state.formaMedidor);
  const corMedidor = useToolStore((state) => state.corMedidor);
  const tipoDeForma = useToolStore((state) => state.tipoDeForma);
  const formatoDeArea = useToolStore((state) => state.formatoDeArea);
  const formatoDoEfeito = useToolStore((state) => state.formatoDoEfeito);
  const corForma = useToolStore((state) => state.corForma);
  const espessuraForma = useToolStore((state) => state.espessuraForma);
  const fundoForma = useToolStore((state) => state.fundoForma);
  const setTool = useToolStore((state) => state.setTool);
  const formatoDaParede = useToolStore((state) => state.formatoDaParede);

  const editarPostit = usePostitStore((state) => state.editar);

  // Por tecla OU por ferramenta; ver `usePanMode`.
  const panMode = usePanMode();
  const abrirJanela = useAbrirJanela();
  const { personagens } = useCharacters();

  /** Os pings da mesa, os do mestre e os dos jogadores. Ver `PingLayer`. */
  const pings = usePingsStore((state) => state.ativos);

  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const selectedTextoIds = useSelectionStore(
    (state) => state.selectedTextoIds,
  );
  const selectedFormaIds = useSelectionStore(
    (state) => state.selectedFormaIds,
  );
  const selectedPostitIds = useSelectionStore(
    (state) => state.selectedPostitIds,
  );
  const selectedDocumentoIds = useSelectionStore(
    (state) => state.selectedDocumentoIds,
  );
  const selectedTracoIds = useSelectionStore((state) => state.selectedTracoIds);
  const selectedFogId = useSelectionStore((state) => state.selectedFogId);
  const selectedAreaDeEfeitoId = useSelectionStore(
    (state) => state.selectedAreaDeEfeitoId,
  );
  const select = useSelectionStore((state) => state.select);
  const toggle = useSelectionStore((state) => state.toggle);
  const selectTextos = useSelectionStore((state) => state.selectTextos);
  const toggleTexto = useSelectionStore((state) => state.toggleTexto);
  const selectFormas = useSelectionStore((state) => state.selectFormas);
  const toggleForma = useSelectionStore((state) => state.toggleForma);
  const selectPostits = useSelectionStore((state) => state.selectPostits);
  const togglePostit = useSelectionStore((state) => state.togglePostit);
  const selectDocumentos = useSelectionStore(
    (state) => state.selectDocumentos,
  );
  const toggleDocumento = useSelectionStore((state) => state.toggleDocumento);
  const selectMisto = useSelectionStore((state) => state.selectMisto);
  const selectFog = useSelectionStore((state) => state.selectFog);
  const selectAreaDeEfeito = useSelectionStore((state) => state.selectAreaDeEfeito);
  const selectedMedidorId = useSelectionStore(
    (state) => state.selectedMedidorId,
  );
  const selectMedidor = useSelectionStore((state) => state.selectMedidor);
  const selectParede = useSelectionStore((state) => state.selectParede);
  const selectLuz = useSelectionStore((state) => state.selectLuz);
  const selectPorta = useSelectionStore((state) => state.selectPorta);
  const selectedParedeId = useSelectionStore((state) => state.selectedParedeId);
  const selectedPortaId = useSelectionStore((state) => state.selectedPortaId);
  const clear = useSelectionStore((state) => state.clear);

  const addFog = useSceneStore((state) => state.addFog);
  const addMedidor = useSceneStore((state) => state.addMedidor);
  const updateMedidor = useSceneStore((state) => state.updateMedidor);
  const removeMedidores = useSceneStore((state) => state.removeMedidores);
  const addParede = useSceneStore((state) => state.addParede);
  const addLuz = useSceneStore((state) => state.addLuz);
  const addPorta = useSceneStore((state) => state.addPorta);
  const updateParede = useSceneStore((state) => state.updateParede);
  const updatePorta = useSceneStore((state) => state.updatePorta);
  const updateFog = useSceneStore((state) => state.updateFog);
  const addAreaDeEfeito = useSceneStore((state) => state.addAreaDeEfeito);
  const updateAreaDeEfeito = useSceneStore((state) => state.updateAreaDeEfeito);
  const addTraco = useSceneStore((state) => state.addTraco);
  const removeTracos = useSceneStore((state) => state.removeTracos);
  const substituirTracos = useSceneStore((state) => state.substituirTracos);
  const addPin = useSceneStore((state) => state.addPin);
  const addPostit = useSceneStore((state) => state.addPostit);
  const addTexto = useSceneStore((state) => state.addTexto);
  const addForma = useSceneStore((state) => state.addForma);
  const updateForma = useSceneStore((state) => state.updateForma);
  const addLigacao = useSceneStore((state) => state.addLigacao);

  // A seta em andamento e a seleção de texto/seta são desta cena: trocar de
  // cena ou largar a ferramenta de seta desfaz a primeira ponta clicada.
  const limparQuadro = useQuadroStore((state) => state.limpar);
  useEffect(() => {
    limparQuadro();
  }, [scene.id, limparQuadro]);
  // A câmera que o mestre está editando. Ver `useCameraLockStore`.
  const selecionadaId = useCameraLockStore((state) => state.selecionadaId);
  const espelhoMestre = useCameraLockStore((state) => state.espelhoMestre);
  const fantasmasVisiveis = useCameraLockStore(
    (state) => state.fantasmasVisiveis,
  );
  const garantirCameraInicial = useCameraLockStore(
    (state) => state.garantirCameraInicial,
  );
  const soltarTrava = useCameraLockStore((state) => state.soltar);
  // No quadro, nenhuma: some a moldura, somem os fantasmas e some a marca dos
  // itens seguidos. O `selecionadaId` continua apontando para a câmera do
  // MAPA de onde o mestre veio, e é o certo -- voltar para lá reencontra a
  // mesma câmera aberta.
  const selecionada = temCamera(scene)
    ? scene.cameras?.find((camera) => camera.id === selecionadaId)
    : undefined;
  // Um booleano, e não o id: o palco só acorda quando ESTA cena entra ou sai.
  const cenaNoAr = useSceneStore(
    (state) => state.board?.liveSceneId === cenaDoBoard.id,
  );

  // Cena nova começa sem câmera; a selecionada, se houver, tem de existir nela.
  // Efeito e não render: cria câmera no store, e isso é escrita.
  //
  // O quadro sai fora já aqui, e a própria função também o recusa: ele não tem
  // câmera nenhuma. Ver `lerCena` em `camera-actions`.
  useEffect(() => {
    if (!temCamera(scene)) return;
    garantirCameraInicial(scene);
  }, [scene, garantirCameraInicial]);

  // V segurado: a selecionada segue o mouse. Ver `useModoCinegrafista`.
  const cinegrafista = useModoCinegrafista({
    camera: selecionada?.viewport,
    ativo: !panMode,
    // No GESTO, e não no board, pelo mesmo motivo do arrasto da moldura: cada
    // quadro do visor chamava `gravarCameraManual`, que é um commit inteiro --
    // cópia do board, passo de histórico, gravação agendada, todo assinante do
    // store acordado e o `MestreShell` re-renderizado. Sessenta vezes por
    // segundo, com a roda somando mais alguns por quadro por cima. Medido na
    // webview com a bancada cheia, era o gesto mais caro do palco: 20,3 quadros
    // por segundo, contra 33 do arrasto da moldura, que já passava por aqui.
    //
    // O board continua recebendo no ritmo do canal enquanto esta câmera está no
    // ar -- quem assiste precisa ver a TV passear junto --, e o resto espera o
    // V ser solto. Ver `moverCameraNoGesto`.
    onChange: (viewport) => {
      if (selecionada) moverCameraNoGesto(scene.id, selecionada.id, viewport);
    },
    // A trava sai no COMEÇO, e uma vez. Ela saía de graça quando cada quadro
    // passava por `gravarCameraManual`; sem isto, uma câmera presa a tokens
    // seguiria o mouse e o seguidor a puxaria de volta dez vezes por segundo.
    onGestureStart: soltarTrava,
    onGestureEnd: terminarGestoDaCamera,
  });

  /**
   * Nome e medidores sobre a cabeça dos tokens, no palco do mestre.
   *
   * Com os ESCONDIDOS: é o único palco que os mostra, e apagados -- ele precisa
   * ver que o relógio corre, e que a mesa não o vê. A publicação para a mesa é
   * montada à parte, em `MestreShell`, e essa sai filtrada.
   *
   * Pela cena EM EDIÇÃO, e não pela que está no ar: o interruptor é dela, e o
   * mestre liga enquanto monta o mapa seguinte.
   */
  const fichasNoPalco = useMemo(
    () =>
      fichasDaCena(
        Boolean(scene.infoDosTokens),
        visiveis,
        personagens ?? [],
        true,
      ),
    [scene.infoDosTokens, visiveis, personagens],
  );
  /**
   * O que as condições fazem com cada figura, no palco do mestre.
   *
   * SEM as escondidas, ao contrário das fichas logo acima: o selo escondido
   * aparece apagado para ele, mas o efeito não -- uma figura tingida aqui
   * diria "a mesa está vendo isto", e ela não está. Ver `efeitosDaFigura`.
   */
  const efeitosNoPalco = useMemo(
    () => efeitosDaCena(visiveis, personagens ?? []),
    [visiveis, personagens],
  );

  const selectedItems = visiveis.filter((item) =>
    selectedIds.includes(item.id),
  );

  const selectedTextos = (scene.textos ?? []).filter((texto) =>
    selectedTextoIds.includes(texto.id),
  );
  const selectedFormas = (scene.formas ?? []).filter((forma) =>
    selectedFormaIds.includes(forma.id),
  );
  /**
   * Papel, cartão e risco na mão.
   *
   * A lista vazia é a MESMA referência, e não um `filter` que devolve array
   * novo: o palco inteiro re-renderiza a cada quadro de gesto de câmera, e as
   * três varreduras aconteciam sessenta vezes por segundo em toda cena --
   * inclusive nas que não têm postit nenhum, que são a maioria dos mapas.
   * Medido no `mestre-camera`: sem isto, o cenário custava 8% mais script.
   */
  const selectedPostits =
    selectedPostitIds.length === 0
      ? (NADA_DE_POSTIT as Postit[])
      : (scene.postits ?? []).filter((postit) =>
          selectedPostitIds.includes(postit.id),
        );
  const selectedDocumentos =
    selectedDocumentoIds.length === 0
      ? (NADA_DE_DOCUMENTO as Documento[])
      : (scene.documentos ?? []).filter((documento) =>
          selectedDocumentoIds.includes(documento.id),
        );
  const selectedTracos =
    selectedTracoIds.length === 0
      ? (NADA_DE_TRACO as Traco[])
      : (scene.tracos ?? []).filter((traco) =>
          selectedTracoIds.includes(traco.id),
        );
  /**
   * O que a mão pegou e só ANDA: papel, cartão de nota e risco.
   *
   * Existe como pergunta única porque a resposta muda o gizmo: com um deles na
   * mão as alças saem do ar e sobra a caixa do grupo. Não é limitação do
   * gesto, é do modelo -- ver `grupo-sem-alca`.
   */
  const semAlca =
    selectedPostits.length + selectedDocumentos.length + selectedTracos.length;
  /**
   * Quantas coisas o palco tem na mão. As seis contam igual: é o que decide
   * entre o gizmo de UM e o gizmo do grupo, e uma frase marcada junto com um
   * postit já são duas.
   */
  const naMao =
    selectedItems.length +
    selectedTextos.length +
    selectedFormas.length +
    semAlca;
  // `undefined` quando o único selecionado é um texto: as alças dele são da
  // própria camada, que sabe escalar fonte. Ver `TextoLayer`. Papel, cartão e
  // risco também caem no `undefined`, e aí ninguém põe alça: os três têm as
  // próprias alças de tamanho, ou nenhuma. Ver `grupo-sem-alca`.
  const single = naMao === 1 ? selectedItems[0] : undefined;

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
  /**
   * O personagem ainda existe -- ou a lista ainda não chegou, e aí a ficha
   * abre e diz por conta própria. Token de personagem apagado não tem ficha
   * para abrir.
   */
  const personagemExiste = (personagemId: string) =>
    personagens === null ||
    personagens.some((atual) => atual.id === personagemId);

  const personagemDoItem =
    single?.personagemId && personagemExiste(single.personagemId)
      ? single.personagemId
      : undefined;

  /** O toque anterior num item, para contar o duplo clique. Ver `ehDuploClique`. */
  const ultimoToque = useRef<Toque | null>(null);

  /**
   * A silhueta do item selecionado, para a linha do chão automática do gizmo.
   *
   * A MESMA url que o palco já desenha, e por isso a silhueta que o forno já
   * assou para a sombra: a linha aparece em cima dos pés, e não na borda de
   * baixo do PNG, e no mesmo lugar de onde a sombra está nascendo.
   */
  const silhuetaDoSelecionado = useSilhueta(useAssetUrl(single?.assetId));
  const sombraDoSelecionado = single
    ? {
        modo: single.semSombra ? ("nenhuma" as const) : modoDaSombra(single),
        base:
          baseDaSombra(single) ??
          (silhuetaDoSelecionado
            ? recorteDaSombra(silhuetaDoSelecionado.recorte, {
                flipX: single.flipX,
                flipY: single.flipY,
              }).baixo
            : undefined),
        baseManual: baseDaSombra(single) !== undefined,
        altura: single.sombra?.altura ?? 1,
        // Qualquer coisa que deite sombra de token: o sol, uma luz acesa, uma
        // lanterna na mão de alguém.
        acesa:
          Boolean(scene.sol) ||
          (scene.luzes ?? []).some((luz) => !luz.desligada) ||
          scene.items.some((item) => item.luz),
        onModo: (modo: "base" | "inteira" | "nenhuma") =>
          setSelectionSombra({ modo }),
        onBase: (base: number | null) => setSelectionSombra({ base }),
        onAltura: (altura: number) => setSelectionSombra({ altura }),
      }
    : undefined;
  const selectedFog = scene.fog.find((region) => region.id === selectedFogId);
  /** A borracha da névoa na mão. Ela fura a área selecionada, e só ela. */
  const furando = tool === "borrachaDaNevoa";
  // A área saiu da mão -- desfeita, apagada, travada pela lista -- e a
  // borracha ficou sem o que furar: volta à seleção, em vez de deixar o
  // próximo clique no mapa sem efeito nenhum.
  const semAlvoParaFurar = furando && (!selectedFog || selectedFog.locked);
  useEffect(() => {
    if (semAlvoParaFurar) setTool("select");
  }, [semAlvoParaFurar, setTool]);
  const selectedAreaDeEfeito = scene.areasDeEfeito?.find(
    (area) => area.id === selectedAreaDeEfeitoId,
  );
  /**
   * Quem anima os efeitos no Mestre: só o que está selecionado -- os tokens e
   * a área. O resto pausa no quadro em que está, e a luz dele para
   * de tremular. Ver `animarSo` em `SceneLayer`.
   *
   * E NINGUÉM durante um gesto -- arrastar o token em chamas, a área, uma
   * alça, a caixa de seleção: o que o mestre olha no arrasto é para onde a
   * coisa vai, e o fogo tremulando por baixo é compositor refazendo a folha a
   * cada quadro do gesto. Ao soltar, o selecionado volta a andar.
   */
  const emGesto = useViewportStore((state) => state.gestos > 0);
  const efeitosAnimados = useMemo(
    () =>
      emGesto
        ? NINGUEM_ANIMA
        : new Set<string>([
            ...selectedIds,
            ...(selectedAreaDeEfeitoId ? [selectedAreaDeEfeitoId] : []),
          ]),
    [emGesto, selectedIds, selectedAreaDeEfeitoId],
  );
  const selectedParede = scene.paredes?.find(
    (parede) => parede.id === selectedParedeId,
  );
  const selectedPorta = scene.portas?.find(
    (porta) => porta.id === selectedPortaId,
  );
  /**
   * A caixa da porta FECHADA, da dobradiça à ponta: é sobre ela que a fileira
   * do gizmo fica. A do batente, e não a da folha, para os botões não andarem
   * enquanto a porta abre.
   */
  const caixaDaPortaNaMao = selectedPorta
    ? boundsToBox(boundsFromPoints(selectedPorta, pontaDaPorta(selectedPorta, true)))
    : null;
  /**
   * A caixa que cerca o que está na mão, quando é mais de um.
   *
   * Itens e textos na mesma união: a área do quadro laça os dois, e um gizmo
   * que só cercasse as imagens deixaria metade da seleção do lado de fora das
   * alças.
   */
  const groupBounds =
    naMao > 1
      ? unionBounds([
          ...selectedItems.map(itemBounds),
          ...selectedTextos.map(caixaDoTexto),
          ...selectedFormas.map(itemBounds),
          ...selectedPostits.map(caixaDoPapel),
          ...selectedDocumentos.map(caixaDoPapel),
          // O risco sem ponto nenhum não tem caixa; `unionBounds` ignora nulo.
          ...selectedTracos.map(caixaDoTraco).filter((caixa) => caixa !== null),
        ])
      : null;
  /**
   * A caixa do que só anda, mesmo sozinho.
   *
   * Um risco laçado sozinho não tem onde ser pego: ele é uma linha fina, e a
   * camada dele não ouve o ponteiro -- é um SVG só para os dois palcos. É esta
   * caixa que vira a pega, na margem. Ver `SelecaoDaMargem`.
   */
  /**
   * Papel e cartão SOZINHOS não passam por aqui: cada um traz as próprias
   * alças e os próprios botões, como o texto solto. Ver `PostitPapel` e
   * `CartaoDeDocumento`.
   *
   * O risco continua ganhando o contorno e a pega mesmo sozinho: ele não tem
   * gizmo próprio nem nada que ouça o ponteiro, e sem a pega não haveria como
   * movê-lo.
   */
  const comGizmoProprio =
    naMao === 1 &&
    (selectedDocumentos.length === 1 || selectedPostits.length === 1);
  const caixaSemAlca =
    semAlca > 0 && !comGizmoProprio
      ? (groupBounds ??
        unionBounds([
          ...selectedPostits.map(caixaDoPapel),
          ...selectedDocumentos.map(caixaDoPapel),
          ...selectedTracos.map(caixaDoTraco).filter((caixa) => caixa !== null),
        ]))
      : null;

  /**
   * Retrato do grupo no início do gesto.
   *
   * O gizmo entrega a caixa nova a cada frame, sempre relativa ao começo do
   * arrasto. Aplicar isso sobre os itens já transformados comporia a escala —
   * dois segundos de arrasto multiplicariam o tamanho várias vezes.
   */
  const groupSnapshot = useRef<{
    items: CanvasItem[];
    textos: Texto[];
    formas: Forma[];
    bounds: Bounds;
  } | null>(null);

  // Item travado ganha contorno em vez de alças: sem gizmo não há como
  // redimensionar ou girar por acidente, mas ele fica visivelmente selecionado.
  // Com espaço segurado vale o mesmo — a seleção continua à vista, mas nada
  // nela é agarrável, senão a alça competiria com o gesto de deslocar.
  const outlineBounds =
    // Grupo ganha gizmo próprio abaixo; aqui fica só o contorno de quem não
    // pode ser transformado.
    //
    // Com papel, cartão ou risco na mão a caixa sai daqui e vai para a MARGEM:
    // este contorno vive no plano de controles, e um postit estacionado fora
    // do mapa faria a caixa passar da borda do plano -- que é a armadilha que
    // pinta o palco deslocado e preto no zoom. Ver `SelecaoDaMargem`.
    groupBounds && panMode && semAlca === 0
      ? groupBounds
      : // O travado ganhou o gizmo de volta, sem alças e com o cadeado: é por
        // ali que ele destrava. Só o espaço segurado fica com o contorno.
        single && panMode
        ? itemBounds(single)
        : selectedFog && panMode
          ? itemBounds({ ...selectedFog, rotation: selectedFog.rotation ?? 0 })
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

  const previa = useRef<SVGPathElement | null>(null);

  const [apagando, setApagando] = useState<ReadonlySet<string>>(NADA_APAGANDO);

  /** Evita re-render por frame quando não há guia nenhuma para mostrar. */
  function clearGuides() {
    setGuides((previous) => (previous.length === 0 ? previous : NO_GUIDES));
  }

  /** Bounds de tudo que não está se movendo — os candidatos a linha guia. */
  function snapTargets(exclude: (id: string) => boolean): Bounds[] {
    return [
      ...visiveis.filter((item) => !exclude(item.id)).map(itemBounds),
      // Pela caixa GIRADA, como o item: uma área torta ocupa mais que a caixa
      // dela, e alinhar pelo retângulo cru daria guia em lugar nenhum.
      ...scene.fog
        .filter((region) => !exclude(region.id))
        .map((region) => itemBounds({ ...region, rotation: region.rotation ?? 0 })),
    ];
  }

  /**
   * Move uma caixa aplicando snap, e devolve a posição corrigida.
   *
   * `targets` nulo desliga o alinhamento de vez: a caixa vai onde a mão a
   * leva, sem guia nem atração de borda. É o caso da imagem no mapa -- ver
   * `handleItemPointerDown` --, que em troca é a única que encaixa na GRADE,
   * quando o mestre ligou o ímã.
   */
  function dragBox(
    event: ReactPointerEvent,
    origin: Bounds,
    targets: Bounds[] | null,
    apply: (dx: number, dy: number) => void,
    /** A que se alinhar além dos alvos. Padrão: o plano. Ver `computeSnap`. */
    frame?: Bounds,
    /**
     * A grade que imanta, quando o mestre a ligou. Ver `gradeDoEncaixe`.
     *
     * Separada dos `targets` de propósito: alinhar a outro item é atração
     * FRACA -- vale dentro de seis pixels de tela e some no resto do arrasto
     * --, e o encaixe na grade vale sempre, em qualquer ponto do mapa. Um par
     * de regras numa só faria a casa da grade competir com a borda da estátua
     * ao lado.
     */
    grade?: SceneGrid,
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

        // A grade por último, e sobre a caixa JÁ corrigida: o encaixe é a
        // regra mais forte das duas -- com o ímã ligado, a peça mora na casa
        // --, e deixá-lo antes faria o alinhamento tirá-la de lá.
        //
        // Alt escapa dos dois no mesmo gesto: é a tecla que já dizia "a peça
        // exatamente onde eu soltei", e uma segunda tecla para dizer o mesmo
        // do outro ímã seria duas respostas para a mesma pergunta.
        if (grade && !native.altKey) {
          const caixa = translateBounds(origin, dx, dy);
          const encaixe = encaixarNaGrade(
            {
              width: caixa.maxX - caixa.minX,
              height: caixa.maxY - caixa.minY,
            },
            caixa.minX,
            caixa.minY,
            grade,
          );

          dx += encaixe.x - caixa.minX;
          dy += encaixe.y - caixa.minY;
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
      //
      // E PARA aqui. O item mora dentro do envelope do palco, e o clique no
      // vazio com botão que não é o esquerdo limpa a seleção -- ver
      // `handleCanvasPointerDown`. O esquerdo nunca chegava lá porque o
      // `startDrag` corta a subida; o direito sai antes dele, e o menu abria
      // sobre uma seleção que acabara de ser limpa, sem as ações do token.
      event.stopPropagation();
      if (!alreadySelected) select(alvo);
      return;
    }

    if (event.button !== 0) return;

    // Shift e Ctrl somam à seleção: a pasta fechada inteira, ou o item.
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      ultimoToque.current = null;
      for (const id of alvo) toggle(id);
      return;
    }

    /**
     * Duplo clique no token abre a ficha de quem ele é: o mesmo atalho do
     * botão da caixa de seleção, para a mão que já está na figura. Antes de
     * armar o arrasto, e por isso vale também para o token travado. Contado
     * no `pointerdown` -- ver `ehDuploClique`.
     *
     * O segundo toque NÃO arrasta: ele é o fim de um gesto, e um arrasto
     * armado por baixo da ficha que acabou de abrir levaria o token junto com
     * o primeiro movimento do mouse.
     */
    const toque = {
      alvo: item.id,
      t: event.timeStamp,
      x: event.clientX,
      y: event.clientY,
    };
    const duplo = ehDuploClique(ultimoToque.current, toque);
    ultimoToque.current = duplo ? null : toque;

    if (duplo) {
      /**
       * Duplo clique ENTRA no grupo: isola o item sob o cursor, deixando a
       * pasta. Até aqui o único "entrar no grupo" era pela LISTA -- abrir a
       * pasta e clicar na linha --, o caminho que `alvoDoClique` descreve. É o
       * mesmo gesto do Figma, agora também no mapa.
       *
       * Só quando o item ainda NÃO está sozinho na mão: com ele já isolado, o
       * segundo duplo clique cai na ficha abaixo. Assim o token de personagem
       * agrupado mantém o atalho -- um duplo clique entra no grupo, o outro abre
       * quem ele é. A seleção vem FRESCA do store: entre os dois toques do duplo
       * o primeiro já chamou `select`, e o render pode não ter alcançado o
       * closure deste handler.
       */
      const noGrupo = alvo.length > 1;
      const selecao = useSelectionStore.getState().selectedIds;
      const isolado = selecao.length === 1 && selecao[0] === item.id;

      if (noGrupo && !isolado) {
        // Para aqui, como a ficha abaixo: sem isto o envelope do palco leria o
        // mesmo gesto como clique no vazio e limparia a seleção.
        event.stopPropagation();
        event.preventDefault();
        select([item.id]);
        return;
      }

      if (item.personagemId && personagemExiste(item.personagemId)) {
        // Para aqui, como o botão direito: sem isto o envelope do palco leria o
        // mesmo gesto como clique no vazio e limparia a seleção.
        event.stopPropagation();
        event.preventDefault();
        abrirJanela({ tipo: "personagem", personagemId: item.personagemId });
        return;
      }
    }

    const draggedIds = alreadySelected ? selectedIds : alvo;
    /**
     * Os textos do quadro vêm junto quando o item clicado JÁ estava na mão: a
     * área laça frase e imagem no mesmo gesto, e pegar uma tem de levar as
     * duas. Clicar numa imagem de fora da seleção é um gesto novo -- aí
     * `select` já limpou os textos, e não há passageiro.
     */
    // O travado da mão fica onde está, como a imagem travada: ver `livre`.
    const textosArrastados = alreadySelected
      ? selectedTextos.filter(livre)
      : [];
    const formasArrastadas = alreadySelected
      ? selectedFormas.filter(livre)
      : [];
    // Papel, cartão e risco vêm pela mesma porta, e pelo mesmo motivo: a área
    // laça os seis no mesmo gesto. Eles ANDAM com a imagem, mas não crescem com
    // ela -- a roda abaixo mexe só no que tem caixa. Ver `grupo-sem-alca`.
    const postitsArrastados = alreadySelected ? selectedPostits : [];
    const documentosArrastados = alreadySelected ? selectedDocumentos : [];
    const tracosArrastados = alreadySelected ? selectedTracos : [];
    if (!alreadySelected) select(alvo);

    const moving = scene.items.filter(
      (candidate) => draggedIds.includes(candidate.id) && !candidate.locked,
    );
    const movingBounds = unionBounds([
      ...moving.map(itemBounds),
      ...textosArrastados.map(caixaDoTexto),
      ...formasArrastadas.map(itemBounds),
      ...postitsArrastados.map(caixaDoPapel),
      ...documentosArrastados.map(caixaDoPapel),
      ...tracosArrastados.map(caixaDoTraco).filter((caixa) => caixa !== null),
    ]);
    // Nada para andar: é o travado sozinho. O clique segue para o palco, que
    // laça por área ou, se a mão não andar, o seleciona. Ver
    // `travadoSobOClique`.
    if (!movingBounds) {
      travadoSobOClique.current = alreadySelected ? selectedIds : alvo;
      return;
    }

    /**
     * O retrato do que está na mão, MUTÁVEL: a roda, durante o arrasto, muda
     * tamanho e ângulo, e o movimento seguinte precisa partir do retrato novo
     * e não do de quando a mão pegou -- senão cada empurrão desfaria a roda.
     */
    let origins: CanvasItem[] = moving.map((item) => ({ ...item }));
    let origensDeTexto: Texto[] = textosArrastados.map((texto) => ({
      ...texto,
    }));
    let origensDeForma: Forma[] = formasArrastadas.map((forma) => ({
      ...forma,
    }));
    const bounds = { ...movingBounds };
    let ultimo = { dx: 0, dy: 0 };

    const patchesDoGesto = (): ItemPatch[] =>
      origins.map((origin) => ({
        id: origin.id,
        patch: {
          x: Math.round(origin.x + ultimo.dx),
          y: Math.round(origin.y + ultimo.dy),
          width: origin.width,
          height: origin.height,
          rotation: origin.rotation,
        },
      }));

    const patchesDeTexto = (): TextoPatch[] =>
      empurrarTextos(origensDeTexto, ultimo.dx, ultimo.dy);
    // Como o item, e não pelo `moveGroup`: a roda muda tamanho e ângulo no
    // meio do arrasto, e um patch só de posição desfaria a roda ao soltar.
    const patchesDeForma = (): FormaPatch[] =>
      origensDeForma.map((origem) => ({
        id: origem.id,
        patch: {
          x: Math.round(origem.x + ultimo.dx),
          y: Math.round(origem.y + ultimo.dy),
          width: origem.width,
          height: origem.height,
          rotation: origem.rotation,
        },
      }));

    /**
     * Os três que só andam, empurrados pelo mesmo deslocamento.
     *
     * Fora da roda de propósito: ela escala e gira o que está na mão, e papel,
     * cartão e risco não fazem nem uma coisa nem outra. Eles ficam onde o
     * arrasto os pôs enquanto a imagem cresce ao lado -- que é o mesmo que
     * acontece hoje quando a roda gira um item com um postit por perto.
     */
    const patchesSemAlca = () => ({
      postits: empurrarPostits(postitsArrastados, ultimo.dx, ultimo.dy),
      documentos: empurrarDocumentos(
        documentosArrastados,
        ultimo.dx,
        ultimo.dy,
      ),
      tracos: empurrarTracos(tracosArrastados, ultimo.dx, ultimo.dy),
    });

    // No gesto, e não no board: o board só recebe no soltar. Ver `useGestoStore`.
    const aplicar = () =>
      moverNoGesto(
        scene.id,
        patchesDoGesto(),
        patchesDeTexto(),
        patchesDeForma(),
        patchesSemAlca(),
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

      const centro = {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
      };
      const fator = sinal > 0 ? PASSO_DE_TAMANHO : 1 / PASSO_DE_TAMANHO;

      // A forma entra na MESMA conta do item: ela tem a geometria dele, e é
      // por isso que `girarPatches` e `escalarPatches` servem às duas.
      const patches = native.shiftKey
        ? girarPatches([...origins, ...origensDeForma], sinal * PASSO_DE_GIRO)
        : escalarPatches([...origins, ...origensDeForma], fator, centro);
      // Nada cabe no passo? Nada anda, nem o texto: encolher metade do que
      // está na mão desalinharia o que o mestre acabou de alinhar. Ver
      // `escalarPatches`.
      if (origins.length + origensDeForma.length > 0 && patches.length === 0)
        return;

      const patchesDeTextoDaRoda = native.shiftKey
        ? girarTextosNoLugar(origensDeTexto, sinal * PASSO_DE_GIRO)
        : escalarTextos(
            origensDeTexto,
            bounds,
            escalarCaixa(bounds, fator, centro),
          );
      if (patches.length === 0 && patchesDeTextoDaRoda.length === 0) return;

      const porId = new Map(patches.map(({ id, patch }) => [id, patch]));
      origins = origins.map((origin) => ({
        ...origin,
        ...porId.get(origin.id),
      }));
      origensDeForma = origensDeForma.map((origem) => ({
        ...origem,
        ...porId.get(origem.id),
      }));
      const textoPorId = new Map(
        patchesDeTextoDaRoda.map(({ id, patch }) => [id, patch]),
      );
      origensDeTexto = origensDeTexto.map((origem) => ({
        ...origem,
        ...textoPorId.get(origem.id),
      }));
      // O centro do próximo entalhe é o da caixa que acabou de crescer.
      Object.assign(
        bounds,
        unionBounds([
          ...origins.map(itemBounds),
          ...origensDeTexto.map(caixaDoTexto),
          ...origensDeForma.map(itemBounds),
        ]) ?? bounds,
      );
      aplicar();
    };
    window.addEventListener("wheel", aoRodar, {
      capture: true,
      passive: false,
    });

    // Sem snap para imagem: as guias tipo Figma atrapalhavam mais do que
    // ajudavam num mapa -- token não precisa alinhar borda com estátua. A
    // névoa continua alinhando, porque ali borda é o que importa.
    //
    // A GRADE é outra conversa, e por isso entra mesmo aqui: ela não é alinhar
    // a peça à estátua ao lado, é a casa em que a peça mora -- e só existe se
    // o mestre ligou o ímã. Com vários na mão é a caixa do grupo que encaixa,
    // e não cada um: o bloco anda inteiro, como em qualquer arrasto múltiplo.
    dragBox(
      event,
      bounds,
      null,
      (dx, dy) => {
        // A cerca do papel prende o grupo inteiro, imagem incluída: o bloco
        // para junto em vez de se desmanchar na borda da área de trabalho.
        ultimo = deslocamentoPreso(
          [...postitsArrastados, ...documentosArrastados],
          dx,
          dy,
        );
        aplicar();
      },
      undefined,
      gradeDoEncaixe(scene),
      {
        // A bolinha do handout incha quando o item passa por cima, e engole
        // o que for solto nela: sai da mesa, volta para a manga. Ver
        // `guardarNoHandout`.
        onMove: (native) =>
          useHandoutStore.getState().apontar(native.clientX, native.clientY),
        onEnd: (native) => {
          window.removeEventListener("wheel", aoRodar, true);
          // Um commit, um passo de desfazer. Antes do handout: guardar na manga
          // remove o item do board, e remover o que não foi gravado não é nada.
          terminarGesto(
            scene.id,
            patchesDoGesto(),
            patchesDeTexto(),
            patchesDeForma(),
            patchesSemAlca(),
          );
          useHandoutStore.getState().largar();
          if (naBoca(native.clientX, native.clientY)) {
            guardarNoHandout(origins.map((origin) => origin.id));
          }
        },
      },
    );
  }

  /**
   * Clique num texto solto do quadro. Irmão de `handleItemPointerDown`, e aqui
   * pelo mesmo motivo: o gesto é da SELEÇÃO, e só o palco sabe o que MAIS está
   * na mão -- a camada do texto conhece um texto de cada vez.
   *
   * Shift soma, como no item. Sem Shift, um texto que já estava marcado leva o
   * bando inteiro junto; um texto de fora começa uma seleção nova.
   */
  function handleTextoPointerDown(event: ReactPointerEvent, texto: Texto) {
    const jaSelecionado = selectedTextoIds.includes(texto.id);

    if (event.button === 2) {
      // Como no item: o botão direito aponta para este texto, mas não desfaz
      // uma seleção múltipla que já o inclua -- e para aqui, pela mesma razão.
      event.stopPropagation();
      if (!jaSelecionado) selectTextos([texto.id]);
      return;
    }

    if (event.button !== 0) return;

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      toggleTexto(texto.id);
      return;
    }

    if (!jaSelecionado) selectTextos([texto.id]);

    arrastarBando(event, {
      itens: jaSelecionado ? selectedItems.filter((item) => !item.locked) : [],
      textos: (jaSelecionado ? selectedTextos : [texto]).filter(livre),
      formas: jaSelecionado ? selectedFormas.filter(livre) : [],
      postits: jaSelecionado ? selectedPostits : [],
      documentos: jaSelecionado ? selectedDocumentos : [],
      tracos: jaSelecionado ? selectedTracos : [],
    });
  }

  /**
   * Clique numa forma do quadro. O mesmo desenho do texto: Shift soma, uma
   * forma já marcada leva o bando junto, uma de fora começa seleção nova.
   */
  function handleFormaPointerDown(event: ReactPointerEvent, forma: Forma) {
    const jaSelecionada = selectedFormaIds.includes(forma.id);

    if (event.button === 2) {
      // Para aqui, como o item: ver `handleItemPointerDown`.
      event.stopPropagation();
      if (!jaSelecionada) selectFormas([forma.id]);
      return;
    }

    if (event.button !== 0) return;

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      toggleForma(forma.id);
      return;
    }

    if (!jaSelecionada) selectFormas([forma.id]);

    arrastarBando(event, {
      itens: jaSelecionada ? selectedItems.filter((item) => !item.locked) : [],
      textos: jaSelecionada ? selectedTextos.filter(livre) : [],
      formas: (jaSelecionada ? selectedFormas : [forma]).filter(livre),
      postits: jaSelecionada ? selectedPostits : [],
      documentos: jaSelecionada ? selectedDocumentos : [],
      tracos: jaSelecionada ? selectedTracos : [],
    });
  }

  /**
   * Clique na faixa de um postit, ou na barra de um cartão de nota.
   *
   * Irmão do de texto e do de forma, e aqui pelo mesmo motivo: a camada do
   * papel conhece um papel de cada vez, e só o palco sabe o que MAIS está na
   * mão. Antes disto a faixa arrastava o papel sozinho e gravava no board a
   * cada quadro; agora ela entra no gesto como todo o resto.
   *
   * O botão direito aponta o menu para o papel, como faz com o item: o bloco
   * do quadro já fala de papel (remover) e é onde os plugins põem item para
   * ele. Antes o papel não selecionava com o direito e o menu abria no vazio.
   */
  function handlePapelPointerDown(
    event: ReactPointerEvent,
    papel:
      | { tipo: "postit"; postit: Postit }
      | { tipo: "documento"; documento: Documento },
  ) {
    const id = papel.tipo === "postit" ? papel.postit.id : papel.documento.id;
    const jaSelecionado =
      papel.tipo === "postit"
        ? selectedPostitIds.includes(id)
        : selectedDocumentoIds.includes(id);

    if (event.button === 2) {
      // E PARA aqui, pela mesma razão do item: o clique no vazio com botão que
      // não é o esquerdo limpa a seleção. Ver `handleItemPointerDown`.
      event.stopPropagation();
      if (!jaSelecionado) {
        if (papel.tipo === "postit") selectPostits([id]);
        else selectDocumentos([id]);
      }
      return;
    }

    if (event.button !== 0) return;

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      if (papel.tipo === "postit") togglePostit(id);
      else toggleDocumento(id);
      return;
    }

    if (!jaSelecionado) {
      if (papel.tipo === "postit") selectPostits([id]);
      else selectDocumentos([id]);
    }

    arrastarBando(event, {
      itens: jaSelecionado ? selectedItems.filter((item) => !item.locked) : [],
      textos: jaSelecionado ? selectedTextos.filter(livre) : [],
      formas: jaSelecionado ? selectedFormas.filter(livre) : [],
      postits:
        papel.tipo === "postit"
          ? jaSelecionado
            ? selectedPostits
            : [papel.postit]
          : jaSelecionado
            ? selectedPostits
            : [],
      documentos:
        papel.tipo === "documento"
          ? jaSelecionado
            ? selectedDocumentos
            : [papel.documento]
          : jaSelecionado
            ? selectedDocumentos
            : [],
      tracos: jaSelecionado ? selectedTracos : [],
    });
  }

  /**
   * Arrastar o que está na mão pela PEGA da margem -- a caixa que cerca o que
   * só anda.
   *
   * É o único jeito de mover um risco: a camada dele é um SVG atravessável,
   * compartilhado com a mesa, e pôr o ponteiro nela faria cada linha do mapa
   * disputar o clique com os tokens embaixo. Ver `SelecaoDaMargem`.
   */
  function handlePegaPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0 || panMode) return;

    arrastarBando(event, {
      itens: selectedItems.filter((item) => !item.locked),
      textos: selectedTextos,
      formas: selectedFormas,
      postits: selectedPostits,
      documentos: selectedDocumentos,
      tracos: selectedTracos,
    });
  }

  /**
   * Arrastar o que está na mão, a partir de um texto ou de uma forma.
   *
   * Sem roda e sem a bolinha do handout, ao contrário do arrasto que começa
   * numa imagem: os dois extras são de imagem -- redimensionar com a roda e
   * guardar na manga --, e o gesto aqui é mover.
   */
  function arrastarBando(
    event: ReactPointerEvent,
    bando: {
      itens: CanvasItem[];
      textos: Texto[];
      formas: Forma[];
      postits?: Postit[];
      documentos?: Documento[];
      tracos?: Traco[];
    },
  ) {
    const origensDeItem = bando.itens.map((item) => ({ ...item }));
    const origensDeTexto = bando.textos.map((texto) => ({ ...texto }));
    const origensDeForma = bando.formas.map((forma) => ({ ...forma }));
    const origensDePostit = (bando.postits ?? []).map((postit) => ({
      ...postit,
    }));
    const origensDeDocumento = (bando.documentos ?? []).map((documento) => ({
      ...documento,
    }));
    const origensDeTraco = bando.tracos ?? [];
    let ultimo = { dx: 0, dy: 0 };

    const patches = () =>
      [
        moveGroup(origensDeItem, ultimo.dx, ultimo.dy),
        empurrarTextos(origensDeTexto, ultimo.dx, ultimo.dy),
        moveGroup(origensDeForma, ultimo.dx, ultimo.dy),
      ] as const;

    // Os três que só andam viajam no saco com nome, e não como quarta e quinta
    // posição: ver `PatchesSemAlca`. Todos partem das ORIGENS, e não do estado
    // atual -- somar incremento a incremento acumularia erro de arredondamento
    // e o grupo chegaria alguns pixels longe do cursor.
    const semAlcaDoGesto = () => ({
      postits: empurrarPostits(origensDePostit, ultimo.dx, ultimo.dy),
      documentos: empurrarDocumentos(
        origensDeDocumento,
        ultimo.dx,
        ultimo.dy,
      ),
      tracos: empurrarTracos(origensDeTraco, ultimo.dx, ultimo.dy),
    });

    startDrag(event, {
      // O clique nativo sobrevive: é o duplo clique que abre a edição do
      // texto, e matá-lo aqui deixaria o texto sem como ser reescrito.
      mantemClique: true,
      onMove: (delta) => {
        // A cerca do papel prende o GRUPO, e não cada papel: ver
        // `deslocamentoPreso`. Sem papel na mão, devolve o passo inteiro.
        ultimo = deslocamentoPreso(
          [...origensDePostit, ...origensDeDocumento],
          delta.x,
          delta.y,
        );
        moverNoGesto(scene.id, ...patches(), semAlcaDoGesto());
      },
      onEnd: () => terminarGesto(scene.id, ...patches(), semAlcaDoGesto()),
    });
  }

  function handleFogPointerDown(event: ReactPointerEvent, region: FogRegion) {
    // Na névoa dinâmica os tokens ANDAM lá dentro, e o mestre precisa pegá-los
    // ali: o clique sobre um token vai para ele, com qualquer botão -- o menu
    // também é dele --, e só o resto da área a seleciona. A área parada
    // continua como sempre foi: cobre tudo.
    if (region.dinamica && !region.revealed) {
      const token = tokenSobOPonto(
        visiveis,
        toScene(event.clientX, event.clientY),
      );
      if (token) {
        handleItemPointerDown(event, token);
        return;
      }
    }

    if (event.button === 2) {
      // Para aqui, como o item: ver `handleItemPointerDown`.
      event.stopPropagation();
      selectFog(region.id);
      return;
    }

    if (event.button !== 0) return;

    selectFog(region.id);
    // Travada, o clique só seleciona: é para chegar ao cadeado.
    if (region.locked) {
      event.stopPropagation();
      return;
    }

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

  /** Clique e arrasto numa área de efeito, como na área escondida. */
  function handleAreaDeEfeitoPointerDown(event: ReactPointerEvent, area: AreaDeEfeito) {
    if (event.button === 2) {
      event.stopPropagation();
      selectAreaDeEfeito(area.id);
      return;
    }

    if (event.button !== 0) return;

    selectAreaDeEfeito(area.id);
    if (area.locked) {
      event.stopPropagation();
      return;
    }

    const origin = { x: area.x, y: area.y };
    dragBox(
      event,
      boxBounds(area),
      snapTargets((id) => id === area.id),
      (dx, dy) =>
        updateAreaDeEfeito(scene.id, area.id, {
          x: Math.round(origin.x + dx),
          y: Math.round(origin.y + dy),
        }),
    );
  }

  /**
   * A área de efeito nova: a caixa, e o efeito que o painel de Elementos
   * escolheu. Sem escolha ela nasce SEM efeito -- um pedaço do chão marcado --,
   * e o efeito se escolhe depois no gizmo, entre os da campanha.
   */
  function novaAreaDeEfeito(
    caixa: Pick<AreaDeEfeito, "x" | "y" | "width" | "height" | "formato" | "pontos">,
  ) {
    return addAreaDeEfeito(scene.id, {
      ...caixa,
      ...(efeitoDaArea ? { efeito: efeitoDaArea } : {}),
    });
  }

  /** A área escondida nova, já dinâmica se o painel de Elementos pediu. */
  function novaNevoa(caixa: NewFogRegion) {
    return addFog(scene.id, {
      ...caixa,
      ...(nevoaNovaDinamica ? { dinamica: true as const } : {}),
    });
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
    // colocado. Um clique sem arrasto não deixa nada -- ver `reguaVazia`.
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
        if (reguaVazia({ ...anchor, x2: ponta.x, y2: ponta.y })) {
          removeMedidores(scene.id, [id]);
          clear();
          // A ferramenta FICA na mão, como na seta recusada: nada foi colocado,
          // e largá-la aqui puniria o mestre por um gesto que não chegou a
          // acontecer.
          return;
        }

        // Volta ao modo normal, como a forma e a névoa: o gesto seguinte a
        // medir é mexer no que se mediu -- arrastar o medidor, ou levar o token
        // até onde ele chega --, e com a ferramenta presa esse arrasto virava
        // outra régua por cima.
        setTool("select");
      },
    });
  }

  /**
   * Traça uma parede: arrasto de canto a canto, como a névoa.
   *
   * O mesmo gesto dos quatro formatos, e é o que a caixa comprou: `linha` usa a
   * diagonal do arrasto, `retangulo` e `elipse` usam a caixa inteira, e o laço
   * cai no caminho de vértices da área escondida -- ver `cravarVertice`.
   *
   * Feita a parede, a ferramenta SE LARGA, como todas as outras do palco. Ela
   * ficava na mão, com o argumento de que contornar uma masmorra são dez
   * paredes seguidas -- e o argumento caiu na prática, pelo mesmo motivo da
   * seta: o gesto seguinte a erguer uma parede é quase sempre mexer nela ou
   * conferir a sombra que ela fez, e com a ferramenta presa esse arrasto virava
   * outra parede por cima.
   */
  function erguerParede(event: ReactPointerEvent, anchor: Vec) {
    // O laço não é arrasto: ele se desenha vértice a vértice. É o mesmo caminho
    // da área livre, e é o `tool` que decide o que nasce no fecho.
    if (formatoDaParede === "poligono") {
      cravarVertice(anchor);
      return;
    }

    // Shift iguala os lados, como na névoa e na forma: é assim que saem o
    // quadrado e o círculo, e é o mesmo teclado de todo editor.
    const travado = (ponto: Vec, shift: boolean) => {
      if (!shift) return ponto;

      const lado = Math.max(
        Math.abs(ponto.x - anchor.x),
        Math.abs(ponto.y - anchor.y),
      );

      return {
        x: anchor.x + Math.sign(ponto.x - anchor.x) * lado,
        y: anchor.y + Math.sign(ponto.y - anchor.y) * lado,
      };
    };

    /** A parede que este arrasto produz, do começo ao fim. Ver `rascunho` na
        forma: uma função só, e é o que garante que a prévia SEJA a parede. */
    const rascunho = (fim: Vec): NewParede => {
      const box = boundsToBox(boundsFromPoints(anchor, fim));

      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        formato: formatoDaParede,
        // A linha desce ou sobe conforme o arrasto: é a única coisa que a
        // caixa sozinha não conta. Ver `Parede`.
        ...(formatoDaParede === "linha" &&
        (fim.x - anchor.x) * (fim.y - anchor.y) < 0
          ? { diagonal: "secundaria" as const }
          : {}),
      };
    };

    startDrag(event, {
      onMove: (delta, native) =>
        setRascunhoDaParede(
          rascunho(
            travado(
              { x: anchor.x + delta.x, y: anchor.y + delta.y },
              native.shiftKey,
            ),
          ),
        ),
      onEnd: (native) => {
        setRascunhoDaParede(null);

        const fim = travado(
          toScene(native.clientX, native.clientY),
          native.shiftKey,
        );
        const box = boundsToBox(boundsFromPoints(anchor, fim));

        // Clique sem arrasto deixaria uma parede invisível impossível de pegar.
        // A `linha` passa com um lado só: uma parede na horizontal tem altura
        // zero, e é a parede mais comum que existe.
        const magra =
          formatoDaParede === "linha"
            ? box.width < PAREDE_MINIMA && box.height < PAREDE_MINIMA
            : box.width < PAREDE_MINIMA || box.height < PAREDE_MINIMA;
        if (magra) return;

        selectParede(
          addParede(scene.id, {
            ...rascunho(fim),
            ...camposDaParedeNova(paredeNova, formatoDaParede),
          }),
        );
        // Volta ao modo normal, como todas as outras do palco: o gesto seguinte
        // a erguer uma parede é conferir a sombra que ela fez, e não erguer
        // outra por cima. É a regra do Excalidraw, e agora vale para as seis.
        setTool("select");
      },
    });
  }

  /**
   * Traça uma porta: o clique crava a dobradiça, e o arrasto leva a ponta.
   * Shift cai no múltiplo de 45, que é como as portas correm num mapa.
   */
  function tracarPorta(event: ReactPointerEvent, dobradica: Vec) {
    startDrag(event, {
      onMove: (delta, native) =>
        setRascunhoDaPorta(
          portaDoTraco(
            dobradica,
            { x: dobradica.x + delta.x, y: dobradica.y + delta.y },
            native.shiftKey,
          ),
        ),
      onEnd: (native) => {
        setRascunhoDaPorta(null);

        // Clique sem arrasto não deixa porta: uma de zero não teria onde pegar.
        const porta = portaDoTraco(
          dobradica,
          toScene(native.clientX, native.clientY),
          native.shiftKey,
        );
        if (!porta) return;

        selectPorta(addPorta(scene.id, porta));
        // De volta à seta, como a parede: o gesto seguinte é abrir a porta
        // para conferir a luz, e é com a seta que a alça responde.
        setTool("select");
      },
    });
  }

  /** Clique num medidor: seleciona e, se arrastar, move inteiro. */
  function onMedidorPointerDown(event: ReactPointerEvent, medidor: Regua) {
    if (event.button !== 0) return;
    event.stopPropagation();

    selectMedidor(medidor.id);

    startDrag(event, {
      onMove: (delta) => {
        const movido = moverRegua(medidor, delta);
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
    medidor: Regua,
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
    // A corda do estabilizador, em pixel de TELA como a amostra: o tremido é
    // da mão, e a mão é a mesma em qualquer ampliação. Ver `pontaNaCorda`.
    const corda = (suavizarDoLapis * CORDA_MAXIMA_PX) / scale;
    let ponta: Vec = anchor;

    setRiscando(true);

    startDrag(event, {
      onMove: (_delta, native) => {
        ponta = pontaNaCorda(
          ponta,
          toScene(native.clientX, native.clientY),
          corda,
        );

        const ultimoX = pontos[pontos.length - 2] ?? 0;
        const ultimoY = pontos[pontos.length - 1] ?? 0;

        if (Math.hypot(ponta.x - ultimoX, ponta.y - ultimoY) < passo) return;

        pontos.push(Math.round(ponta.x), Math.round(ponta.y));

        // Direto no atributo, como os gestos das janelas: pelo estado, cada
        // amostra custaria um render do palco inteiro.
        previa.current?.setAttribute("d", caminhoMacio(pontos));
      },
      onEnd: () => {
        setRiscando(false);

        // Um ponto só é um clique, e clique não é risco: guardá-lo deixaria uma
        // bolinha no mapa que ninguém pediu.
        if (pontos.length < 4) return;

        addTraco(scene.id, {
          pontos,
          cor,
          espessura,
          // Cheio não grava o campo: é o risco de sempre, e o arquivo da cena
          // não carrega um `1` em cada um.
          ...(opacidadeDoLapis < 1 ? { opacidade: opacidadeDoLapis } : {}),
        });
      },
    });
  }

  /**
   * A borracha dos riscos, no modo que o painel escolheu: o PEDAÇO por onde o
   * anel passa, ou o risco INTEIRO que ele encostar. Ver `ModoDaBorracha`.
   */
  function apagar(event: ReactPointerEvent, anchor: Vec) {
    if (modoDaBorracha === "pedaco") cortarRiscos(event, anchor);
    else apagarRiscosInteiros(event, anchor);
  }

  /**
   * Apaga INTEIRO todo risco que o anel encostar.
   *
   * Marca durante o gesto e remove ao soltar, numa vez: a borracha atravessa
   * três riscos numa passada, e removê-los um por um daria três entradas no
   * desfazer para um gesto só. Enquanto isso eles ficam translúcidos, senão o
   * mestre não saberia o que vai levar.
   */
  function apagarRiscosInteiros(event: ReactPointerEvent, anchor: Vec) {
    const alvos = new Set<string>();

    const tocar = (ponto: Vec) => {
      const antes = alvos.size;

      for (const traco of scene.tracos ?? []) {
        if (alvos.has(traco.id)) continue;

        // O anel mais a metade do risco: o risco grosso é tocado pela borda,
        // e não só quando o anel chega à linha do meio dele.
        if (tracoAlcancado(traco, ponto, raioDaBorracha + traco.espessura / 2))
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
   * Corta dos riscos o PEDAÇO por onde o anel passa: o risco atravessado vira
   * dois, e o que sobra continua com a cor, a largura e a opacidade dele.
   *
   * Corta a cada amostra, pelo trecho novo da passada -- da amostra anterior
   * até esta --, e não pela passada inteira de novo: o custo de uma amostra é o
   * do trecho, e uma passada de três segundos não fica mais lenta no fim. O
   * corte em curso vive no `useBorrachaDosRiscosStore`, que só a camada dos
   * riscos assina, e entra na cena UMA vez, ao soltar: um Ctrl+Z por passada.
   * Ver `cortarRisco`.
   */
  function cortarRiscos(event: ReactPointerEvent, anchor: Vec) {
    const tracos = scene.tracos ?? [];
    // A caixa de cada risco, uma vez por gesto: o pedaço nunca sai da caixa do
    // risco de que veio, e o risco longe da passada sai na primeira conta.
    const caixas = new Map(tracos.map((traco) => [traco.id, caixaDoTraco(traco)]));
    const pedacos = new Map<string, number[][]>();
    const borracha = useBorrachaDosRiscosStore.getState();
    let anterior = anchor;

    const passar = (passada: Vec[]) => {
      const xs = passada.map((ponto) => ponto.x);
      const ys = passada.map((ponto) => ponto.y);
      let mudou = false;

      for (const traco of tracos) {
        const alcance = raioDaBorracha + traco.espessura / 2;
        const caixa = caixas.get(traco.id);
        if (
          !caixa ||
          Math.max(...xs) < caixa.minX - alcance ||
          Math.min(...xs) > caixa.maxX + alcance ||
          Math.max(...ys) < caixa.minY - alcance ||
          Math.min(...ys) > caixa.maxY + alcance
        )
          continue;

        const atuais = pedacos.get(traco.id) ?? [traco.pontos];
        const novos: number[][] = [];
        let tocou = false;
        for (const pedaco of atuais) {
          const cortado = cortarRisco(pedaco, passada, alcance);
          if (cortado) tocou = true;
          novos.push(...(cortado ?? [pedaco]));
        }

        if (tocou) {
          pedacos.set(traco.id, novos);
          mudou = true;
        }
      }

      if (mudou) borracha.setPedacos(new Map(pedacos));
    };

    passar([anchor]);

    startDrag(event, {
      onMove: (_delta, native) => {
        const ponto = toScene(native.clientX, native.clientY);
        passar([anterior, ponto]);
        anterior = ponto;
      },
      onEnd: () => {
        // Na cena ANTES de a prévia sair, como o furo da névoa: na ordem
        // contrária, o risco inteiro voltaria por um quadro antes de sumir.
        if (pedacos.size > 0) {
          const porId = new Map(tracos.map((traco) => [traco.id, traco]));
          substituirTracos(
            scene.id,
            new Map(
              [...pedacos].map(([id, lista]) => {
                const { cor, espessura, opacidade } = porId.get(id)!;
                return [
                  id,
                  lista.map((pontos) => ({
                    pontos,
                    cor,
                    espessura,
                    ...(opacidade !== undefined ? { opacidade } : {}),
                  })),
                ];
              }),
            ),
          );
        }
        borracha.setPedacos(null);
      },
    });
  }

  /**
   * Fura a área escondida SELECIONADA por onde a borracha passar.
   *
   * Só ela: a borracha entra pelo gizmo da área, e a passada que escorrega
   * para a vizinha não a abre sem querer. O traço vive no
   * `useBorrachaDaNevoaStore` durante o gesto -- só o canvas da área repinta
   * a cada amostra -- e entra na cena UMA vez, ao soltar: uma passada, um
   * Ctrl+Z, uma publicação para a mesa. Ver `FogRegion.furos`.
   */
  function furarNevoa(event: ReactPointerEvent, anchor: Vec) {
    const area = selectedFog;
    // Sem área na mão, ou travada, a ferramenta não tem o que furar: volta à
    // seleção, que é o que o clique no vazio quer dizer.
    if (!area || area.locked) {
      setTool("select");
      return;
    }

    const borracha = useBorrachaDaNevoaStore.getState();
    borracha.comecar(area.id, anchor);

    startDrag(event, {
      onMove: (_delta, native) =>
        borracha.acrescentar(toScene(native.clientX, native.clientY)),
      onEnd: () => {
        // O furo entra na cena ANTES de o traço sair da mão: na ordem
        // contrária, a área sem furo nenhum voltaria a ser o bloco cheio por
        // um quadro, e o buraco piscaria fechado antes de reabrir.
        const traco = useBorrachaDaNevoaStore.getState().traco;
        const furo =
          traco && passadaTocaAArea(area, traco.pontos, traco.raio)
            ? furoDoTraco(area, traco.pontos, traco.raio)
            : null;
        if (furo)
          updateFog(scene.id, area.id, { furos: [...(area.furos ?? []), furo] });

        useBorrachaDaNevoaStore.getState().terminar();
      },
    });
  }

  /**
   * Duplo clique no vazio do quadro escreve ali, como no Excalidraw.
   *
   * O caminho da ferramenta de texto continua existindo -- ela é o que ANUNCIA
   * que dá para escrever --, e este é o atalho de quem já sabe: no meio de um
   * quadro, a distância entre pensar a frase e ter o cursor piscando passa a
   * ser um gesto.
   *
   * Só no vazio: `target === currentTarget` é o que separa o duplo clique no
   * envelope do duplo clique numa imagem, que é filha dele. O texto e a forma
   * têm camadas próprias, fora deste envelope, e nem chegam aqui.
   *
   * Só com a seleção na mão: com uma ferramenta de mira escolhida, o segundo
   * clique é do gesto dela -- dois postits colados, dois riscos.
   */
  function handleCanvasDoubleClick(event: React.MouseEvent) {
    if (tool !== "select" || event.target !== event.currentTarget) return;

    const ponto = toScene(event.clientX, event.clientY);
    // Meia linha acima do ponto: o cursor nasce onde o mouse está, e não com o
    // topo da letra nele -- é onde a pessoa está olhando.
    const campos = camposDoTextoNovo();
    const id = addTexto(scene.id, {
      x: Math.round(ponto.x),
      y: Math.round(ponto.y - (campos.tamanho ?? TEXTO_TAMANHO) / 2),
      ...campos,
    });
    useQuadroStore.getState().editarTexto(id);
  }

  /**
   * Fecha a seta em curso na ponta que este ponto der: o encaixe mirado, o que
   * houver embaixo, ou um ponto solto na folha.
   *
   * Recusada -- duas pontas na mesma coisa, ou seta idêntica a uma que já
   * existe --, a ferramenta FICA na mão: nada foi colocado, e largá-la aqui
   * puniria o mestre por um gesto que não chegou a acontecer.
   */
  function fecharSeta(de: PontaDeLigacao, fim: Vec) {
    const quadro = useQuadroStore.getState();
    quadro.largarSeta();

    const para = pontaEm(scene, fim, RAIO_DE_ENCAIXE_PX / scale);

    // Duas pontas soltas quase no mesmo lugar não são uma seta, são um ponto.
    // Só quando as DUAS estão soltas: uma seta curtinha entre dois postits
    // vizinhos é legítima, e o que se quer barrar é o clique repetido no vazio.
    if (
      !ancorada(de) &&
      !ancorada(para) &&
      Math.hypot(para.x - de.x, para.y - de.y) < ARRASTO_MINIMO_DA_SETA
    )
      return;

    const id = addLigacao(scene.id, de, para, {
      ...(padraoDoQuadro().aMao ? { aMao: true as const } : {}),
    });
    if (!id) return;

    quadro.selecionarLigacao(id);
    setTool("select");
  }

  /** Fecha o laço numa área da cena. Menos de três vértices não é região. */
  function fecharLaco(pontos: Vec[]) {
    setLaco(null);
    if (pontos.length < 3) return;

    const area = areaDoPoligono(pontos);

    // O mesmo gesto, dois destinos: quem decide é a ferramenta na mão. O laço
    // desenha uma REGIÃO, e o que essa região significa -- esconder ou parar o
    // sol -- é a pergunta que a pílula já respondeu.
    if (tool === "parede") {
      selectParede(
        addParede(scene.id, {
          ...area,
          formato: "poligono",
          ...camposDaParedeNova(paredeNova, "poligono"),
        }),
      );
      setTool("select");
      return;
    }

    if (tool === "efeito") {
      selectAreaDeEfeito(novaAreaDeEfeito({ ...area, formato: "poligono" }));
      setTool("select");
      return;
    }

    if (tool === "forma") {
      selectFormas([
        addForma(scene.id, {
          ...area,
          tipo: "poligono",
          rotation: 0,
          cor: corForma,
          espessura: espessuraForma,
          fundo: fundoForma,
          ...jeitoDaForma("poligono"),
        }),
      ]);
      // Larga a ferramenta, como as outras formas: a regra do Excalidraw, e a
      // razão dela está no cabeçalho da seta.
      setTool("select");
      return;
    }

    selectFog(novaNevoa(area));
    // Volta ao modo normal, como as outras áreas: o gesto seguinte é conferir
    // o que se escondeu, e não esconder mais um pedaço.
    setTool("select");
  }

  /**
   * Mais um vértice do laço -- ou o fecho, se o clique voltou ao primeiro.
   *
   * Clique a clique, e não arrasto: o contorno de uma sala tem cantos, e um
   * gesto contínuo obrigaria a mão a fazer o traço inteiro sem errar, de uma
   * vez só. Aqui cada canto é uma decisão, e Backspace desfaz a última.
   */
  function cravarVertice(ponto: Vec) {
    const novo = noPlano(ponto);

    if (!pontosDoLaco) {
      setLaco({ sceneId: scene.id, pontos: [novo] });
      return;
    }

    const primeiro = pontosDoLaco[0];
    const fechou =
      pontosDoLaco.length >= 3 &&
      Math.hypot(novo.x - primeiro.x, novo.y - primeiro.y) <
        RAIO_DE_FECHO_PX / scale;

    if (fechou) {
      fecharLaco(pontosDoLaco);
      return;
    }

    setLaco({ sceneId: scene.id, pontos: [...pontosDoLaco, novo] });
  }

  /** Arrasto no vazio: desenha área escondida (ferramenta névoa) ou marca vários. */
  function handleCanvasPointerDown(event: ReactPointerEvent) {
    // Consumido aqui, venha o que vier: é do pointerdown que acabou de passar
    // pelo item, e só dele.
    const travadoSob = travadoSobOClique.current;
    travadoSobOClique.current = null;

    if (event.button !== 0) {
      clear();
      return;
    }

    const anchor = toScene(event.clientX, event.clientY);

    // Clique no vazio dentro de uma câmera seleciona a câmera -- a menor que
    // contém o ponto, para a de dentro ganhar da de fora. Só com a ferramenta
    // de seleção: com lápis ou névoa na mão o clique é um traço.
    if (tool === "select") {
      // Clique no vazio larga também a seta selecionada, como larga os itens.
      // O texto sai junto com eles: agora é seleção de palco, e quem a limpa é
      // o `clear` lá embaixo.
      const quadro = useQuadroStore.getState();
      if (quadro.ligacaoSelecionadaId)
        useQuadroStore.setState({ ligacaoSelecionadaId: null });

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

    // Clique, como o ponto: a luz não tem tamanho, tem alcance, e o alcance se
    // ajusta no anel dela. Nasce SELECIONADA, e a ferramenta volta à seta --
    // é com a seta que o anel e o painel da cor respondem, e o gesto que
    // segue o de acender é justamente escolher a cor. Ver `PainelDaLuz`.
    if (tool === "luz") {
      selectLuz(
        addLuz(scene.id, {
          x: Math.round(anchor.x),
          y: Math.round(anchor.y),
          raio: RAIO_DA_LUZ_PADRAO,
          cor: CORES_DA_LUZ[0],
        }),
      );
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
      // O que o painel de texto escolheu, e a letra da campanha quando ele
      // não escolheu. Meia linha acima do ponto, na altura de quem vai nascer.
      const campos = camposDoTextoNovo();
      const id = addTexto(scene.id, {
        x: Math.round(anchor.x),
        y: Math.round(anchor.y - (campos.tamanho ?? TEXTO_TAMANHO) / 2),
        ...campos,
      });
      useQuadroStore.getState().editarTexto(id);
      setTool("select");
      return;
    }

    /**
     * Dois gestos para a mesma seta, e o mestre não precisa escolher entre
     * eles: ARRASTAR de um ponto até o outro faz a seta de uma vez, como
     * sempre fez, e CLICAR num ponto a deixa pendurada no cursor até o clique
     * da outra ponta. A única diferença entre os dois é quanto o ponteiro
     * andou antes de soltar.
     *
     * O clique existe porque o arrasto não cabe no quadro. A segunda ponta
     * costuma estar do outro lado da folha -- é isso que uma seta faz num
     * quadro, amarrar coisas distantes --, e um arrasto de ponta a ponta obriga
     * a atravessar a mesa com o botão preso, sem poder deslocar a cena no
     * meio. Com a seta pendurada, o caminho até a outra ponta é livre.
     *
     * Cada ponta prende-se ao PONTO DE ENCAIXE mirado, ao que houver embaixo,
     * ou fica solta na folha. É a mesma pergunta que a sombra respondeu
     * enquanto o ponteiro andava (ver `AncorasDeSeta`), refeita aqui no ponto
     * em que o botão desceu: as duas têm de concordar, e a única maneira de
     * garantir isso é a conta ser a mesma.
     *
     * Feita a seta, a ferramenta SE LARGA, como todas as outras do palco.
     * Ficava na mão, com o argumento de que amarrar cinco ideias seguidas é o
     * gesto normal num quadro -- e o argumento caiu na prática: o gesto
     * seguinte a puxar uma seta é quase sempre mexer no que ela liga, e com a
     * ferramenta presa esse arrasto virava outra seta por cima. É a regra do
     * Excalidraw, e agora vale para as cinco: alfinete, postit, texto, forma e
     * seta.
     */
    if (tool === "ligacao") {
      const quadro = useQuadroStore.getState();

      // A seta já estava pendurada no cursor: este clique é o da outra ponta.
      if (quadro.setaEmCurso) {
        fecharSeta(quadro.setaEmCurso.de, anchor);
        return;
      }

      const de = pontaEm(scene, anchor, RAIO_DE_ENCAIXE_PX / scale);
      quadro.comecarSeta(de);

      startDrag(event, {
        // Quem desenha a seta enquanto ela procura a outra ponta é a camada
        // das âncoras, que ouve o ponteiro no documento e escreve direto no
        // `<line>`. Daqui só interessa onde o botão subiu.
        onMove: () => undefined,
        onEnd: (native) => {
          const fim = toScene(native.clientX, native.clientY);
          // Clique, e não arrasto: a seta FICA na mão, esperando o próximo.
          if (
            Math.hypot(fim.x - anchor.x, fim.y - anchor.y) <
            ARRASTO_MINIMO_DA_SETA
          )
            return;
          fecharSeta(de, fim);
        },
      });
      return;
    }

    if (tool === "regua") {
      medir(event, anchor);
      return;
    }

    if (tool === "parede") {
      erguerParede(event, anchor);
      return;
    }

    if (tool === "porta") {
      tracarPorta(event, anchor);
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

    if (tool === "borrachaDaNevoa") {
      furarNevoa(event, anchor);
      return;
    }

    if (tool === "fog" || tool === "efeito") {
      // A área de efeito desenha como a escondida: a mesma caixa, o mesmo
      // formato. Muda só o que ela vira no fim do gesto.
      const formato = tool === "fog" ? formatoDeArea : formatoDoEfeito;

      // A área LIVRE não é arrasto: ela se desenha vértice a vértice, e o
      // gesto todo acontece em cliques. Ver `cravarVertice`.
      if (formato === "poligono") {
        cravarVertice(anchor);
        return;
      }

      // Shift iguala os lados, como na forma do quadro: é assim que saem o
      // quadrado e o círculo, e é o mesmo teclado de todo editor.
      const travado = (ponto: Vec, shift: boolean) => {
        if (!shift) return ponto;

        const lado = Math.max(
          Math.abs(ponto.x - anchor.x),
          Math.abs(ponto.y - anchor.y),
        );

        return {
          x: anchor.x + Math.sign(ponto.x - anchor.x) * lado,
          y: anchor.y + Math.sign(ponto.y - anchor.y) * lado,
        };
      };

      startDrag(event, {
        onMove: (delta, native) =>
          setMarquee(
            boundsFromPoints(
              anchor,
              travado(
                { x: anchor.x + delta.x, y: anchor.y + delta.y },
                native.shiftKey,
              ),
            ),
          ),
        onEnd: (native) => {
          setMarquee(null);

          const area = boundsFromPoints(
            anchor,
            travado(toScene(native.clientX, native.clientY), native.shiftKey),
          );
          const box = boundsToBox(area);
          // Clique sem arrasto criaria uma área invisível impossível de pegar.
          if (box.width < MIN_ITEM_SIZE || box.height < MIN_ITEM_SIZE) return;

          const caixa = {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
            formato,
          };
          if (tool === "efeito") selectAreaDeEfeito(novaAreaDeEfeito(caixa));
          else selectFog(novaNevoa(caixa));
          // Volta ao modo normal: desenhar duas áreas seguidas é raro, e ficar
          // preso na ferramenta faz o mestre cobrir a cena por acidente.
          setTool("select");
        },
      });

      return;
    }

    /**
     * A forma do quadro: arrasto de canto a canto, como a névoa -- ela tem
     * tamanho, e pedir um clique deixaria o mestre sem dizer qual.
     *
     * Shift iguala os lados, e é assim que saem o quadrado e o círculo: a
     * ferramenta oferece retângulo e elipse porque a caixa livre é o caso
     * comum, e travar a proporção é a exceção que o teclado resolve -- mesmo
     * gesto do Excalidraw e do Figma.
     */
    if (tool === "forma") {
      // O laço não é arrasto, nas três naturezas: ele se desenha vértice a
      // vértice. Ver `cravarVertice`.
      if (tipoDeForma === "poligono") {
        cravarVertice(anchor);
        return;
      }

      const travado = (ponto: { x: number; y: number }, shift: boolean) => {
        if (!shift) return ponto;
        const lado = Math.max(
          Math.abs(ponto.x - anchor.x),
          Math.abs(ponto.y - anchor.y),
        );
        return {
          x: anchor.x + Math.sign(ponto.x - anchor.x) * lado,
          y: anchor.y + Math.sign(ponto.y - anchor.y) * lado,
        };
      };

      /**
       * A forma que este arrasto produz, do começo ao fim.
       *
       * Uma função só, e é o que garante que a PRÉVIA seja a forma: o gesto
       * mostrava a área de seleção enquanto o botão estava preso e só montava
       * a forma no soltar, então quem ia desenhar um círculo via um retângulo
       * azul até o fim -- sem a cor, sem a espessura e sem saber se a linha
       * descia ou subia. Agora as duas saem daqui.
       */
      const rascunho = (fim: { x: number; y: number }): NewForma => {
        const box = boundsToBox(boundsFromPoints(anchor, fim));
        return {
          tipo: tipoDeForma,
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
          rotation: 0,
          cor: corForma,
          espessura: espessuraForma,
          fundo: fundoForma,
          ...jeitoDaForma(tipoDeForma),
          // A linha desce ou sobe conforme o arrasto: é a única coisa que a
          // caixa sozinha não conta. Ver `Forma`.
          ...((fim.x - anchor.x) * (fim.y - anchor.y) < 0
            ? { diagonal: "secundaria" as const }
            : {}),
        };
      };

      startDrag(event, {
        onMove: (delta, native) =>
          setRascunhoDaForma(
            rascunho(
              travado(
                { x: anchor.x + delta.x, y: anchor.y + delta.y },
                native.shiftKey,
              ),
            ),
          ),
        onEnd: (native) => {
          setRascunhoDaForma(null);

          const fim = travado(
            toScene(native.clientX, native.clientY),
            native.shiftKey,
          );
          const forma = rascunho(fim);
          // Pela DIAGONAL, e não pelos dois lados: uma linha horizontal tem
          // altura zero e é uma forma legítima; o que não é forma é o clique
          // sem arrasto.
          if (Math.hypot(forma.width, forma.height) < MIN_ITEM_SIZE) return;

          selectFormas([addForma(scene.id, forma)]);

          // Volta ao modo normal, como a névoa: desenhar duas formas seguidas é
          // raro, e ficar preso na ferramenta faz o mestre riscar o quadro por
          // acidente ao tentar mover o que acabou de desenhar.
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

      // As teclas do começo do gesto, e não de cada quadro: é como o Shift do
      // marquee funciona, e o plugin lê uma coisa só.
      const teclas = {
        shift: event.shiftKey,
        ctrl: event.ctrlKey || event.metaKey,
        alt: event.altKey,
      };

      // As duas formas, e o plugin escolhe qual implementa. Arrasto vence
      // quando ele oferece os dois: `aoClicar` dispararia no começo do gesto e
      // o mestre veria a ação acontecer antes de soltar.
      if (registrada.aoArrastar) {
        startDrag(event, {
          onMove: (delta) => {
            const ponto = { x: anchor.x + delta.x, y: anchor.y + delta.y };
            setMarquee(boundsFromPoints(anchor, ponto));
            // A prévia do plugin, se ele quiser desenhar a dele. Contido: um
            // `aoMover` que estoura não pode derrubar o gesto do mestre.
            try {
              registrada.aoMover?.(
                { x: Math.round(ponto.x), y: Math.round(ponto.y) },
                teclas,
              );
            } catch {
              // O erro é do plugin, e aparece no `aoArrastar` se persistir.
            }
          },
          onEnd: (native) => {
            setMarquee(null);

            const box = boundsToBox(
              boundsFromPoints(anchor, toScene(native.clientX, native.clientY)),
            );

            registrada.aoArrastar?.(
              {
                x: Math.round(box.x),
                y: Math.round(box.y),
                largura: Math.round(box.width),
                altura: Math.round(box.height),
              },
              teclas,
            );
          },
        });

        return;
      }

      registrada.aoClicar?.(
        {
          x: Math.round(anchor.x),
          y: Math.round(anchor.y),
        },
        teclas,
      );

      return;
    }

    /**
     * O clique no vazio que cai dentro de uma parede pega a parede.
     *
     * Era o corpo dela que recebia o ponteiro, por cima de tudo -- e a parede
     * coberta desenhada sobre o prédio inteiro prendia cada token lá dentro.
     * Agora o corpo é atravessável (ver `ParedeLayer`), o token e a área
     * pegam o clique primeiro, e só o que chega até aqui pergunta pela parede.
     * A de cima ganha: é a última da lista, a última desenhada.
     *
     * Shift fica com a seleção por área, que é o gesto dele, e ela começa
     * dentro de uma sala tanto quanto fora. E com um token travado sob o
     * clique a parede também não entra: o boss travado dentro do prédio seria
     * trocado pelo prédio inteiro.
     */
    if (tool === "select" && !event.shiftKey && !travadoSob) {
      const parede = [...(scene.paredes ?? [])]
        .reverse()
        .find((candidata) => pontoNaParede(candidata, anchor));

      if (parede) {
        selectParede(parede.id);
        // Travada, só seleciona: o arrasto que a movia é justamente o que o
        // cadeado existe para impedir.
        if (parede.locked) return;
        const origem = { x: parede.x, y: parede.y };

        startDrag(event, {
          onMove: (delta) =>
            updateParede(scene.id, parede.id, {
              x: origem.x + delta.x,
              y: origem.y + delta.y,
            }),
        });

        return;
      }
    }

    const additive = event.shiftKey;
    // Retrato da seleção antes do arrasto: com Shift a área soma ao que já
    // estava marcado, sem Shift começa do zero.
    const baseIds = additive ? selectedIds : [];
    const baseTextoIds = additive ? selectedTextoIds : [];
    const baseFormaIds = additive ? selectedFormaIds : [];
    const basePostitIds = additive ? selectedPostitIds : [];
    const baseDocumentoIds = additive ? selectedDocumentoIds : [];
    const baseTracoIds = additive ? selectedTracoIds : [];
    if (!additive) clear();

    startDrag(event, {
      onMove: (delta) => {
        const area = boundsFromPoints(anchor, {
          x: anchor.x + delta.x,
          y: anchor.y + delta.y,
        });
        setMarquee(area);

        const hits = visiveis
          .filter(
            (item) => !item.locked && boundsIntersect(itemBounds(item), area),
          )
          .map((item) => item.id);

        // O texto solto entra no mesmo laço: no quadro, o que está dentro da
        // área é quase sempre letra, e uma seleção que pulasse as frases
        // deixaria o gesto sem uso justo onde ele mais serve. A caixa é a
        // MEDIDA, a mesma que a seta mira -- encostar já inclui.
        const textosDentro = (scene.textos ?? [])
          .filter((texto) => boundsIntersect(caixaDoTexto(texto), area))
          .map((texto) => texto.id);

        // E as formas, pela caixa girada delas -- a mesma conta do item.
        const formasDentro = (scene.formas ?? [])
          .filter((forma) => boundsIntersect(itemBounds(forma), area))
          .map((forma) => forma.id);

        // Papel e cartão pela caixa deles, que é a mesma coisa que se vê.
        const postitsDentro = (scene.postits ?? [])
          .filter((postit) => boundsIntersect(caixaDoPapel(postit), area))
          .map((postit) => postit.id);

        const documentosDentro = (scene.documentos ?? [])
          .filter((documento) =>
            boundsIntersect(caixaDoPapel(documento), area),
          )
          .map((documento) => documento.id);

        /**
         * O risco pela CAIXA dos pontos, e não ponto a ponto.
         *
         * A caixa pega mais do que a linha -- um risco em diagonal é laçado
         * por uma área que passa longe da tinta --, e é o certo aqui: é a
         * mesma medida do resto do palco, e um teste segmento a segmento
         * custaria as duzentas amostras de cada risco a cada quadro do
         * arrasto, com a área crescendo debaixo da mão.
         */
        const tracosDentro = (scene.tracos ?? [])
          .filter((traco) => {
            const caixa = caixaDoTraco(traco);
            return caixa !== null && boundsIntersect(caixa, area);
          })
          .map((traco) => traco.id);

        selectMisto({
          itens: [...new Set([...baseIds, ...hits])],
          textos: [...new Set([...baseTextoIds, ...textosDentro])],
          formas: [...new Set([...baseFormaIds, ...formasDentro])],
          postits: [...new Set([...basePostitIds, ...postitsDentro])],
          documentos: [
            ...new Set([...baseDocumentoIds, ...documentosDentro]),
          ],
          tracos: [...new Set([...baseTracoIds, ...tracosDentro])],
        });
      },
      onEnd: (native) => {
        setMarquee(null);

        // A mão não andou e havia um travado embaixo: foi um clique NELE.
        if (!travadoSob) return;
        const fim = toScene(native.clientX, native.clientY);
        if (
          Math.hypot(fim.x - anchor.x, fim.y - anchor.y) * scale <
          CLIQUE_NO_TRAVADO_PX
        )
          select(travadoSob);
      },
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
    fecharLaco,
    item: handleItemPointerDown,
    fog: handleFogPointerDown,
    areaDeEfeito: handleAreaDeEfeitoPointerDown,
    texto: handleTextoPointerDown,
    forma: handleFormaPointerDown,
    papel: handlePapelPointerDown,
    pega: handlePegaPointerDown,
  });

  useEffect(() => {
    handlersRef.current = {
      fecharLaco,
      item: handleItemPointerDown,
      fog: handleFogPointerDown,
      areaDeEfeito: handleAreaDeEfeitoPointerDown,
        texto: handleTextoPointerDown,
      forma: handleFormaPointerDown,
      papel: handlePapelPointerDown,
      pega: handlePegaPointerDown,
    };
  });

  const onItemPointerDown = useCallback(
    (event: ReactPointerEvent, item: CanvasItem) => {
      handlersRef.current.item(event, item);
    },
    [],
  );

  /**
   * O laço em curso: a ponta que segue o cursor e as teclas que o terminam.
   *
   * A ponta vai pelo DOM, como a prévia do risco: ela anda a cada movimento do
   * mouse, e um estado por movimento re-renderizaria o palco inteiro -- com o
   * mapa, os tokens e as camadas dentro -- enquanto o mestre contorna uma sala.
   *
   * As teclas são ouvidas na CAPTURA, antes dos atalhos do mestre: com um laço
   * aberto, Backspace tira o último vértice em vez de apagar o que está
   * selecionado, e Esc desiste do laço em vez de largar a ferramenta. Sem isso,
   * as duas teclas fariam duas coisas ao mesmo tempo.
   */
  useEffect(() => {
    if (!pontosDoLaco) return;

    const aoMover = (evento: PointerEvent) => {
      const ponta = noPlano(toScene(evento.clientX, evento.clientY));

      previaDoLaco.current?.setAttribute(
        "points",
        [...pontosDoLaco, ponta]
          .map((ponto) => `${ponto.x},${ponto.y}`)
          .join(" "),
      );
    };

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Enter") {
        evento.preventDefault();
        evento.stopPropagation();
        handlersRef.current.fecharLaco(pontosDoLaco);
        return;
      }

      if (evento.key === "Escape") {
        evento.stopPropagation();
        setLaco(null);
        return;
      }

      if (evento.key === "Backspace" || evento.key === "Delete") {
        evento.preventDefault();
        evento.stopPropagation();
        setLaco(
          pontosDoLaco.length > 1
            ? { sceneId: scene.id, pontos: pontosDoLaco.slice(0, -1) }
            : null,
        );
      }
    };

    window.addEventListener("pointermove", aoMover);
    window.addEventListener("keydown", aoTeclar, true);

    return () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("keydown", aoTeclar, true);
    };
  }, [pontosDoLaco, scene.id, toScene]);

  /**
   * Trocar de ferramenta ou de formato larga o laço.
   *
   * Assinando o store, e não por efeito sobre a ferramenta do render: o que
   * interessa aqui é o INSTANTE da troca, e um efeito que zera estado a cada
   * render encadeia renders para dizer "continua nulo". Trocar de cena é outro
   * caso, e quem resolve é o `sceneId` guardado no laço.
   */
  useEffect(
    () =>
      useToolStore.subscribe((estado, anterior) => {
        if (
          estado.tool !== anterior.tool ||
          estado.formatoDeArea !== anterior.formatoDeArea ||
          estado.formatoDoEfeito !== anterior.formatoDoEfeito
        )
          setLaco(null);
      }),
    [],
  );

  const onFogPointerDown = useCallback(
    (event: ReactPointerEvent, region: FogRegion) => {
      handlersRef.current.fog(event, region);
    },
    [],
  );

  const onAreaDeEfeitoPointerDown = useCallback(
    (event: ReactPointerEvent, area: AreaDeEfeito) => {
      handlersRef.current.areaDeEfeito(event, area);
    },
    [],
  );

  // Texto e forma entram no mesmo envelope, e pelo mesmo motivo do item: as
  // camadas deles são `memo`, e um handler novo por render anularia a memo --
  // mexer num texto redesenharia os trinta da folha. Ver `TextoSolto`.
  const onTextoPointerDown = useCallback(
    (event: ReactPointerEvent, texto: Texto) => {
      handlersRef.current.texto(event, texto);
    },
    [],
  );

  // Papel e cartão pelo mesmo envelope: as camadas dos dois moram na margem,
  // por portal, e um handler novo por render redesenharia os vinte cartões de
  // um quadro a cada arrasto de token.
  const onPostitPointerDown = useCallback(
    (event: ReactPointerEvent, postit: Postit) => {
      handlersRef.current.papel(event, { tipo: "postit", postit });
    },
    [],
  );

  const onDocumentoPointerDown = useCallback(
    (event: ReactPointerEvent, documento: Documento) => {
      handlersRef.current.papel(event, { tipo: "documento", documento });
    },
    [],
  );

  const onPegaPointerDown = useCallback((event: ReactPointerEvent) => {
    handlersRef.current.pega(event);
  }, []);

  const onFormaPointerDown = useCallback(
    (event: ReactPointerEvent, forma: Forma) => {
      handlersRef.current.forma(event, forma);
    },
    [],
  );

  // Espaço tem precedência sobre a ferramenta: segurar espaço desloca a cena,
  // mesmo com a névoa escolhida.
  const drawingFog = (tool === "fog" || tool === "efeito") && !panMode;
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
        tool === "forma" ||
        tool === "lapis" ||
        tool === "borracha" ||
        tool === "borrachaDaNevoa" ||
        tool === "regua" ||
        tool === "parede" ||
        tool === "luz" ||
        tool === "porta" ||
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
            // Só a posição de tela, sem conta nem estado: é o que o N lê para
            // nascer a câmera sob o mouse.
            onPointerMove: (evento) => anotarPonteiro(evento.clientX, evento.clientY),
            onPointerLeave: esquecerPonteiro,
            onDoubleClick:
              panMode || !ehQuadro(scene)
                ? undefined
                : handleCanvasDoubleClick,
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
          portaNaMao={gestoPorta?.portaId}
          pings={pings}
          fichas={fichasNoPalco}
          efeitos={efeitosNoPalco}
          // Sem retratos: eles moram no quadro da janela Retratos, e é lá que
          // o dado cai no rosto de quem rolou. Sobre o mapa, as cabeças
          // disputavam a atenção com o que o mestre estava montando.
          // Com ferramenta de mira escolhida, o gesto sempre vale para ela:
          // repassar os handlers faria clicar sobre um item existente virar
          // "mover item".
          onItemPointerDown={panMode || aiming ? undefined : onItemPointerDown}
          onFogPointerDown={panMode || aiming ? undefined : onFogPointerDown}
          onAreaDeEfeitoPointerDown={
            panMode || aiming ? undefined : onAreaDeEfeitoPointerDown
          }
          animarSo={efeitosAnimados}
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

      {/* O botão direito SEGURADO abre os pings; o clique curto continua sendo
          o menu do palco. O ping nasce aqui mesmo, na bandeja que o quadro
          publica -- sem passar pelo daemon, porque o mestre é quem publica. */}
      <RodaDePing
        modo="mestre"
        onEscolher={(tipo: TipoDePing, ponto: Vec) =>
          usePingsStore.getState().registrar({
            id: novoId(),
            tipo,
            cenaId: scene.id,
            x: ponto.x,
            y: ponto.y,
            autorId: AUTOR_MESTRE,
            autor: texto.mestreStage.autorDoPing,
            quando: Date.now(),
          })
        }
      />

      {/* Irmã do `PinLayer` e fora do `SceneLayer` pela mesma razão: a parede
          desenhada é preparação do mestre, e o `SceneLayer` é o componente que
          desenha na TV. O que a mesa recebe é a SOMBRA, não a parede que a
          fez. Ver `ParedeLayer` e `SombraLayer`. */}
      <ParedeLayer scene={scene} fantasma={rascunhoDaParede} />

      {/* A folha, a dobradiça e a alça de cada porta. Fora do `SceneLayer`
          pela razão da parede: a mesa vê a luz passar, e não a porta. */}
      <PortaMarcadores
        scene={scene}
        panMode={panMode}
        fantasma={rascunhoDaPorta}
      />

      {/* O ponto e o alcance de cada luz cravada. Fora do `SceneLayer` pela
          razão da parede: a mesa vê a luz, não o marcador dela. */}
      <LuzMarcadores scene={scene} panMode={panMode} />
      <PainelDaLuz scene={scene} panMode={panMode} />

      {/* Irmã do `PinLayer`, e fora do `SceneLayer` pela mesma razão: o texto
          de um postit é preparação do mestre, e o `SceneLayer` é o mesmo
          componente que desenha na TV. */}
      <PostitLayer
        scene={scene}
        panMode={panMode}
        onPostitPointerDown={onPostitPointerDown}
      />

      {/* O que a área laçou e só anda, contornado, com a caixa que o arrasta.
          Na margem e não aqui: o papel pode estar fora do mapa, e um contorno
          fora da caixa do plano derruba a pintura do palco. */}
      <SelecaoDaMargem
        postits={selectedPostits}
        documentos={selectedDocumentos}
        tracos={selectedTracos}
        caixa={caixaSemAlca}
        panMode={panMode}
        onPegaPointerDown={onPegaPointerDown}
      />

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
      <FormaLayer
        scene={scene}
        panMode={panMode}
        onFormaPointerDown={onFormaPointerDown}
      />
      <TextoLayer
        scene={scene}
        panMode={panMode}
        onTextoPointerDown={onTextoPointerDown}
      />
      {/* A lista do BOARD, e não a da cena com o gesto aplicado: durante o
          arrasto ela não muda de identidade, e a camada não reconcilia os
          sessenta cartões a cada quadro -- cada cartão lê o próprio patch
          do gesto. Ver `DocumentoLayer`. */}
      <DocumentoLayer
        sceneId={scene.id}
        documentos={cenaDoBoard.documentos}
        panMode={panMode}
        onDocumentoPointerDown={onDocumentoPointerDown}
      />
      <LigacaoLayer scene={scene} />

      {/* Os pontos de encaixe do que está sob o cursor e a sombra da seta em
          curso. Irmã do fantasma do postit, e pela mesma razão só com a
          ferramenta na mão e nunca com espaço segurado: aí o gesto é da
          câmera, e acender quatro pontos no meio de um deslocamento seria
          ruído. */}
      {tool === "ligacao" && !panMode ? <AncorasDeSeta scene={scene} /> : null}

      {/* Fora do `SceneLayer` pela mesma razão do `PinLayer`: hoje o dado é só
          do mestre. Dentro dele, os dados apareceriam na TV — e a decisão de
          mostrar a rolagem para a mesa é do mestre, não deste arquivo.

          Dentro do plano, porém: o dado é jogado SOBRE o mapa, e tem de
          acompanhar zoom e deslocamento como a névoa e os riscos acompanham. */}
      <DadoLayer quadro={ehQuadro(scene)} />

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
      {groupBounds && semAlca === 0
        ? [...selectedItems, ...selectedFormas].map((item) => {
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

      {/* Papel, cartão e risco na mão tiram as ALÇAS do ar: nenhum dos três
          escala nem gira, e um gizmo que só transformasse metade do que está
          marcado mentiria sobre o que o gesto faz. Sobra a caixa da margem,
          que arrasta. Ver `grupo-sem-alca`. */}
      {groupBounds && !panMode && semAlca === 0 ? (
        <TransformHandles
          box={{ ...boundsToBox(groupBounds), rotation: 0 }}
          // Só cantos e escala uniforme: escalar um item girado de forma
          // diferente em cada eixo exigiria cisalhamento, que o modelo de item
          // não representa.
          handles={CORNER_HANDLES}
          keepAspect
          // Contorno ligado: era só os cantos, e a área do grupo não se lia.
          onGestureStart={() => {
            // Só os livres entram no gesto: o travado da mão fica onde está
            // enquanto o resto cresce e gira em volta dele.
            groupSnapshot.current = {
              items: selectedItems.filter(livre),
              textos: selectedTextos.filter(livre),
              formas: selectedFormas.filter(livre),
              bounds: groupBounds,
            };
          }}
          onChange={(patch) => {
            const frozen = groupSnapshot.current;
            if (!frozen) return;

            // Girar e escalar chegam pelo mesmo callback: `rotation` só vem no
            // gesto de rotação, e a caixa só no de redimensionamento.
            if (patch.rotation !== undefined) {
              const centro = boundsCenter(frozen.bounds);

              moverNoGesto(
                scene.id,
                rotateGroup(frozen.items, centro, patch.rotation),
                // O texto orbita o mesmo centro e vira o mesmo tanto: é o que
                // mantém a frase legível em relação à imagem ao lado dela.
                girarTextos(frozen.textos, centro, patch.rotation),
                // A forma tem a geometria do item: mesma função, outra lista.
                rotateGroup(frozen.formas, centro, patch.rotation),
              );
              return;
            }

            if (patch.x === undefined || patch.width === undefined) return;

            const alvo = boundsFromBox({
              x: patch.x,
              y: patch.y ?? frozen.bounds.minY,
              width: patch.width,
              height: patch.height ?? 0,
            });

            moverNoGesto(
              scene.id,
              scaleGroup(frozen.items, frozen.bounds, alvo),
              // A fonte cresce no fator do grupo: um texto não tem largura
              // própria, e esticá-lo seria deformar a letra. Ver
              // `escalarTextos`.
              escalarTextos(frozen.textos, frozen.bounds, alvo),
              scaleGroup(frozen.formas, frozen.bounds, alvo),
            );
          }}
          onGestureEnd={() =>
            terminarGesto(
              scene.id,
              useGestoStore.getState().patches ?? [],
              useGestoStore.getState().textos ?? [],
              useGestoStore.getState().formas ?? [],
            )
          }
          // Aceso só com TUDO travado: basta um livre para o toque travar o
          // resto. Ver `toggleSelectionLock`.
          trava={{
            travada: [...selectedItems, ...selectedTextos, ...selectedFormas]
              .every((coisa) => coisa.locked),
            onToggle: toggleSelectionLock,
          }}
          onDelete={removeSelection}
        />
      ) : null}

      {/* Proporção travada: item de cena é sempre imagem, e esticar um eixo só
          deforma o desenho. Só cantos, pelo mesmo motivo — alça de aresta move
          um eixo, e travar a razão nela faria o item crescer sem o mouse pedir. */}
      {single && !panMode ? (
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
          onChange={(patch) => moverNoGesto(scene.id, [{ id: single.id, patch }])}
          onGestureEnd={() =>
            terminarGesto(scene.id, useGestoStore.getState().patches ?? [])
          }
          // Travado não espelha: `flipPatches` já o pulava, e o botão ficaria
          // mudo na fileira.
          onFlip={single.locked ? undefined : () => flipSelection("x")}
          // `setSelectionOpacity` e não `updateItem`: a seleção aqui é este
          // item só, e a regra de que 100% APAGA o campo mora numa função só.
          opacidade={{
            valor: single.opacity ?? 1,
            onChange: setSelectionOpacity,
          }}
          // Token e mobília, os dois: para o sol não há diferença entre o
          // boneco e o barril, só entre o que está em pé e o que é visto de
          // cima. Ver `SombraDoItem`.
          sombra={sombraDoSelecionado}
          // As condições, aqui como a opacidade e a sombra: as do objeto, no
          // item da cena; as do token, no personagem -- a mesma lista da ficha.
          condicoes={
            single.personagemId ? (
              <PainelDeCondicoesDoPersonagem personagemId={single.personagemId} />
            ) : (
              <PainelDeCondicoesDoObjeto item={single} />
            )
          }
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
          trava={{ travada: single.locked, onToggle: toggleSelectionLock }}
          onDelete={removeSelection}
        />
      ) : null}

      {/* O gizmo da PAREDE, irmão do da área e pela mesma razão: a caixa é a
          verdade dela nos quatro formatos, então mover, escalar e girar são o
          mesmo controle que já existe. Foi o que a caixa comprou -- a primeira
          versão da parede era um segmento cru, e não tinha gizmo nenhum. */}
      {selectedParede && !panMode ? (
        <>
          <TransformHandles
            box={{ ...selectedParede, rotation: selectedParede.rotation ?? 0 }}
            onChange={(patch) =>
              updateParede(scene.id, selectedParede.id, patch)
            }
            // Quão alto o tijolo sobe. Em metros no controle e em unidade de
            // cena na cena: ver `UNIDADES_POR_METRO`.
            altura={{
              metros: alturaDaParede(selectedParede) / UNIDADES_POR_METRO,
              onChange: (metros) =>
                updateParede(scene.id, selectedParede.id, {
                  // `undefined` no valor padrão, como em toda opcional daqui:
                  // parede de dois metros é a parede de sempre, e não precisa
                  // de campo na cena.
                  altura:
                    metros === METROS_DA_PAREDE_PADRAO
                      ? undefined
                      : metros * UNIDADES_POR_METRO,
                }),
            }}
            // O teto, só na parede que cerca uma área: é ele que decide se o
            // sol entra no miolo dela. Na `linha` não há miolo, e o botão não
            // aparece. Ver `semTeto`.
            teto={
              selectedParede.formato === "linha"
                ? undefined
                : {
                    coberta: !selectedParede.semTeto,
                    onToggle: () =>
                      updateParede(scene.id, selectedParede.id, {
                        // `undefined` e não `false`: coberta é o padrão, e o
                        // campo ausente é como ele se escreve na cena.
                        semTeto: selectedParede.semTeto ? undefined : true,
                      }),
                  }
            }
            trava={{
              travada: Boolean(selectedParede.locked),
              onToggle: toggleSelectionLock,
            }}
            onDelete={removeParedeSelection}
          />

          {/* As alças de vértice, só do laço: nos outros três o contorno É a
              caixa, e o gizmo já a controla inteira. Travada, nenhuma. */}
          {selectedParede.formato === "poligono" && !selectedParede.locked ? (
            <AlcasDaArea
              region={selectedParede}
              onChange={(patch) =>
                updateParede(scene.id, selectedParede.id, patch)
              }
            />
          ) : null}
        </>
      ) : null}

      {/* A fileira da porta: abrir e fechar, altura, cadeado e lixeira. Só
          a fileira -- sem caixa, alças nem giro: as alças da porta são as
          dela, em volta da dobradiça. Ver `PortaMarcadores`. */}
      {selectedPorta && caixaDaPortaNaMao && !panMode ? (
        <TransformHandles
          key={selectedPorta.id}
          box={{ ...caixaDaPortaNaMao, rotation: 0 }}
          handles={[]}
          rotatable={false}
          outline={false}
          onChange={() => {}}
          porta={{
            aberta: selectedPorta.abertura !== undefined,
            onToggle: () =>
              updatePorta(scene.id, selectedPorta.id, alternarPorta(selectedPorta)),
          }}
          altura={{
            doQue: "porta",
            metros: (selectedPorta.altura ?? ALTURA_DA_PAREDE) / UNIDADES_POR_METRO,
            onChange: (metros) =>
              updatePorta(scene.id, selectedPorta.id, {
                // Ausente na altura da parede, como nela: é a porta de sempre.
                altura:
                  metros === METROS_DA_PAREDE_PADRAO
                    ? undefined
                    : metros * UNIDADES_POR_METRO,
              }),
          }}
          trava={{
            travada: Boolean(selectedPorta.locked),
            onToggle: toggleSelectionLock,
          }}
          onDelete={removePortaSelection}
        />
      ) : null}

      {/* As alças de vértice da forma em LAÇO. A caixa dela já é governada
          pelo gizmo do palco, junto com o resto da seleção; o que falta é
          mexer num canto, e é a mesma camada das outras duas. */}
      {selectedFormas.length === 1 &&
      selectedFormas[0]!.tipo === "poligono" &&
      !selectedFormas[0]!.locked &&
      !panMode ? (
        <AlcasDaArea
          region={selectedFormas[0]!}
          onChange={(patch) =>
            updateForma(scene.id, selectedFormas[0]!.id, patch)
          }
        />
      ) : null}

      {selectedFog && !panMode ? (
        <>
          <TransformHandles
            box={{ ...selectedFog, rotation: selectedFog.rotation ?? 0 }}
            // Com a borracha na mão, nem alça nem giro: o canto da área é
            // justamente onde se passa a borracha, e a alça engoliria o
            // arrasto. Fica a fileira, que é por onde se sai.
            handles={furando ? SEM_ALCAS : undefined}
            rotatable={!furando}
            // Gira como o item: corredor, mesa e parede raramente correm no
            // eixo da tela, e sem giro cobrir um deles cobria meio mapa junto.
            onChange={(patch) => updateFog(scene.id, selectedFog.id, patch)}
            dinamica={{
              ligada: Boolean(selectedFog.dinamica),
              onToggle: () =>
                updateFog(scene.id, selectedFog.id, {
                  dinamica: selectedFog.dinamica ? undefined : true,
                }),
            }}
            // Travada não fura, como não move nem apaga.
            borracha={
              selectedFog.locked
                ? undefined
                : {
                    ativa: furando,
                    onToggle: () =>
                      setTool(furando ? "select" : "borrachaDaNevoa"),
                  }
            }
            trava={{
              travada: Boolean(selectedFog.locked),
              onToggle: toggleSelectionLock,
            }}
            onDelete={removeFogSelection}
          />

          {/* As alças de vértice, só da área recortada: nas outras duas o
              contorno É a caixa, e o gizmo já a controla inteira. Travada,
              nenhuma; com a borracha na mão, também não.

              O vértice que sai da caixa faz OUTRA caixa, e os furos, que são
              fração dela, pulariam junto: vão reescritos para a nova sem sair
              do lugar no mapa. Ver `furosNaCaixaNova`. */}
          {selectedFog.formato === "poligono" &&
          !selectedFog.locked &&
          !furando ? (
            <AlcasDaArea
              region={selectedFog}
              onChange={(patch) =>
                updateFog(scene.id, selectedFog.id, {
                  ...patch,
                  ...(selectedFog.furos?.length
                    ? {
                        furos: furosNaCaixaNova(
                          selectedFog,
                          { ...selectedFog, ...patch },
                          selectedFog.furos,
                        ),
                      }
                    : {}),
                })
              }
            />
          ) : null}

          {furando ? (
            <AnelDoPincel
              raio={raioDaBorrachaDaNevoa}
              noCentro={tamanhoEmAjuste}
              amostra={AMOSTRA_DA_BORRACHA}
            />
          ) : null}
        </>
      ) : null}

      {selectedAreaDeEfeito && !panMode ? (
        <>
          <TransformHandles
            box={{ ...selectedAreaDeEfeito, rotation: selectedAreaDeEfeito.rotation ?? 0 }}
            // Gira como a área escondida. O fogo não gira junto -- ele sobe --,
            // mas as casas que entram, sim. Ver `planoDaArea`.
            onChange={(patch) =>
              updateAreaDeEfeito(scene.id, selectedAreaDeEfeito.id, patch)
            }
            paleta={{
              titulo: texto.mestreStage.cor,
              // A cor DESTA área, quando o mestre escolheu uma. Ausente, ela
              // segue a do efeito -- e o primeiro botão da paleta volta a isso.
              cor: selectedAreaDeEfeito.cor,
              semFundo: true,
              onChange: ({ cor }) => {
                if (cor === undefined) return;
                updateAreaDeEfeito(scene.id, selectedAreaDeEfeito.id, {
                  cor: cor ?? undefined,
                });
              },
            }}
            // O efeito da área, no lugar das condições: é o que ela faz. Os
            // efeitos em área da campanha, ou nenhum. Ver `EscolhaDoEfeitoDaArea`.
            condicoes={
              <EscolhaDoEfeitoDaArea
                efeito={selectedAreaDeEfeito.efeito}
                onEscolher={(efeito) =>
                  updateAreaDeEfeito(scene.id, selectedAreaDeEfeito.id, { efeito })
                }
              />
            }
            botaoDoPainel={{ rotulo: texto.mestreStage.efeito, icone: WandSparkles }}
            mesa={{
              naMesa: Boolean(selectedAreaDeEfeito.naMesa),
              onToggle: () =>
                updateAreaDeEfeito(scene.id, selectedAreaDeEfeito.id, {
                  naMesa: selectedAreaDeEfeito.naMesa ? undefined : true,
                }),
            }}
            trava={{
              travada: Boolean(selectedAreaDeEfeito.locked),
              onToggle: toggleSelectionLock,
            }}
            onDelete={removeAreaDeEfeitoSelection}
          />

          {selectedAreaDeEfeito.formato === "poligono" && !selectedAreaDeEfeito.locked ? (
            <AlcasDaArea
              region={selectedAreaDeEfeito}
              onChange={(patch) =>
                updateAreaDeEfeito(scene.id, selectedAreaDeEfeito.id, patch)
              }
            />
          ) : null}
        </>
      ) : null}

      {/* O risco em curso, antes de virar traço da cena. Desenhado aqui e não
          na camada compartilhada porque ele não existe na cena ainda -- e a
          mesa não deve ver a linha crescendo. */}
      {/* O anel do lápis: a largura do risco, antes de riscar. Fica durante
          o risco também -- é a ponta da caneta. Com espaço segurado sai: a mão
          aberta não risca. */}
      {/* O anel da borracha dos riscos: o alcance dela, no modo pedaço e no
          inteiro. */}
      {tool === "borracha" && !panMode ? (
        <AnelDoPincel
          raio={raioDaBorracha}
          noCentro={tamanhoEmAjuste}
          amostra={AMOSTRA_DA_BORRACHA}
        />
      ) : null}

      {tool === "lapis" && !panMode ? (
        <AnelDoPincel
          raio={espessura / 2}
          // A régua de largura na mão: o anel vai para o meio do palco,
          // cheio, como o risco vai sair. Ver `tamanhoEmAjuste`.
          noCentro={tamanhoEmAjuste}
          amostra={{ cor, opacidade: opacidadeDoLapis }}
        />
      ) : null}

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
          {/* O mesmo `path` macio do risco gravado, e a mesma opacidade: a
              prévia é o risco, e soltar não pode mudar o desenho. */}
          <path
            ref={previa}
            fill="none"
            stroke={cor}
            strokeWidth={espessura}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={opacidadeDoLapis}
          />
        </svg>
      ) : null}

      {marquee ? (
        <MarqueeBox
          bounds={marquee}
          redondo={
            (tool === "fog" && formatoDeArea === "elipse") ||
            (tool === "efeito" && formatoDoEfeito === "elipse")
          }
        />
      ) : null}

      {/* O laço em curso, antes de virar área da cena. Aqui e não na camada
          compartilhada pela mesma razão do risco: ele ainda não existe na
          cena, e a mesa não deve ver o contorno sendo decidido.

          Do tamanho do plano e sem `overflow-visible`, com os vértices presos
          a ele: o que passa da caixa de um plano infla a camada composta e
          derruba a pintura do palco. Ver `noPlano`. */}
      {pontosDoLaco ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0"
          width={SCENE_WIDTH}
          height={SCENE_HEIGHT}
          // Acima da névoa (5000): o laço costuma ser desenhado ao lado de
          // áreas que já existem, e passar por baixo delas esconderia
          // justamente a linha que o mestre está mirando.
          style={{ zIndex: 5_500 }}
        >
          <polygon
            ref={previaDoLaco}
            points={pontosDoLaco
              .map((ponto) => `${ponto.x},${ponto.y}`)
              .join(" ")}
            fill="rgb(0 0 0 / 0.45)"
            stroke="rgb(255 255 255 / 0.85)"
            strokeWidth={1.5 / scale}
            strokeDasharray={`${6 / scale} ${4 / scale}`}
            strokeLinejoin="round"
          />

          {/* O PRIMEIRO vértice em destaque: é o alvo que fecha o laço, e sem
              marca não haveria como saber onde clicar para terminar. */}
          {pontosDoLaco.map((ponto, indice) => (
            <circle
              key={indice}
              cx={ponto.x}
              cy={ponto.y}
              r={(indice === 0 ? RAIO_DE_FECHO_PX / 2 : 3) / scale}
              fill={indice === 0 ? "var(--primary)" : "#fff"}
              stroke="rgb(0 0 0 / 0.6)"
              strokeWidth={1 / scale}
            />
          ))}
        </svg>
      ) : null}

      {/* A forma em arrasto, desenhada como ela vai ficar. Irmã do fantasma do
          postit, e pela mesma razão fora do `SceneLayer`: é decisão em
          andamento do mestre, e a TV só recebe o que foi decidido. */}
      <FormaFantasma forma={rascunhoDaForma} />
      <AlignmentGuides guides={guides} />

      {fantasmasVisiveis && scene.cameras && temCamera(scene) ? (
        <CamerasFantasma
          scene={scene}
          selecionadaId={selecionadaId}
          editavel={!panMode}
        />
      ) : null}

      {/* Espelhando o palco, a moldura 16:9 coincide com a tela: desenhá-la
          seria uma borda em volta do palco inteiro dizendo nada. A de outro
          formato não coincide -- a torre espelhada é uma faixa no meio da
          tela --, e sem a moldura o mestre não saberia o que a mesa vê. */}
      {selecionada &&
      !(espelhoMestre && temFormatoDaMesa(selecionada.viewport)) ? (
        <CameraFrame
          camera={selecionada}
          transmissao={transmissaoDaCamera(scene, selecionada.id, cenaNoAr)}
          cinegrafista={cinegrafista}
          // Com espaço segurado a moldura vira só informativa: o gesto pertence
          // ao deslocamento da cena.
          // No gesto, e não no board: a moldura anda leve e o board recebe no
          // soltar -- ou no ritmo do canal, se esta câmera está no ar.
          onChange={
            panMode
              ? undefined
              : (viewport) =>
                  moverCameraNoGesto(scene.id, selecionada.id, viewport)
          }
          onGestureEnd={terminarGestoDaCamera}
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
