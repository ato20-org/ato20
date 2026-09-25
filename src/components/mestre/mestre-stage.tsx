"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { AlcasDaArea } from "@/components/mestre/alcas-da-area";
import { DadoLayer } from "@/components/mestre/dado-layer";
import { PinLayer } from "@/components/mestre/pin-layer";
import { ParedeLayer } from "@/components/mestre/parede-layer";
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
import { contornoDosItens } from "@/lib/mestre/contorno-dos-itens";
import { uniaoDoRetrato } from "@/lib/mestre/unioes";
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
  alturaDaParede,
  METROS_DA_PAREDE_PADRAO,
  UNIDADES_POR_METRO,
} from "@/lib/geometry/sombra";
import { caixaDoTraco } from "@/lib/geometry/limites";
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
import { usePersonagensDeJogador } from "@/hooks/use-personagens-de-jogador";
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
import {
  flipSelection,
  removeFogSelection,
  removeParedeSelection,
  removePortraitSelection,
  removeSelection,
  setSelectionOpacity,
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
import { CORNER_HANDLES, MIN_ITEM_SIZE, type Vec } from "@/lib/geometry/transform";

import { selectAbaAtiva, useLayoutStore } from "@/lib/store/use-layout-store";
import { usePinWindowStore } from "@/lib/store/use-pin-window-store";
import { usePostitStore } from "@/lib/store/use-postit-store";
import { useQuadroStore } from "@/lib/store/use-quadro-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import {
  useSceneStore,
  type FormaPatch,
  type ItemPatch,
  type TextoPatch,
} from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { ferramentaDeExtensao, useToolStore } from "@/lib/store/use-tool-store";
import {
  ehQuadro,
  temCamera,
  POSTIT_ALTURA,
  POSTIT_LARGURA,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  TEXTO_TAMANHO,
  type AncoraRetrato,
  type CanvasItem,
  type Documento,
  type FogRegion,
  type Forma,
  type Medidor,
  type Postit,
  type NewForma,
  type NewParede,
  type PontaDeLigacao,
  type Portrait,
  type Scene,
  type Texto,
  type Traco,
  type UniaoDeRetratos,
} from "@/types/scene";

const NO_GUIDES: Guide[] = [];
/** As listas vazias das três seleções que só andam. Ver `selectedPostits`. */
const NADA_DE_POSTIT: readonly Postit[] = [];
const NADA_DE_DOCUMENTO: readonly Documento[] = [];
const NADA_DE_TRACO: readonly Traco[] = [];

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

export function MestreStage({ scene: cenaDoBoard }: { scene: Scene }) {
  const { scale, toScene } = useSceneScale();
  const startDrag = useSceneDrag();

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
    ],
  );

  const [marquee, setMarquee] = useState<Bounds | null>(null);

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
  const corPostit = useToolStore((state) => state.corPostit);
  const formaMedidor = useToolStore((state) => state.formaMedidor);
  const corMedidor = useToolStore((state) => state.corMedidor);
  const tipoDeForma = useToolStore((state) => state.tipoDeForma);
  const formatoDeArea = useToolStore((state) => state.formatoDeArea);
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
  const personagensDeJogador = usePersonagensDeJogador();

  /**
   * Os dados que os jogadores jogaram, para pendurar nos retratos.
   *
   * A bandeja, e não o histórico: é o que está NA MESA agora, e é a mesma
   * lista que a fileira do canto desenha e que o quadro publicado leva para a
   * TV e para os celulares. Ver `useRolagensStore`.
   */
  const bandeja = useRolagensStore((state) => state.bandeja);

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
  const selectedPortraitIds = useSelectionStore(
    (state) => state.selectedPortraitIds,
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
  const selectedMedidorId = useSelectionStore(
    (state) => state.selectedMedidorId,
  );
  const selectMedidor = useSelectionStore((state) => state.selectMedidor);
  const selectParede = useSelectionStore((state) => state.selectParede);
  const selectedParedeId = useSelectionStore((state) => state.selectedParedeId);
  const selectPortrait = useSelectionStore((state) => state.selectPortrait);
  const selectPortraits = useSelectionStore((state) => state.selectPortraits);
  const togglePortrait = useSelectionStore((state) => state.togglePortrait);
  const clear = useSelectionStore((state) => state.clear);

  const addFog = useSceneStore((state) => state.addFog);
  const addMedidor = useSceneStore((state) => state.addMedidor);
  const updateMedidor = useSceneStore((state) => state.updateMedidor);
  const removeMedidores = useSceneStore((state) => state.removeMedidores);
  const addParede = useSceneStore((state) => state.addParede);
  const updateParede = useSceneStore((state) => state.updateParede);
  const updateFog = useSceneStore((state) => state.updateFog);
  const addTraco = useSceneStore((state) => state.addTraco);
  const removeTracos = useSceneStore((state) => state.removeTracos);
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

  const guardados = usePortraitStore((state) => state.portraits);
  const unioes = usePortraitStore((state) => state.unioes);
  const ajustarUniaoDeRetratos = usePortraitStore((state) => state.ajustar);

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

  /**
   * De quem é cada figura do mapa, dita pelo contorno.
   *
   * Não depende da seleção. Chegou a sumir com algo selecionado, para não
   * competir com o gizmo, e estava errado: o traço é o mapa dizendo QUEM é
   * quem, e essa leitura some justamente na hora em que o mestre está
   * trabalhando o mapa -- clicar num token apagava a informação sobre os
   * outros trinta e nove. Quem marca o selecionado é a caixa com alças, que é
   * outro desenho e não disputa com este.
   *
   * Só aqui: a TV e o celular recebem a cena sem isto. Ver `contornoDosItens`.
   */
  const contornos = useMemo(
    () => contornoDosItens(scene.items, personagensDeJogador),
    [scene.items, personagensDeJogador],
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
  const personagemDoItem =
    single?.personagemId &&
    (personagens === null ||
      personagens.some((atual) => atual.id === single.personagemId))
      ? single.personagemId
      : undefined;
  const selectedFog = scene.fog.find((region) => region.id === selectedFogId);
  const selectedParede = scene.paredes?.find(
    (parede) => parede.id === selectedParedeId,
  );
  const selectedPortraits = portraits.filter((portrait) =>
    selectedPortraitIds.includes(portrait.id),
  );
  const singlePortrait =
    selectedPortraits.length === 1 ? selectedPortraits[0] : undefined;
  /**
   * Os membros de uma união que estão NO AR, na ordem dela.
   *
   * São os que `useUnioesDeRetratos` posiciona: fora do ar não ocupa vaga na
   * fila, e retrato solto tem posição própria. A ordem é a da união, e não a
   * dos tokens -- é ela que diz quem fica à esquerda de quem.
   */
  const membrosNoAr = (uniao: UniaoDeRetratos): Portrait[] =>
    uniao.retratos
      .map((id) => portraits.find((atual) => atual.id === id))
      .filter((atual): atual is Portrait => Boolean(atual?.visible));

  /**
   * A união inteiramente selecionada, se a seleção for exatamente uma.
   *
   * Decide o rótulo da caixa e a regra de escala: numa união, o gizmo manda no
   * tamanho e a união manda na posição.
   */
  const uniaoSelecionada =
    unioes.find((uniao) => {
      const membros = membrosNoAr(uniao);

      return (
        membros.length > 0 &&
        membros.length === selectedPortraitIds.length &&
        membros.every((retrato) => selectedPortraitIds.includes(retrato.id))
      );
    }) ?? null;

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
      : single && (single.locked || panMode)
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

  const previa = useRef<SVGPolylineElement | null>(null);

  const [apagando, setApagando] = useState<ReadonlySet<string>>(NADA_APAGANDO);

  /**
   * A área sob o ponteiro enquanto a fila de retratos é arrastada.
   *
   * `null` fora do gesto, e é o que faz as seis áreas não existirem no resto do
   * tempo: são retângulos sobre o mapa, e à vista o tempo todo poluiriam a
   * imagem que a mesa está olhando.
   */
  const [areaDaUniao, setAreaDaUniao] = useState<AncoraRetrato | null>(null);
  const [arrastandoUniao, setArrastandoUniao] = useState(false);

  /** Evita re-render por frame quando não há guia nenhuma para mostrar. */
  function clearGuides() {
    setGuides((previous) => (previous.length === 0 ? previous : NO_GUIDES));
  }

  /** Bounds de tudo que não está se movendo — os candidatos a linha guia. */
  function snapTargets(exclude: (id: string) => boolean): Bounds[] {
    return [
      ...scene.items.filter((item) => !exclude(item.id)).map(itemBounds),
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
    /**
     * Os textos do quadro vêm junto quando o item clicado JÁ estava na mão: a
     * área laça frase e imagem no mesmo gesto, e pegar uma tem de levar as
     * duas. Clicar numa imagem de fora da seleção é um gesto novo -- aí
     * `select` já limpou os textos, e não há passageiro.
     */
    const textosArrastados = alreadySelected ? selectedTextos : [];
    const formasArrastadas = alreadySelected ? selectedFormas : [];
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
    if (!movingBounds) return;

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
    // névoa e o retrato continuam alinhando, porque ali borda é o que importa.
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
      // uma seleção múltipla que já o inclua.
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
      textos: jaSelecionado ? selectedTextos : [texto],
      formas: jaSelecionado ? selectedFormas : [],
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
      textos: jaSelecionada ? selectedTextos : [],
      formas: jaSelecionada ? selectedFormas : [forma],
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
   * Sem botão direito: o menu de contexto do palco ainda não fala de papel, e
   * apontá-lo para um postit prometeria ações que o menu não tem.
   */
  function handlePapelPointerDown(
    event: ReactPointerEvent,
    papel:
      | { tipo: "postit"; postit: Postit }
      | { tipo: "documento"; documento: Documento },
  ) {
    if (event.button !== 0) return;

    const id = papel.tipo === "postit" ? papel.postit.id : papel.documento.id;
    const jaSelecionado =
      papel.tipo === "postit"
        ? selectedPostitIds.includes(id)
        : selectedDocumentoIds.includes(id);

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
      textos: jaSelecionado ? selectedTextos : [],
      formas: jaSelecionado ? selectedFormas : [],
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

    // Retrato de união não se mexe sozinho: a posição dele é da união.
    // Arrastá-lo livremente faria a figura voltar no quadro seguinte, quando o
    // efeito reaplicasse o layout.
    //
    // Então o clique seleciona A UNIÃO INTEIRA. É o que torna o grupo evidente
    // sem precisar de aviso: aparece a caixa pontilhada em volta dos cinco, com
    // o nome da união, e o gizmo que sobe é o do grupo -- que escala todos por
    // um fator só. Selecionar um e mexer nos outros seria o mesmo efeito com
    // aparência de defeito.
    //
    // Fora do ar não: aí ele é o fantasma que o mestre posiciona à mão, e a
    // união não governa quem ninguém está vendo.
    const uniaoDoAlvo = portrait.visible
      ? uniaoDoRetrato(unioes, portrait.id)
      : null;

    if (uniaoDoAlvo) {
      selectPortraits(membrosNoAr(uniaoDoAlvo).map((atual) => atual.id));
      arrastarUniao(event, uniaoDoAlvo);
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

        selectParede(addParede(scene.id, rascunho(fim)));
        // Volta ao modo normal, como todas as outras do palco: o gesto seguinte
        // a erguer uma parede é conferir a sombra que ela fez, e não erguer
        // outra por cima. É a regra do Excalidraw, e agora vale para as seis.
        setTool("select");
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
   * Leva uma união de retratos para outra área.
   *
   * A união não segue o ponteiro: as seis áreas acendem, a de baixo do cursor
   * destaca, e soltar troca a âncora. Seguir o ponteiro exigiria um layout por
   * quadro para uma escolha que tem seis respostas possíveis -- movimento a
   * mais para a mesma decisão.
   *
   * Largar numa área que já tem outra união não é recusado: as duas empilham,
   * a que chegou depois atrás da que já estava. Ver `filasDeUnioes`.
   */
  function arrastarUniao(event: ReactPointerEvent, uniao: UniaoDeRetratos) {
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

    setArrastandoUniao(true);
    setAreaDaUniao(sob(event.clientX, event.clientY));

    startDrag(event, {
      onMove: (_delta, native) =>
        setAreaDaUniao(sob(native.clientX, native.clientY)),
      onEnd: (native) => {
        const escolhida = sob(native.clientX, native.clientY);
        if (escolhida) ajustarUniaoDeRetratos(uniao.id, { ancora: escolhida });

        setArrastandoUniao(false);
        setAreaDaUniao(null);
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
    const id = addTexto(scene.id, {
      x: Math.round(ponto.x),
      y: Math.round(ponto.y - TEXTO_TAMANHO / 2),
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

    const id = addLigacao(scene.id, de, para);
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
        }),
      );
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
        }),
      ]);
      // Larga a ferramenta, como as outras formas: a regra do Excalidraw, e a
      // razão dela está no cabeçalho da seta.
      setTool("select");
      return;
    }

    selectFog(addFog(scene.id, area));
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

    if (tool === "lapis") {
      riscar(event, anchor);
      return;
    }

    if (tool === "borracha") {
      apagar(event, anchor);
      return;
    }

    if (tool === "fog") {
      // A área LIVRE não é arrasto: ela se desenha vértice a vértice, e o
      // gesto todo acontece em cliques. Ver `cravarVertice`.
      if (formatoDeArea === "poligono") {
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

          selectFog(
            addFog(scene.id, {
              x: Math.round(box.x),
              y: Math.round(box.y),
              width: Math.round(box.width),
              height: Math.round(box.height),
              formato: formatoDeArea,
            }),
          );
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

        const hits = scene.items
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
    fecharLaco,
    item: handleItemPointerDown,
    fog: handleFogPointerDown,
    portrait: handlePortraitPointerDown,
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
      portrait: handlePortraitPointerDown,
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
          estado.formatoDeArea !== anterior.formatoDeArea
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

  const onPortraitPointerDown = useCallback(
    (event: ReactPointerEvent, portrait: Portrait) => {
      handlersRef.current.portrait(event, portrait);
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
        tool === "forma" ||
        tool === "lapis" ||
        tool === "borracha" ||
        tool === "regua" ||
        tool === "parede" ||
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
          contornos={contornos}
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

      {/* Irmã do `PinLayer` e fora do `SceneLayer` pela mesma razão: a parede
          desenhada é preparação do mestre, e o `SceneLayer` é o componente que
          desenha na TV. O que a mesa recebe é a SOMBRA, não a parede que a
          fez. Ver `ParedeLayer` e `SombraLayer`. */}
      <ParedeLayer
        scene={scene}
        panMode={panMode}
        fantasma={rascunhoDaParede}
      />

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
      <DocumentoLayer
        scene={scene}
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
            groupSnapshot.current = {
              items: selectedItems,
              textos: selectedTextos,
              formas: selectedFormas,
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
          onChange={(patch) => moverNoGesto(scene.id, [{ id: single.id, patch }])}
          onGestureEnd={() =>
            terminarGesto(scene.id, useGestoStore.getState().patches ?? [])
          }
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
            onDelete={removeParedeSelection}
          />

          {/* As alças de vértice, só do laço: nos outros três o contorno É a
              caixa, e o gizmo já a controla inteira. */}
          {selectedParede.formato === "poligono" ? (
            <AlcasDaArea
              region={selectedParede}
              onChange={(patch) =>
                updateParede(scene.id, selectedParede.id, patch)
              }
            />
          ) : null}
        </>
      ) : null}

      {/* As alças de vértice da forma em LAÇO. A caixa dela já é governada
          pelo gizmo do palco, junto com o resto da seleção; o que falta é
          mexer num canto, e é a mesma camada das outras duas. */}
      {selectedFormas.length === 1 &&
      selectedFormas[0]!.tipo === "poligono" &&
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
            // Gira como o item: corredor, mesa e parede raramente correm no
            // eixo da tela, e sem giro cobrir um deles cobria meio mapa junto.
            onChange={(patch) => updateFog(scene.id, selectedFog.id, patch)}
            onDelete={removeFogSelection}
          />

          {/* As alças de vértice, só da área recortada: nas outras duas o
              contorno É a caixa, e o gizmo já a controla inteira. */}
          {selectedFog.formato === "poligono" ? (
            <AlcasDaArea
              region={selectedFog}
              onChange={(patch) => updateFog(scene.id, selectedFog.id, patch)}
            />
          ) : null}
        </>
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

            // Sendo uma união, o gizmo só manda no TAMANHO: a posição é dela,
            // e deixar os dois escreverem no mesmo quadro faz o retrato pular
            // -- o gizmo o põe onde a escala calculou, e o efeito o traz de
            // volta para a fila no quadro seguinte.
            updatePortraits(
              uniaoSelecionada
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
            uniaoSelecionada
              ? `${uniaoSelecionada.nome} · ${selectedPortraitIds.length}`
              : `${selectedPortraitIds.length} retratos`
          }
        />
      ) : null}

      {arrastandoUniao ? (
        <PortraitAnchors camera={scene.camera} alvo={areaDaUniao} />
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

      {marquee ? (
        <MarqueeBox
          bounds={marquee}
          redondo={tool === "fog" && formatoDeArea === "elipse"}
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

      {/* Espelhando o palco, a moldura coincide com a tela: desenhá-la seria
          uma borda em volta do palco inteiro dizendo nada. */}
      {selecionada && !espelhoMestre ? (
        <CameraFrame
          camera={selecionada}
          transmitindo={scene.cameraNoArId === selecionada.id}
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
