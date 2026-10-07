"use client";

import { toast } from "sonner";

import {
  MIN_ITEM_SIZE,
  normalizeAngle,
  offsetInsideScene,
} from "@/lib/geometry/transform";
import { flipPatches, type FlipAxis } from "@/lib/mestre/flip";
import { moveGroup, type PecaDoGrupo } from "@/lib/geometry/group";
import {
  empurrarTextos,
  girarTextosNoLugar,
} from "@/lib/mestre/grupo-de-textos";
import {
  deslocamentoPreso,
  empurrarDocumentos,
  empurrarPostits,
  empurrarTracos,
} from "@/lib/mestre/grupo-sem-alca";
import { usePinWindowStore } from "@/lib/store/use-pin-window-store";
import { usePostitStore } from "@/lib/store/use-postit-store";
import {
  temAlgoParaColar,
  useClipboardStore,
} from "@/lib/store/use-clipboard-store";
import { useQuadroStore } from "@/lib/store/use-quadro-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import {
  selectEditingScene,
  useSceneStore,
  type ItemPatch,
  type ZDirection,
} from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import {
  CONE_DA_LANTERNA,
  CORES_DA_LUZ,
  DOCUMENTO_FONTE,
  itensVisiveis,
  POSTIT_FONTE,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  semIdDaArea,
  semIdDaForma,
  semIdDaLuz,
  semIdDaParede,
  semIdDaPorta,
  semIdDoPostit,
  semIdDoTexto,
  temLuz,
  temNevoa,
  temSol,
} from "@/types/scene";
import { postitNaArea } from "@/lib/geometry/postit";
import { degrauDeFonte } from "@/lib/mestre/degrau-de-fonte";
import type {
  AreaDeEfeito,
  ConeDaLuz,
  LuzCarregada,
  CanvasItem,
  Documento,
  FogRegion,
  Forma,
  ItemDraft,
  Luz,
  ModoDaSombra,
  NewFogRegion,
  NewForma,
  NewLuz,
  NewParede,
  NewPorta,
  NewPostit,
  NewTexto,
  NewTraco,
  Parede,
  Porta,
  Postit,
  Scene,
  SombraDoItem,
  Texto,
  Traco,
} from "@/types/scene";
import { sombraParaGravar } from "@/lib/geometry/sombra";
import { t } from "@/lib/i18n/bancada";
import { t as textoDeArquivos } from "@/lib/i18n/arquivos";

/** Deslocamento do "colar" e do "duplicar", para a cópia não sumir sob o original. */
export const PASTE_OFFSET = 32;

/**
 * Os degraus de opacidade que o menu oferece. 1 é a imagem como ela é.
 *
 * Uma escada e não um controle contínuo, pelo mesmo motivo do zoom da
 * interface: o gesto é de MENU, e o que se quer é escolher um estado — meio
 * apagado, quase sumido — e não calibrar um número. Um slider dentro de um
 * menu de contexto ainda pediria arrastar com o menu aberto, que é o gesto que
 * este menu existe para evitar.
 *
 * Vai até 10% e não até 0: item invisível continua selecionável no palco, mas
 * seria invisível também na prévia e na lista de camadas, e some da cena sem
 * ter saído dela. Quem quer que a mesa não veja tem a névoa e a lixeira.
 */
export const DEGRAUS_OPACIDADE = [1, 0.75, 0.5, 0.25, 0.1];

/**
 * Ações do Mestre sobre a seleção, em um lugar só.
 *
 * Atalhos de teclado e menu de contexto chamam exatamente estas funções — se
 * cada um tivesse a própria implementação, "Duplicar" no menu e Ctrl+D iriam
 * divergir no primeiro ajuste.
 *
 * Todas leem o estado via `getState()` no momento da chamada, então não
 * precisam de props nem de re-render para estar corretas.
 */
type ActionContext = {
  scene: Scene | null;
  selectedIds: string[];
  selectedItems: CanvasItem[];
  selectedTextoIds: string[];
  /**
   * Os textos soltos na mão, que andam com os itens desde que a área do quadro
   * passou a laçar os dois. Toda ação de seleção daqui trata as duas listas:
   * copiar metade do que está marcado seria a pior resposta possível.
   */
  selectedTextos: Texto[];
  selectedFormaIds: string[];
  /** As formas na mão. Mesma história dos textos. Ver `Forma`. */
  selectedFormas: Forma[];
  /**
   * Papel, cartão de nota e risco -- os três que a área também laça e que só
   * ANDAM. Apagar e empurrar tratam os seis; copiar, colar e duplicar tratam
   * papel e risco, e deixam o cartão de fora. Ver `copySelection`.
   */
  selectedPostitIds: string[];
  selectedPostits: Postit[];
  selectedDocumentoIds: string[];
  selectedDocumentos: Documento[];
  selectedTracoIds: string[];
  selectedTracos: Traco[];
};

function read(): ActionContext {
  // Sempre a cena em edição: as ações do mestre agem no palco dele, nunca
  // direto no que a mesa está vendo.
  const scene = selectEditingScene(useSceneStore.getState());
  const {
    selectedIds,
    selectedTextoIds,
    selectedFormaIds,
    selectedPostitIds,
    selectedDocumentoIds,
    selectedTracoIds,
  } = useSelectionStore.getState();

  return {
    scene,
    selectedIds,
    selectedItems: scene
      ? scene.items.filter((item) => selectedIds.includes(item.id))
      : [],
    selectedTextoIds,
    selectedTextos: scene
      ? (scene.textos ?? []).filter((texto) =>
          selectedTextoIds.includes(texto.id),
        )
      : [],
    selectedFormaIds,
    selectedFormas: scene
      ? (scene.formas ?? []).filter((forma) =>
          selectedFormaIds.includes(forma.id),
        )
      : [],
    selectedPostitIds,
    selectedPostits: scene
      ? (scene.postits ?? []).filter((postit) =>
          selectedPostitIds.includes(postit.id),
        )
      : [],
    selectedDocumentoIds,
    selectedDocumentos: scene
      ? (scene.documentos ?? []).filter((documento) =>
          selectedDocumentoIds.includes(documento.id),
        )
      : [],
    selectedTracoIds,
    selectedTracos: scene
      ? (scene.tracos ?? []).filter((traco) =>
          selectedTracoIds.includes(traco.id),
        )
      : [],
  };
}

/**
 * As cópias deslocadas, para não nascerem em cima do original.
 *
 * Recebem a versão SEM id, e é o que as deixa servir ao colar e ao duplicar:
 * o colar já tem a cópia guardada, e o duplicar a tira do original com o
 * `semId...` de cada um. Uma conta só para os dois caminhos -- antes eram duas,
 * e a do duplicar perdia a cor do texto.
 */
function formaDeslocada(forma: NewForma): NewForma {
  return { ...forma, x: forma.x + PASTE_OFFSET, y: forma.y + PASTE_OFFSET };
}

/**
 * O texto não passa por `offsetInsideScene`: a caixa dele vem da fonte, e não
 * há largura para segurar dentro do plano antes de ele ser desenhado.
 */
function textoDeslocado(texto: NewTexto): NewTexto {
  return { ...texto, x: texto.x + PASTE_OFFSET, y: texto.y + PASTE_OFFSET };
}

/** O papel tem cerca: a cópia fica dentro da área de trabalho. */
function postitDeslocado(postit: Omit<Postit, "id">): NewPostit {
  return {
    ...postit,
    ...postitNaArea(
      postit.x + PASTE_OFFSET,
      postit.y + PASTE_OFFSET,
      postit.largura,
      postit.altura,
    ),
  };
}

/** O risco não tem canto: anda cada ponto, x e y pelo mesmo tanto. */
function tracoDeslocado(traco: NewTraco): NewTraco {
  return { ...traco, pontos: traco.pontos.map((valor) => valor + PASTE_OFFSET) };
}

/**
 * O que está na mão do CHÃO do mapa: a parede, a área escondida e a luz
 * cravada.
 *
 * Fora do `read` porque as três não andam com o resto: cada uma se seleciona
 * sozinha, e selecioná-la larga as imagens, os textos e as formas. No máximo
 * uma das três listas tem alguém -- e as outras seis de `read`, ninguém.
 */
function doChao(scene: Scene | null): {
  paredes: Parede[];
  portas: Porta[];
  areas: FogRegion[];
  luzes: Luz[];
  areasDeEfeito: AreaDeEfeito[];
} {
  const {
    selectedParedeId,
    selectedPortaId,
    selectedFogId,
    selectedLuzId,
    selectedAreaDeEfeitoId,
  } = useSelectionStore.getState();

  return {
    paredes: (scene?.paredes ?? []).filter(
      (parede) => parede.id === selectedParedeId,
    ),
    portas: (scene?.portas ?? []).filter(
      (porta) => porta.id === selectedPortaId,
    ),
    areas: (scene?.fog ?? []).filter((area) => area.id === selectedFogId),
    luzes: (scene?.luzes ?? []).filter((luz) => luz.id === selectedLuzId),
    areasDeEfeito: (scene?.areasDeEfeito ?? []).filter(
      (area) => area.id === selectedAreaDeEfeitoId,
    ),
  };
}

/** A parede e a área têm caixa, e a cópia fica dentro do plano como o item. */
function paredeDeslocada(parede: NewParede): NewParede {
  return { ...parede, ...offsetInsideScene(parede, PASTE_OFFSET) };
}

function areaDeslocada(area: NewFogRegion): NewFogRegion {
  return { ...area, ...offsetInsideScene(area, PASTE_OFFSET) };
}

/**
 * A luz é um ponto: anda o mesmo tanto, e volta para dentro se o passo a
 * levaria para fora do plano -- a regra de `offsetInsideScene`, com caixa de
 * lado zero.
 */
function luzDeslocada(luz: NewLuz): NewLuz {
  const { x, y } = offsetInsideScene(
    {
      x: Math.min(Math.max(luz.x, 0), SCENE_WIDTH),
      y: Math.min(Math.max(luz.y, 0), SCENE_HEIGHT),
      width: 0,
      height: 0,
    },
    PASTE_OFFSET,
  );

  return { ...luz, x, y };
}

/** A porta anda pela dobradiça, como a luz pelo centro: um ponto sem caixa. */
function portaDeslocada(porta: NewPorta): NewPorta {
  const { x, y } = offsetInsideScene(
    {
      x: Math.min(Math.max(porta.x, 0), SCENE_WIDTH),
      y: Math.min(Math.max(porta.y, 0), SCENE_HEIGHT),
      width: 0,
      height: 0,
    },
    PASTE_OFFSET,
  );

  return { ...porta, x, y };
}

function offsetDraft(item: CanvasItem): ItemDraft {
  const { x, y } = offsetInsideScene(item, PASTE_OFFSET);

  return {
    assetId: item.assetId,
    x,
    y,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    locked: item.locked,
    flipX: item.flipX,
    flipY: item.flipY,
    espelharPeloOlhar: item.espelharPeloOlhar,
    opacity: item.opacity,
    // A cópia do caixote vista de cima continua vista de cima, e a do boneco
    // com a linha do chão posta continua pisando no mesmo lugar.
    semSombra: item.semSombra,
    sombra: item.sombra,
  };
}

/**
 * Copia o que a área de transferência sabe recriar: imagem, texto, forma,
 * papel e risco -- cada um com a cor que tem.
 *
 * O cartão de nota fica DE FORA, e não por esquecimento. Ele aponta um arquivo
 * de `documentos/`: duas cópias do mesmo cartão seriam duas janelas para a
 * mesma nota, e uma cópia entre campanhas apontaria para um arquivo que não
 * existe do outro lado.
 *
 * Por isso `cutSelection` não recorta o cartão: apagar sem ter para onde colar
 * seria perder, não recortar.
 */
export function copySelection(): void {
  const {
    scene,
    selectedItems,
    selectedTextos,
    selectedFormas,
    selectedPostits,
    selectedTracos,
  } = read();
  const { paredes, portas, areas, luzes } = doChao(scene);
  if (
    selectedItems.length === 0 &&
    selectedTextos.length === 0 &&
    selectedFormas.length === 0 &&
    selectedPostits.length === 0 &&
    selectedTracos.length === 0 &&
    paredes.length === 0 &&
    portas.length === 0 &&
    areas.length === 0 &&
    luzes.length === 0
  )
    return;

  useClipboardStore.getState().copy({
    itens: selectedItems,
    textos: selectedTextos,
    formas: selectedFormas,
    postits: selectedPostits,
    tracos: selectedTracos,
    paredes,
    portas,
    areas,
    luzes,
  });
}

/**
 * Livre: pode andar, crescer, girar e sair. É a pergunta que todo gesto do
 * mestre faz antes de mexer -- o travado fica onde está. Ver `locked`.
 */
export function livre(coisa: { locked?: boolean }): boolean {
  return !coisa.locked;
}

/**
 * O Delete que caiu só em coisa travada diz por que não fez nada.
 *
 * Calado, ele pareceria quebrado: o mestre aperta, a parede fica, e a próxima
 * tentativa é apertar mais forte. O cadeado aceso no gizmo diz o mesmo, mas só
 * para quem já está olhando para ele.
 */
function avisarTravado(): void {
  toast(t.itemActions.travado);
}

export function removeSelection(opcoes?: { semCartao?: boolean }): void {
  const lido = read();
  const { scene, selectedPostitIds, selectedDocumentoIds, selectedTracoIds } =
    lido;
  // O travado fica: é para isso que ele foi travado. Sai o resto da seleção.
  const selectedIds = lido.selectedItems.filter(livre).map((item) => item.id);
  const selectedFormaIds = lido.selectedFormas
    .filter(livre)
    .map((forma) => forma.id);
  const travados =
    lido.selectedItems.length -
    selectedIds.length +
    lido.selectedFormas.length -
    selectedFormaIds.length +
    lido.selectedTextos.filter((texto) => texto.locked).length;
  const selectedTextoIds = lido.selectedTextos
    .filter(livre)
    .map((texto) => texto.id);
  // O texto ABERTO para escrever não sai por aqui: com o campo na tela, Delete
  // é do cursor, e apagar a frase inteira no meio de uma palavra seria a
  // resposta errada. Ele volta a ser apagável assim que a edição fecha.
  const editandoId = useQuadroStore.getState().textoEditandoId;
  const textoIds = selectedTextoIds.filter((id) => id !== editandoId);
  // O postit ABERTO para digitar fica, pela mesma razão do texto.
  const postitEditandoId = usePostitStore.getState().editandoId;
  const postitIds = selectedPostitIds.filter((id) => id !== postitEditandoId);
  const documentoIds = opcoes?.semCartao ? [] : selectedDocumentoIds;
  const tracoIds = selectedTracoIds;
  if (
    !scene ||
    (selectedIds.length === 0 &&
      textoIds.length === 0 &&
      selectedFormaIds.length === 0 &&
      postitIds.length === 0 &&
      documentoIds.length === 0 &&
      tracoIds.length === 0)
  ) {
    if (travados > 0) avisarTravado();
    return;
  }

  useSceneStore.getState().removeItems(scene.id, selectedIds);
  useSceneStore.getState().removeTextos(scene.id, textoIds);
  useSceneStore.getState().removeFormas(scene.id, selectedFormaIds);
  // O cartão sai do quadro; o arquivo `.md` dele continua em Arquivos. É o
  // mesmo que o botão da barra do cartão sempre fez.
  useSceneStore.getState().removePostits(scene.id, postitIds);
  useSceneStore.getState().removeDocumentos(scene.id, documentoIds);
  useSceneStore.getState().removeTracos(scene.id, tracoIds);
  useSelectionStore.getState().clear();
}

/**
 * Leva itens da mesa de volta para a manga: o asset entra no handout da cena
 * (se já não estiver) e o item sai do palco.
 *
 * Tokens de personagem ficam de fora. O handout guarda imagens do acervo, e a
 * miniatura de um personagem já é dele -- guardá-la aqui faria a bolinha
 * mostrar um retrato que só volta à mesa como imagem solta, sem o personagem.
 */
export function guardarNoHandout(itemIds: string[]): void {
  const { scene } = read();
  if (!scene) return;

  const itens = scene.items.filter(
    (item) => itemIds.includes(item.id) && !item.personagemId,
  );
  if (itens.length === 0) return;

  const { guardarNoHandout: guardar, removeItems } = useSceneStore.getState();
  guardar(
    scene.id,
    itens.map((item) => item.assetId),
  );
  removeItems(
    scene.id,
    itens.map((item) => item.id),
  );
  useSelectionStore.getState().clear();
}

export function guardarSelecaoNoHandout(): void {
  guardarNoHandout(read().selectedIds);
}

/**
 * Recorta: copia o que cabe na área de transferência e apaga SÓ isso.
 *
 * O cartão continua onde estava -- ele não é copiado (ver `copySelection`), e
 * apagá-lo aqui seria um Ctrl+X que perde o que não levou.
 */
export function cutSelection(): void {
  // O travado vai para a área de transferência e FICA na cena: Ctrl+X nele
  // vira Ctrl+C. Quem apaga é cada `remove...`, e todos pulam o travado.
  copySelection();

  // Do chão sai só a que estava na mão: `removeSelection` não as conhece, e
  // cada uma tem o próprio apagar. Selecionar uma delas já largou o resto.
  const {
    selectedParedeId,
    selectedPortaId,
    selectedFogId,
    selectedLuzId,
    selectedAreaDeEfeitoId,
  } = useSelectionStore.getState();
  if (selectedParedeId) removeParedeSelection();
  else if (selectedPortaId) removePortaSelection();
  else if (selectedFogId) removeFogSelection();
  else if (selectedAreaDeEfeitoId) removeAreaDeEfeitoSelection();
  else if (selectedLuzId) removeLuzSelection();
  else removeSelection({ semCartao: true });
}

export function pasteClipboard(): void {
  const { scene } = read();
  if (!scene) return;

  const guardado = useClipboardStore.getState();
  // Em QUALQUER cena, o mapa incluído. O colar recusava texto e forma fora do
  // quadro porque, num mapa, eles só apareciam no palco do mestre; desde o
  // `naMesa` o mapa tem os dois, com o olho do gizmo decidindo o que a mesa
  // vê. A cópia leva o olho junto, e o que veio de um quadro chega fechado.
  if (!temAlgoParaColar(guardado)) return;

  colarNaCena(scene, {
    itens: guardado.drafts.map((draft) => ({
      ...draft,
      ...offsetInsideScene(draft, PASTE_OFFSET),
    })),
    textos: guardado.textos.map(textoDeslocado),
    formas: guardado.formas.map(formaDeslocada),
    postits: guardado.postits.map(postitDeslocado),
    tracos: guardado.tracos.map(tracoDeslocado),
    paredes: guardado.paredes.map(paredeDeslocada),
    portas: guardado.portas.map(portaDeslocada),
    areas: guardado.areas.map(areaDeslocada),
    luzes: guardado.luzes.map(luzDeslocada),
  });
}

export function duplicateSelection(): void {
  const {
    scene,
    selectedItems,
    selectedTextos,
    selectedFormas,
    selectedPostits,
    selectedTracos,
  } = read();
  const { paredes, portas, areas, luzes } = doChao(scene);
  if (
    !scene ||
    (selectedItems.length === 0 &&
      selectedTextos.length === 0 &&
      selectedFormas.length === 0 &&
      selectedPostits.length === 0 &&
      selectedTracos.length === 0 &&
      paredes.length === 0 &&
      portas.length === 0 &&
      areas.length === 0 &&
      luzes.length === 0)
  )
    return;

  colarNaCena(scene, {
    itens: selectedItems.map(offsetDraft),
    textos: selectedTextos.map((texto) => textoDeslocado(semIdDoTexto(texto))),
    formas: selectedFormas.map((forma) => formaDeslocada(semIdDaForma(forma))),
    postits: selectedPostits.map((postit) =>
      postitDeslocado(semIdDoPostit(postit)),
    ),
    tracos: selectedTracos.map(({ pontos, cor, espessura, opacidade }) =>
      tracoDeslocado({
        pontos,
        cor,
        espessura,
        ...(opacidade !== undefined ? { opacidade } : {}),
      }),
    ),
    paredes: paredes.map((parede) => paredeDeslocada(semIdDaParede(parede))),
    portas: portas.map((porta) => portaDeslocada(semIdDaPorta(porta))),
    areas: areas.map((area) => areaDeslocada(semIdDaArea(area))),
    luzes: luzes.map((luz) => luzDeslocada(semIdDaLuz(luz))),
  });
}

/**
 * Põe as cópias JÁ deslocadas na cena e as deixa na mão.
 *
 * O que o colar e o duplicar têm em comum: os dois terminam com a cópia
 * selecionada, para o próximo gesto -- arrastar, Ctrl+D de novo -- ser nela e
 * não no original.
 */
function colarNaCena(
  scene: Scene,
  copias: {
    itens: ItemDraft[];
    textos: NewTexto[];
    formas: NewForma[];
    postits: NewPostit[];
    tracos: NewTraco[];
    paredes: NewParede[];
    portas: NewPorta[];
    areas: NewFogRegion[];
    luzes: NewLuz[];
  },
): void {
  const cena = useSceneStore.getState();
  const sceneId = scene.id;


  // Só quem tem o que colar: `addItems` com a lista vazia gravaria o board e
  // deixaria um passo de desfazer que não desfaz nada.
  const itens =
    copias.itens.length > 0 ? cena.addItems(sceneId, copias.itens) : [];
  const textos = cena.addTextos(sceneId, copias.textos);
  const formas = cena.addFormas(sceneId, copias.formas);
  // Um a um: papel e risco não têm a versão em lote. São poucos por colagem,
  // e os commits seguidos se fundem num passo só de desfazer.
  const postits = copias.postits.map((postit) =>
    cena.addPostit(sceneId, postit),
  );
  const tracos = copias.tracos.map((traco) => cena.addTraco(sceneId, traco));

  /**
   * O chão, só onde há chão para ele: parede e luz no mapa, a área onde há
   * névoa. Colar a parede de um mapa num quadro deixaria na cena uma coisa que
   * nenhuma camada desenha e nenhum gizmo alcança.
   */
  const paredes = temSol(scene)
    ? copias.paredes.map((parede) => cena.addParede(sceneId, parede))
    : [];
  const portas = temSol(scene)
    ? copias.portas.map((porta) => cena.addPorta(sceneId, porta))
    : [];
  const areas = temNevoa(scene)
    ? copias.areas.map((area) => cena.addFog(sceneId, area))
    : [];
  const luzes = temLuz(scene)
    ? copias.luzes.map((luz) => cena.addLuz(sceneId, luz))
    : [];

  const selecao = useSelectionStore.getState();
  const doResto =
    itens.length +
    textos.length +
    formas.length +
    postits.length +
    tracos.length;

  // Parede, área e luz se selecionam SOZINHAS -- escolher uma larga o resto
  // (ver `selectParede`). O Ctrl+C delas veio sozinho pela mesma razão, e é a
  // cópia delas que fica na mão quando é só ela que chegou.
  if (doResto === 0 && paredes[0]) selecao.selectParede(paredes[0]);
  else if (doResto === 0 && portas[0]) selecao.selectPorta(portas[0]);
  else if (doResto === 0 && areas[0]) selecao.selectFog(areas[0]);
  else if (doResto === 0 && luzes[0]) selecao.selectLuz(luzes[0]);
  else selecao.selectMisto({ itens, textos, formas, postits, tracos });
}

export function moveSelectionZ(direction: ZDirection): void {
  const { scene, selectedIds } = read();
  if (!scene || selectedIds.length === 0) return;

  useSceneStore.getState().moveItemsZ(scene.id, selectedIds, direction);
}

/** Trava tudo se houver algum destravado; só destrava quando todos estão travados. */
/**
 * Trava tudo o que está na mão, ou destrava se já estava tudo travado.
 *
 * Um só para os seis que travam -- imagem, texto, forma, parede, área e luz --,
 * porque o cadeado do gizmo, o do menu e o do painel da luz são o mesmo gesto.
 * Com a mão misturada, basta um livre para o toque TRAVAR: é o caso de quem
 * laçou a sala para prender tudo e um token tinha ficado de fora.
 *
 * O destravado volta a não ter o campo, como toda opcional da cena. A imagem é
 * a exceção, e só porque o `locked` dela nasceu obrigatório.
 */
export function toggleSelectionLock(): void {
  const { scene, selectedItems, selectedTextos, selectedFormas } = read();
  const { paredes, portas, areas, luzes, areasDeEfeito } = doChao(scene);
  const todos = [
    ...selectedItems,
    ...selectedTextos,
    ...selectedFormas,
    ...paredes,
    ...portas,
    ...areas,
    ...luzes,
    ...areasDeEfeito,
  ];
  if (!scene || todos.length === 0) return;

  const travar = todos.some(livre);
  const locked = travar ? true : undefined;
  const cena = useSceneStore.getState();

  if (selectedItems.length > 0)
    cena.setItemsLocked(
      scene.id,
      selectedItems.map((item) => item.id),
      travar,
    );
  if (selectedTextos.length > 0)
    cena.updateTextos(
      scene.id,
      selectedTextos.map((texto) => ({ id: texto.id, patch: { locked } })),
    );
  if (selectedFormas.length > 0)
    cena.updateFormas(
      scene.id,
      selectedFormas.map((forma) => ({ id: forma.id, patch: { locked } })),
    );
  for (const parede of paredes)
    cena.updateParede(scene.id, parede.id, { locked });
  for (const porta of portas) cena.updatePorta(scene.id, porta.id, { locked });
  for (const area of areas) cena.updateFog(scene.id, area.id, { locked });
  for (const luz of luzes) cena.updateLuz(scene.id, luz.id, { locked });
  for (const area of areasDeEfeito)
    cena.updateAreaDeEfeito(scene.id, area.id, { locked });
}

/**
 * Agrupa a seleção num grupo novo.
 *
 * Nasce dentro do grupo em que a seleção já está, quando todos vêm do mesmo:
 * agrupar quatro guardas que estão na "taverna" faz "Grupo 2" dentro da
 * taverna, e não um grupo solto na raiz que os tira de lá. Nome numerado, o
 * mestre renomeia pelo F2.
 */
export function agruparSelecao(): string | undefined {
  const { scene, selectedIds, selectedItems } = read();
  if (!scene || selectedItems.length === 0) return undefined;

  const pais = new Set(selectedItems.map((item) => item.grupoId));
  const parentId = pais.size === 1 ? selectedItems[0]?.grupoId : undefined;
  const ordem = (scene.grupos?.length ?? 0) + 1;

  return useSceneStore
    .getState()
    .criarGrupo(
      scene.id,
      textoDeArquivos.nomesPadrao.pasta(ordem),
      selectedIds,
      parentId,
    );
}

/**
 * Desfaz os grupos a que a seleção pertence. Os itens sobem um nível.
 *
 * Todos os grupos tocados pela seleção, e não só um: com um guarda de cada
 * grupo selecionado, "desagrupar" tem de valer para os dois.
 */
export function desagruparSelecao(): void {
  const { scene, selectedItems } = read();
  if (!scene) return;

  const grupos = new Set(
    selectedItems.flatMap((item) => (item.grupoId ? [item.grupoId] : [])),
  );

  for (const grupoId of grupos)
    useSceneStore.getState().removerGrupo(scene.id, grupoId);
}

/** Os ids dos itens de um grupo, incluindo os dos subgrupos. */
export function itensDoGrupo(scene: Scene, grupoId: string): string[] {
  const filhos = new Set([grupoId]);
  let cresceu = true;

  // Fecha o conjunto dos descendentes. Laço e não recursão porque a lista de
  // grupos é plana com `parentId`, e assim não há árvore para montar.
  while (cresceu) {
    cresceu = false;
    for (const grupo of scene.grupos ?? []) {
      if (grupo.parentId && filhos.has(grupo.parentId) && !filhos.has(grupo.id)) {
        filhos.add(grupo.id);
        cresceu = true;
      }
    }
  }

  return scene.items
    .filter((item) => item.grupoId && filhos.has(item.grupoId))
    .map((item) => item.id);
}

/**
 * O que um clique neste item no MAPA seleciona.
 *
 * Item em pasta: a pasta INTEIRA, sempre, e a de fora quando há pasta dentro
 * de pasta. Uma pasta é uma coisa só no mapa -- pegar um guarda move os
 * quatro --, e era o que faltava: sem isto, agrupar não mudava nada no palco
 * e a única forma de mexer em vários era Shift a cada clique.
 *
 * Para mexer num item sozinho, o caminho é a LISTA: abre a pasta, clica na
 * linha dele. Ele fica selecionado, e arrastá-lo no mapa move só ele --
 * `handleItemPointerDown` respeita a seleção que já existe. É o "entrar no
 * grupo" do Figma, com a lista no lugar do duplo clique.
 */
export function alvoDoClique(scene: Scene, item: CanvasItem): string[] {
  const grupos = scene.grupos ?? [];
  let cursor = item.grupoId;
  let raiz: string | undefined;

  while (cursor) {
    const grupo = grupos.find((candidato) => candidato.id === cursor);
    if (!grupo) break;
    raiz = grupo.id;
    cursor = grupo.parentId;
  }

  return raiz ? itensDoGrupo(scene, raiz) : [item.id];
}

/** Seleciona tudo o que está num grupo, subgrupos incluídos. */
export function selecionarGrupo(grupoId: string): void {
  const { scene } = read();
  if (!scene) return;

  useSelectionStore.getState().select(itensDoGrupo(scene, grupoId));
}

/**
 * Tudo o que o palco deixa pegar: imagens destravadas, textos soltos, formas,
 * papéis, cartões de nota e riscos -- as mesmas seis listas que a área laça.
 */
export function selectAllItems(): void {
  const { scene } = read();
  if (!scene) return;

  useSelectionStore.getState().selectMisto({
    itens: itensVisiveis(scene.items, scene.grupos)
      .filter((item) => !item.locked)
      .map((item) => item.id),
    // O travado fica de fora, como a imagem travada sempre ficou: selecionar
    // tudo é para mexer em tudo, e ele não se mexe. O escondido também: é o
    // que o mapa não mostra, e o Delete logo depois o levaria junto.
    textos: (scene.textos ?? []).filter(livre).map((texto) => texto.id),
    formas: (scene.formas ?? []).filter(livre).map((forma) => forma.id),
    postits: (scene.postits ?? []).map((postit) => postit.id),
    documentos: (scene.documentos ?? []).map((documento) => documento.id),
    tracos: (scene.tracos ?? []).map((traco) => traco.id),
  });
}

/** Alterna revelada/escondida da área selecionada, ou de uma indicada pelo id. */
export function toggleFogRevealed(fogId?: string): void {
  const { scene } = read();
  const id = fogId ?? useSelectionStore.getState().selectedFogId;
  const region = scene?.fog.find((candidate) => candidate.id === id);
  if (!scene || !region) return;

  useSceneStore
    .getState()
    .updateFog(scene.id, region.id, { revealed: !region.revealed });
}

/** Apaga a parede selecionada. */
export function removeParedeSelection(): void {
  const { scene } = read();
  const paredeId = useSelectionStore.getState().selectedParedeId;
  if (!scene || !paredeId) return;
  if (doChao(scene).paredes.some((parede) => parede.locked))
    return avisarTravado();

  useSceneStore.getState().removeParedes(scene.id, [paredeId]);
  useSelectionStore.getState().clear();
}

/** Apaga a porta selecionada. */
export function removePortaSelection(): void {
  const { scene } = read();
  const portaId = useSelectionStore.getState().selectedPortaId;
  if (!scene || !portaId) return;
  if (doChao(scene).portas.some((porta) => porta.locked)) return avisarTravado();

  useSceneStore.getState().removePortas(scene.id, [portaId]);
  useSelectionStore.getState().clear();
}

/** Apaga a luz cravada selecionada. A lanterna de um token sai pelo menu dele. */
export function removeLuzSelection(): void {
  const { scene } = read();
  const luzId = useSelectionStore.getState().selectedLuzId;
  if (!scene || !luzId) return;
  if (doChao(scene).luzes.some((luz) => luz.locked)) return avisarTravado();

  useSceneStore.getState().removeLuzes(scene.id, [luzId]);
  useSelectionStore.getState().clear();
}

/**
 * Apaga um ponto de anotação, fechando a nota dele antes.
 *
 * A ordem importa: o cartão se posiciona a partir do alfinete, e apagar
 * primeiro o deixaria um quadro sem ponto de onde se ancorar. Por isso o botão
 * no pé da nota e o Delete passam os dois por aqui.
 */
export function removePin(sceneId: string, pinId: string): void {
  usePinWindowStore.getState().fechar(pinId);
  useSceneStore.getState().removePin(sceneId, pinId);

  const selecao = useSelectionStore.getState();
  if (selecao.selectedPinId === pinId) selecao.clear();
}

/** Apaga o ponto de anotação selecionado. */
export function removePinSelection(): void {
  const { scene } = read();
  const pinId = useSelectionStore.getState().selectedPinId;
  if (!scene || !pinId) return;

  // Seleção de um ponto que já não existe: o Ctrl+Z desfez a criação dele com
  // ele na mão. Sem a guarda, o `removePin` do store gravaria no desfazer um
  // passo que não muda nada.
  if (!scene.pins?.some((pin) => pin.id === pinId)) {
    useSelectionStore.getState().clear();
    return;
  }

  removePin(scene.id, pinId);
}

/** Apaga o medidor selecionado. */
export function removeMedidorSelection(): void {
  const { scene } = read();
  const medidorId = useSelectionStore.getState().selectedMedidorId;
  if (!scene || !medidorId) return;

  useSceneStore.getState().removeMedidores(scene.id, [medidorId]);
  useSelectionStore.getState().clear();
}

/** Apaga a área de efeito selecionada. Travada, avisa e fica. */
export function removeAreaDeEfeitoSelection(): void {
  const { scene } = read();
  const areaId = useSelectionStore.getState().selectedAreaDeEfeitoId;
  if (!scene || !areaId) return;
  if (doChao(scene).areasDeEfeito.some((area) => area.locked)) return avisarTravado();

  useSceneStore.getState().removeAreaDeEfeito(scene.id, areaId);
  useSelectionStore.getState().clear();
}

export function removeFogSelection(): void {
  const { scene } = read();
  const fogId = useSelectionStore.getState().selectedFogId;
  if (!scene || !fogId) return;
  if (doChao(scene).areas.some((area) => area.locked)) return avisarTravado();

  useSceneStore.getState().removeFog(scene.id, fogId);
  useSelectionStore.getState().clear();
}

/**
 * Tira da tela o retrato selecionado, e esquece onde ele estava.
 *
 * Desde que retrato passou a ser de personagem, "apagar" não faz mais o
 * personagem sair de lugar nenhum: ele continua na cena e continua na lista. O
 * que se apaga é a ARRUMAÇÃO -- posição, tamanho, moldura. É o par da lixeira
 * na linha, e o oposto do olho, que tira do ar guardando tudo.
 *
 * Não passa pelo board: retrato é da sessão, e por isso também não entra no
 * histórico de desfazer — um Ctrl+Z depois de mover uma imagem não deve
 * ressuscitar um retrato que o mestre tirou de propósito.
 */
export function removePortraitSelection(): void {
  const { selectedPortraitIds } = useSelectionStore.getState();
  if (selectedPortraitIds.length === 0) return;

  const { remove } = usePortraitStore.getState();
  for (const portraitId of selectedPortraitIds) remove(portraitId);

  useSelectionStore.getState().clear();
}

/** Espelha a seleção no eixo pedido. Ver `flipPatches` para a regra. */
export function flipSelection(axis: FlipAxis): void {
  const { scene, selectedItems } = read();
  if (!scene || selectedItems.length === 0) return;

  useSceneStore
    .getState()
    .updateItems(scene.id, flipPatches(selectedItems, axis));
}

/**
 * Esmaece a seleção, ou a devolve ao normal.
 *
 * Age sobre TODOS os selecionados, travados inclusive — travar impede arrastar,
 * e não repintar, do mesmo jeito que travar não impede empilhar nem espelhar.
 *
 * 1 apaga o campo em vez de gravar `opacity: 1`: opaco é a ausência do efeito,
 * e é assim que o item nasce. Gravar o 1 deixaria toda cena velha com um campo
 * a mais dizendo o padrão.
 */
export function setSelectionOpacity(opacity: number): void {
  const { scene, selectedItems } = read();
  if (!scene || selectedItems.length === 0) return;

  const patch = { opacity: opacity >= 1 ? undefined : opacity };

  useSceneStore.getState().updateItems(
    scene.id,
    selectedItems.map((item) => ({ id: item.id, patch })),
  );
}

/**
 * O que o gizmo pede da sombra: trocar de jeito, mexer na linha do chão ou na
 * altura. Campo ausente fica como está.
 *
 * `nenhuma` é o interruptor de sempre (`semSombra`), e não um terceiro modo: o
 * jeito de deitar continua gravado embaixo dele, e escolher um dos dois de
 * novo devolve a sombra como ela era.
 */
export type PedidoDeSombra = {
  modo?: ModoDaSombra | "nenhuma";
  /** `null` devolve a linha do chão ao forno. */
  base?: number | null;
  altura?: number;
};

/** O patch que um pedido de sombra faz neste item. Ver `PedidoDeSombra`. */
export function patchDaSombra(
  item: Pick<CanvasItem, "sombra" | "semSombra">,
  pedido: PedidoDeSombra,
): Pick<CanvasItem, "sombra" | "semSombra"> {
  const atual: SombraDoItem = item.sombra ?? { modo: "base" };
  const modo =
    pedido.modo === undefined || pedido.modo === "nenhuma"
      ? atual.modo
      : pedido.modo;

  return {
    sombra: sombraParaGravar({
      ...atual,
      modo,
      ...(pedido.base === undefined ? {} : { base: pedido.base ?? undefined }),
      ...(pedido.altura === undefined ? {} : { altura: pedido.altura }),
    }),
    // `undefined` e não `false`, pela regra de toda opcional daqui: lançar
    // sombra é como o item nasce.
    semSombra:
      pedido.modo === undefined
        ? item.semSombra
        : pedido.modo === "nenhuma"
          ? true
          : undefined,
  };
}

/**
 * Muda a sombra da seleção. Age sobre os travados também, como a opacidade:
 * travar impede mover, e não repintar.
 */
export function setSelectionSombra(pedido: PedidoDeSombra): void {
  const { scene, selectedItems } = read();
  if (!scene || selectedItems.length === 0) return;

  useSceneStore.getState().updateItems(
    scene.id,
    selectedItems.map((item) => ({
      id: item.id,
      patch: patchDaSombra(item, pedido),
    })),
  );
}

/**
 * Os alcances que a lanterna de um token oferece, em unidade de cena.
 *
 * Três degraus, e não uma régua: o menu é o único lugar em que a lanterna do
 * token se ajusta, e "curta, média, longa" é a pergunta que a mesa faz -- a
 * vela, a tocha, o lampião. Ajuste fino fica para a luz cravada, que tem anel.
 */
export const ALCANCES_DA_LANTERNA = [
  { raio: 160, rotulo: t.itemActions.alcanceCurto },
  { raio: 260, rotulo: t.itemActions.alcanceMedio },
  { raio: 420, rotulo: t.itemActions.alcanceLongo },
] as const;

/** O alcance com que uma lanterna acende pela primeira vez: o do meio. */
const ALCANCE_DA_LANTERNA_PADRAO = 260;

/**
 * As aberturas que o facho da lanterna oferece, em graus.
 *
 * Três, pela razão do alcance: "estreito, médio, largo" é a pergunta da mesa
 * -- a lanterna de foco, a de mão, o farol. O do meio é o do cone de sempre.
 */
export const ABERTURAS_DA_LANTERNA = [
  { abertura: 35, rotulo: t.itemActions.aberturaEstreita },
  { abertura: 60, rotulo: t.itemActions.aberturaMedia },
  { abertura: 100, rotulo: t.itemActions.aberturaLarga },
] as const;

/**
 * As oito direções do facho, em graus NA FIGURA, na ordem da rosa do menu:
 * linha a linha, de cima para baixo, com o meio vazio. O `null` é o meio.
 *
 * Oito, e não um ângulo livre: o facho gira com o token, então o que o mestre
 * escolhe aqui é só para que lado o rosto do desenho olha -- e desenho de
 * token olha para um dos oito.
 */
export const DIRECOES_DA_LANTERNA: ReadonlyArray<number | null> = [
  225, 270, 315,
  180, null, 0,
  135, 90, 45,
];

/**
 * Acende, troca ou apaga a lanterna de todos os tokens selecionados.
 *
 * `null` apaga. Um patch mexe só no que traz: trocar a cor não pode encurtar a
 * lanterna que o mestre alongou, e mudar o alcance de uma apagada a acende na
 * cor que ela teria -- a primeira da paleta. `efeito: undefined` a deixa fixa.
 */
export function setSelectionLanterna(
  patch: Partial<LuzCarregada> | null,
): void {
  const { scene, selectedItems } = read();
  if (!scene || selectedItems.length === 0) return;

  useSceneStore.getState().updateItems(
    scene.id,
    selectedItems.map((item) => {
      if (patch === null) return { id: item.id, patch: { luz: undefined } };

      const atual: LuzCarregada = item.luz ?? {
        raio: ALCANCE_DA_LANTERNA_PADRAO,
        cor: CORES_DA_LUZ[0],
      };
      // A fixa grava como AUSENTE, e não como `efeito: undefined`: é a
      // lanterna de sempre, e o arquivo não ganha um campo por isso. O círculo
      // é a ausência do cone, pela mesma razão.
      const { efeito, cone, ...resto } = { ...atual, ...patch };

      return {
        id: item.id,
        patch: {
          luz: {
            ...resto,
            ...(efeito ? { efeito } : {}),
            ...(cone ? { cone } : {}),
          },
        },
      };
    }),
  );
}

/**
 * Aponta ou abre o facho da lanterna de todos os tokens selecionados.
 *
 * Por token, e não um cone só para todos: mudar a ABERTURA da horda não pode
 * virar para o mesmo lado o facho de cada um, que o mestre apontou um a um.
 * Quem ainda era círculo vira cone, e quem nem tinha lanterna acende -- é o
 * que o gesto de apontar pede.
 */
export function apontarLanterna(parcial: Partial<ConeDaLuz>): void {
  const { scene, selectedItems } = read();
  if (!scene || selectedItems.length === 0) return;

  useSceneStore.getState().updateItems(
    scene.id,
    selectedItems.map((item) => {
      const atual: LuzCarregada = item.luz ?? {
        raio: ALCANCE_DA_LANTERNA_PADRAO,
        cor: CORES_DA_LUZ[0],
      };

      return {
        id: item.id,
        patch: {
          luz: {
            ...atual,
            cone: { ...(atual.cone ?? CONE_DA_LANTERNA), ...parcial },
          },
        },
      };
    }),
  );
}

/**
 * A lanterna que a seleção INTEIRA tem, quando é uma só.
 *
 * `null` = todas apagadas, e o menu marca "Apagada". `undefined` = elas
 * discordam, e nenhum degrau fica marcado -- a mesma regra da opacidade.
 */
export function lanternaDaSelecao(
  items: CanvasItem[],
): LuzCarregada | null | undefined {
  if (items.length === 0) return undefined;

  const primeira = items[0]?.luz ?? null;
  const igual = (luz: LuzCarregada | undefined) =>
    primeira === null
      ? luz === undefined
      : luz?.cor === primeira.cor &&
        luz.raio === primeira.raio &&
        luz.efeito === primeira.efeito &&
        luz.cone?.angulo === primeira.cone?.angulo &&
        luz.cone?.abertura === primeira.cone?.abertura;

  return items.every((item) => igual(item.luz)) ? primeira : undefined;
}

/**
 * A forma da lanterna que a seleção inteira tem, e o facho, quando é um só.
 *
 * Cada campo por conta própria, e não tudo ou nada como `lanternaDaSelecao`:
 * a horda pode concordar que é cone e discordar para onde cada um aponta -- é
 * o caso comum, porque o facho gira com o token --, e o menu ainda precisa
 * marcar "Cone" e mostrar a rosa, só sem direção marcada.
 */
export function fachoDaSelecao(items: CanvasItem[]): {
  forma: "circulo" | "cone" | null;
  angulo: number | null;
  abertura: number | null;
} {
  const luzes = items.map((item) => item.luz);
  const cones = luzes.map((luz) => luz?.cone);

  const forma =
    luzes.length > 0 && cones.every(Boolean)
      ? "cone"
      : luzes.length > 0 && luzes.every((luz) => luz && !luz.cone)
        ? "circulo"
        : null;

  const comum = (campo: keyof ConeDaLuz): number | null =>
    forma === "cone" && cones.every((cone) => cone![campo] === cones[0]![campo])
      ? cones[0]![campo]
      : null;

  return { forma, angulo: comum("angulo"), abertura: comum("abertura") };
}

/**
 * A opacidade que a seleção INTEIRA tem, quando é uma só.
 *
 * `undefined` quando os selecionados discordam — e aí o menu não marca degrau
 * nenhum, que é a verdade: não há um valor para marcar.
 */
export function opacidadeDaSelecao(items: CanvasItem[]): number | undefined {
  if (items.length === 0) return undefined;

  const primeira = items[0]?.opacity ?? 1;

  return items.every((item) => (item.opacity ?? 1) === primeira)
    ? primeira
    : undefined;
}

/** De quanto a seleção gira por passo: uma tecla, um entalhe da roda. */
export const PASSO_DE_GIRO = 15;
/** De quanto a seleção cresce ou encolhe por entalhe da roda. */
export const PASSO_DE_TAMANHO = 1.1;

/**
 * Gira cada item em torno do próprio centro.
 *
 * Do PRÓPRIO centro, e não do centro da seleção: girar um grupo em bloco
 * mudaria a posição de cada peça, e a seta é um ajuste fino -- o mestre quer
 * a estátua um pouco mais torta, não a sala inteira rodando.
 */
export function girarPatches(
  items: (PecaDoGrupo & { locked?: boolean })[],
  graus: number,
): ItemPatch[] {
  return items
    .filter((item) => !item.locked)
    .map((item) => ({
      id: item.id,
      patch: { rotation: normalizeAngle(item.rotation + graus) },
    }));
}

/**
 * Amplia ou encolhe os itens em torno de um centro comum.
 *
 * Nada muda se algum item ficaria abaixo do mínimo: encolher só uma parte do
 * grupo desalinharia o que estava alinhado.
 */
export function escalarPatches(
  items: (PecaDoGrupo & { locked?: boolean })[],
  fator: number,
  centro: { x: number; y: number },
): ItemPatch[] {
  const livres = items.filter((item) => !item.locked);
  const cabe = livres.every(
    (item) =>
      item.width * fator >= MIN_ITEM_SIZE &&
      item.height * fator >= MIN_ITEM_SIZE,
  );
  if (!cabe) return [];

  return livres.map((item) => {
    const width = item.width * fator;
    const height = item.height * fator;
    const cx = centro.x + (item.x + item.width / 2 - centro.x) * fator;
    const cy = centro.y + (item.y + item.height / 2 - centro.y) * fator;

    return {
      id: item.id,
      patch: {
        x: Math.round(cx - width / 2),
        y: Math.round(cy - height / 2),
        width: Math.round(width),
        height: Math.round(height),
      },
    };
  });
}

export function rotateSelection(graus: number): void {
  const { scene, selectedItems, selectedTextos, selectedFormas } = read();
  if (!scene || naoHaNada(selectedItems, selectedTextos, selectedFormas)) return;

  useSceneStore
    .getState()
    .updateItems(scene.id, girarPatches(selectedItems, graus));
  // Cada texto vira onde está, como o item: as setas não orbitam nada.
  useSceneStore
    .getState()
    .updateTextos(
      scene.id,
      girarTextosNoLugar(selectedTextos.filter(livre), graus),
    );
  useSceneStore
    .getState()
    .updateFormas(scene.id, girarPatches(selectedFormas, graus));
}

/** Há postit ou cartão na mão? É o que tira o Ctrl+= do zoom do palco. */
export function temPapelNaMao(): boolean {
  const { selectedPostitIds, selectedDocumentoIds } =
    useSelectionStore.getState();

  return selectedPostitIds.length > 0 || selectedDocumentoIds.length > 0;
}

/**
 * A letra de cada postit e cartão na mão, um degrau para o lado pedido.
 *
 * Cada papel anda o PRÓPRIO degrau, e não todos para o mesmo tamanho: um
 * título em 30 e uma lista em 13 continuam em tamanhos diferentes depois do
 * toque, como continuariam com o botão A↑ de cada um. O resto da seleção --
 * imagem, texto solto, forma -- não tem escada e fica como está.
 */
export function mudarFonteDaSelecao(sentido: 1 | -1): void {
  const { scene, selectedPostits, selectedDocumentos } = read();
  if (!scene) return;

  useSceneStore.getState().updatePostits(
    scene.id,
    selectedPostits.map((postit) => ({
      id: postit.id,
      patch: {
        fonte: degrauDeFonte(postit.fonte ?? POSTIT_FONTE, sentido),
      },
    })),
  );
  useSceneStore.getState().updateDocumentos(
    scene.id,
    selectedDocumentos.map((documento) => ({
      id: documento.id,
      patch: {
        fonte: degrauDeFonte(documento.fonte ?? DOCUMENTO_FONTE, sentido),
      },
    })),
  );
}

export function nudgeSelection(dx: number, dy: number): void {
  const {
    scene,
    selectedItems,
    selectedTextos,
    selectedFormas,
    selectedPostits,
    selectedDocumentos,
    selectedTracos,
  } = read();
  if (!scene) return;
  const papeis = [...selectedPostits, ...selectedDocumentos];
  if (
    naoHaNada(selectedItems, selectedTextos, selectedFormas) &&
    papeis.length === 0 &&
    selectedTracos.length === 0
  )
    return;

  // A cerca do papel prende o passo do conjunto inteiro, como no arrasto: ver
  // `deslocamentoPreso`. Sem papel na mão, o passo é o que veio.
  const passo = deslocamentoPreso(papeis, dx, dy);

  useSceneStore.getState().updateItems(
    scene.id,
    moveGroup(
      selectedItems.filter((item) => !item.locked),
      passo.dx,
      passo.dy,
    ),
  );
  useSceneStore
    .getState()
    .updateTextos(
      scene.id,
      empurrarTextos(selectedTextos.filter(livre), passo.dx, passo.dy),
    );
  useSceneStore
    .getState()
    .updateFormas(
      scene.id,
      moveGroup(selectedFormas.filter(livre), passo.dx, passo.dy),
    );
  useSceneStore
    .getState()
    .updatePostits(
      scene.id,
      empurrarPostits(selectedPostits, passo.dx, passo.dy),
    );
  useSceneStore
    .getState()
    .updateDocumentos(
      scene.id,
      empurrarDocumentos(selectedDocumentos, passo.dx, passo.dy),
    );
  useSceneStore
    .getState()
    .updateTracos(scene.id, empurrarTracos(selectedTracos, passo.dx, passo.dy));
}

/** Nada na mão nas três listas que escalam e giram. */
function naoHaNada(
  itens: PecaDoGrupo[],
  textos: Texto[],
  formas: PecaDoGrupo[],
): boolean {
  return itens.length === 0 && textos.length === 0 && formas.length === 0;
}
