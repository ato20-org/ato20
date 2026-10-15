"use client";

import { create } from "zustand";

import { SCENE_BROADCAST_INTERVAL_MS } from "@/lib/sync/channel";
import {
  useSceneStore,
  type DocumentoPatch,
  type FormaPatch,
  type ItemPatch,
  type PostitPatch,
  type TextoPatch,
  type TracoPatch,
} from "@/lib/store/use-scene-store";
import { gravarCameraManual } from "@/lib/mestre/camera-actions";
import { publicarCenaAoVivo } from "@/hooks/use-scene-broadcast";
import type { Porta, Scene, Tripe, Viewport } from "@/types/scene";

/**
 * O que o gesto está fazendo com papel, cartão e risco.
 *
 * Um saco com nome e não três parâmetros posicionais a mais: `mover` já levava
 * quatro listas, e uma quinta, sexta e sétima posição transformariam toda
 * chamada curta -- `moverNoGesto(id, patches)` -- num rastro de `[]` vazios só
 * para alcançar a última.
 */
export type PatchesSemAlca = {
  postits?: PostitPatch[];
  documentos?: DocumentoPatch[];
  tracos?: TracoPatch[];
};

type GestoStore = {
  /** A cena em que há um gesto em curso. `null` = mão solta. */
  sceneId: string | null;
  /** O que o gesto já fez com cada item, por cima do board. */
  patches: ItemPatch[] | null;
  /**
   * O mesmo para os textos soltos que vieram junto na seleção.
   *
   * Lista à parte e não misturada aos itens porque são duas listas na cena, e
   * o texto escala pela FONTE e não por largura e altura -- ver
   * `grupo-de-textos`. Anda pelo mesmo caminho pela mesma razão: arrastar uma
   * frase gravava o board a cada quadro, com cópia, passo de histórico e o
   * `MestreShell` inteiro re-renderizado atrás.
   */
  textos: TextoPatch[] | null;
  /**
   * E as formas do quadro. Lista própria pela mesma razão: outra lista na cena.
   * A geometria é a do item, então o patch é o mesmo -- ver `Forma`.
   */
  formas: FormaPatch[] | null;
  /**
   * E os três que só ANDAM: papel, cartão de nota e risco.
   *
   * Aqui pela mesma razão que os outros, e com um motivo a mais. Arrastar um
   * postit gravava no board a CADA quadro -- era o gesto mais caro que sobrou
   * no palco depois que item e texto saíram deste caminho --, e arrastar um
   * grupo laçado pela área multiplicaria isso pelo tamanho do grupo. O risco é
   * pior: cada quadro reescreve as duzentas amostras dele, e um commit por
   * quadro copiaria a cena inteira junto.
   *
   * Listas próprias e não uma só porque são três listas na cena. Ver
   * `grupo-sem-alca`.
   */
  postits: PostitPatch[] | null;
  documentos: DocumentoPatch[] | null;
  tracos: TracoPatch[] | null;
  /** A moldura da câmera sendo arrastada, com o recorte que ela já tem. */
  camera: { cameraId: string; viewport: Viewport } | null;
  /**
   * O tripé sendo arrastado pelo gizmo do 2.5D, com o olho que ele já tem.
   * Mesmo princípio da moldura: o board só sabe dele ao soltar.
   */
  tripe: { tripeId: string; olho: Tripe } | null;
  /**
   * A porta sendo aberta, movida ou refeita pela dobradiça, com o que já
   * mudou nela. A folha que gira refaz a luz que ela alcança, e o board
   * gravando a cada quadro somaria a isso o `MestreShell` inteiro. Ver
   * `PortaMarcadores`.
   */
  porta: { portaId: string; patch: Partial<Omit<Porta, "id">> } | null;

  mover: (
    sceneId: string,
    patches: ItemPatch[],
    textos: TextoPatch[],
    formas: FormaPatch[],
    semAlca?: PatchesSemAlca,
  ) => void;
  moverCamera: (sceneId: string, cameraId: string, viewport: Viewport) => void;
  /**
   * Larga só a câmera, e deixa o resto do gesto onde está.
   *
   * Existe porque a câmera ganhou um gesto que não ocupa a mão: as setas
   * seguradas (ver `camera-nas-setas`). Com o mouse livre, o mestre pode
   * arrastar um token enquanto a câmera anda, e soltar a seta pelo `terminar`
   * devolvia o token ao lugar de antes do arrasto, com a mão ainda fechada.
   */
  soltarCamera: () => void;
  moverTripe: (sceneId: string, tripeId: string, olho: Tripe) => void;
  /** Larga só o tripé, como `soltarCamera`. */
  soltarTripe: () => void;
  moverPorta: (
    sceneId: string,
    portaId: string,
    patch: Partial<Omit<Porta, "id">>,
  ) => void;
  /** Larga só a porta, como `soltarCamera`. */
  soltarPorta: () => void;
  terminar: () => void;
};

/**
 * O GESTO sobre itens, separado do DOCUMENTO.
 *
 * Mover, girar ou escalar um token gravava no board a cada quadro -- e a
 * cada notch da roda com o item na mão. Cada gravação é um commit: cópia do
 * board, passo de histórico, três assinantes acordados, `MestreShell` inteiro
 * re-renderizado, `limitesDoConteudo`, cena filtrada para a mesa. Sessenta
 * vezes por segundo, para uma mudança que só interessa a quem está olhando o
 * palco. O fantasma da aba de personagens era leve justamente porque nunca
 * passava por nada disso: o board só o conhece quando a mão solta.
 *
 * Aqui mora o mesmo princípio para o que já está no mapa. Durante o gesto os
 * patches ficam neste store, e o `MestreStage` renderiza a cena do board COM
 * eles aplicados por cima (`aplicarGesto`). Alças, setas, caixa de seleção e
 * o `SceneLayer` continuam lendo `scene` como sempre -- só a origem da cena
 * mudou. O board recebe UM `updateItems` no `pointerup`, que é também um
 * passo de desfazer só.
 *
 * A mesa no ar não é exceção: quem assiste precisa ver o token andar, e vê,
 * porque a vista com o gesto aplicado é PUBLICADA no ritmo do canal
 * (`SCENE_BROADCAST_INTERVAL_MS`) sem passar pelo board -- ver
 * `publicarGestoAoVivo`. Houve uma versão que gravava o board nesse ritmo e
 * deixava o histórico fundir os commits (`COALESCE_MS`); saiu porque cada
 * gravação era o `MestreShell` inteiro re-renderizado.
 *
 * Só o `MestreStage` assina isto. É o que faz o gesto custar um render de um
 * componente, e não da árvore.
 */
export const useGestoStore = create<GestoStore>((set) => ({
  sceneId: null,
  patches: null,
  textos: null,
  formas: null,
  postits: null,
  documentos: null,
  tracos: null,
  camera: null,
  tripe: null,
  porta: null,

  // Lista vazia vira `null`: um gesto só de texto não tem por que devolver uma
  // lista de itens nova a cada quadro, e é a identidade dela que faz os
  // quarenta tokens do mapa ficarem parados. Ver `aplicarGesto`.
  mover: (sceneId, patches, textos, formas, semAlca) =>
    set({
      sceneId,
      patches: patches.length > 0 ? patches : null,
      textos: textos.length > 0 ? textos : null,
      formas: formas.length > 0 ? formas : null,
      postits: semAlca?.postits?.length ? semAlca.postits : null,
      documentos: semAlca?.documentos?.length ? semAlca.documentos : null,
      tracos: semAlca?.tracos?.length ? semAlca.tracos : null,
    }),
  moverCamera: (sceneId, cameraId, viewport) =>
    set({ sceneId, camera: { cameraId, viewport } }),
  soltarCamera: () =>
    set((state) => {
      const resta =
        state.patches ||
        state.textos ||
        state.formas ||
        state.postits ||
        state.documentos ||
        state.tracos;

      return {
        camera: null,
        sceneId: resta || state.tripe || state.porta ? state.sceneId : null,
      };
    }),
  moverTripe: (sceneId, tripeId, olho) =>
    set({ sceneId, tripe: { tripeId, olho } }),
  soltarTripe: () =>
    set((state) => {
      const resta =
        state.patches ||
        state.textos ||
        state.formas ||
        state.postits ||
        state.documentos ||
        state.tracos ||
        state.camera ||
        state.porta;

      return { tripe: null, sceneId: resta ? state.sceneId : null };
    }),
  moverPorta: (sceneId, portaId, patch) =>
    set({ sceneId, porta: { portaId, patch } }),
  soltarPorta: () =>
    set((state) => {
      const resta =
        state.patches ||
        state.textos ||
        state.formas ||
        state.postits ||
        state.documentos ||
        state.tracos ||
        state.camera ||
        state.tripe;

      return { porta: null, sceneId: resta ? state.sceneId : null };
    }),
  terminar: () =>
    set({
      sceneId: null,
      patches: null,
      textos: null,
      formas: null,
      postits: null,
      documentos: null,
      tracos: null,
      camera: null,
      tripe: null,
      porta: null,
    }),
}));

/**
 * A cena como o palco deve desenhá-la agora: a do board, com o gesto em
 * curso por cima. Sem gesto -- ou gesto de outra cena -- devolve a MESMA
 * referência, para nada abaixo re-renderizar à toa.
 *
 * Preserva a identidade dos itens que o gesto não toca: o `CanvasItemView` é
 * `memo`, e um mapa com quarenta tokens só redesenha o que anda.
 */
export function aplicarGesto(
  scene: Scene,
  gesto: Pick<
    GestoStore,
    "sceneId" | "patches" | "textos" | "formas" | "camera"
  > &
    // Os três que só andam entram como OPCIONAIS: quem não os conhece --
    // um teste do gesto de câmera, um chamador antigo -- continua passando o
    // mesmo objeto de antes, e ausente é o mesmo que nenhum.
    Partial<
      Pick<GestoStore, "postits" | "documentos" | "tracos" | "tripe" | "porta">
    >,
): Scene {
  if (gesto.sceneId !== scene.id) return scene;
  if (
    !gesto.patches &&
    !gesto.textos &&
    !gesto.formas &&
    !gesto.postits &&
    !gesto.documentos &&
    !gesto.tracos &&
    !gesto.camera &&
    !gesto.tripe &&
    !gesto.porta
  )
    return scene;

  let vista = scene;

  if (gesto.patches) {
    const porId = new Map(gesto.patches.map(({ id, patch }) => [id, patch]));
    vista = {
      ...vista,
      items: vista.items.map((item) => {
        const patch = porId.get(item.id);
        return patch ? { ...item, ...patch } : item;
      }),
    };
  }

  if (gesto.textos) {
    const porId = new Map(gesto.textos.map(({ id, patch }) => [id, patch]));
    vista = {
      ...vista,
      textos: vista.textos?.map((texto) => {
        const patch = porId.get(texto.id);
        return patch ? { ...texto, ...patch } : texto;
      }),
    };
  }

  if (gesto.formas) {
    const porId = new Map(gesto.formas.map(({ id, patch }) => [id, patch]));
    vista = {
      ...vista,
      formas: vista.formas?.map((forma) => {
        const patch = porId.get(forma.id);
        return patch ? { ...forma, ...patch } : forma;
      }),
    };
  }

  if (gesto.postits) {
    const porId = new Map(gesto.postits.map(({ id, patch }) => [id, patch]));
    vista = {
      ...vista,
      postits: vista.postits?.map((postit) => {
        const patch = porId.get(postit.id);
        return patch ? { ...postit, ...patch } : postit;
      }),
    };
  }

  if (gesto.documentos) {
    const porId = new Map(gesto.documentos.map(({ id, patch }) => [id, patch]));
    vista = {
      ...vista,
      documentos: vista.documentos?.map((documento) => {
        const patch = porId.get(documento.id);
        return patch ? { ...documento, ...patch } : documento;
      }),
    };
  }

  if (gesto.tracos) {
    const porId = new Map(gesto.tracos.map(({ id, patch }) => [id, patch]));
    vista = {
      ...vista,
      tracos: vista.tracos?.map((traco) => {
        const patch = porId.get(traco.id);
        return patch ? { ...traco, ...patch } : traco;
      }),
    };
  }

  if (gesto.camera) {
    const { cameraId, viewport } = gesto.camera;
    vista = {
      ...vista,
      cameras: vista.cameras?.map((camera) =>
        camera.id === cameraId ? { ...camera, viewport } : camera,
      ),
      // No ar, o recorte da mesa é o dela -- o mesmo espelho de `atualizarCamera`.
      camera: vista.cameraNoArId === cameraId ? viewport : vista.camera,
    };
  }

  if (gesto.tripe) {
    const { tripeId, olho } = gesto.tripe;
    vista = {
      ...vista,
      tripes: vista.tripes?.map((tripe) =>
        tripe.id === tripeId ? { ...tripe, ...olho } : tripe,
      ),
      // No ar, o olho da mesa é o dele -- o mesmo espelho de `atualizarTripe`.
      tripeNoAr: vista.cameraNoArId === tripeId ? olho : vista.tripeNoAr,
    };
  }

  if (gesto.porta) {
    const { portaId, patch } = gesto.porta;
    vista = {
      ...vista,
      portas: vista.portas?.map((porta) =>
        porta.id === portaId ? { ...porta, ...patch } : porta,
      ),
    };
  }

  return vista;
}

/** Quando a mesa recebeu pela última vez um quadro do gesto em curso. */
let ultimaPublicacaoAoVivo = 0;

/**
 * A mesa vê o gesto SEM o board saber dele.
 *
 * Se a cena do gesto está no ar e já passou um intervalo do canal desde a
 * última vez, publica a cena do board com o gesto aplicado por cima -- a
 * mesma vista que o palco desenha. Antes isto era um commit no board a cada
 * intervalo, e um commit é o `MestreShell` inteiro re-renderizado: medido na
 * webview, 17 a 24 ms cada, dois ou três quadros perdidos a cada dez
 * enquanto a mão está fechada. O board continua recebendo um commit só, ao
 * soltar, que é também um passo de desfazer só.
 */
function publicarGestoAoVivo(sceneId: string, alvo?: (scene: Scene) => boolean): void {
  const { board } = useSceneStore.getState();
  if (board?.liveSceneId !== sceneId) return;

  const scene = board.scenes.find((atual) => atual.id === sceneId);
  if (!scene || (alvo && !alvo(scene))) return;

  const agora = performance.now();
  if (agora - ultimaPublicacaoAoVivo < SCENE_BROADCAST_INTERVAL_MS) return;

  ultimaPublicacaoAoVivo = agora;
  publicarCenaAoVivo(aplicarGesto(scene, useGestoStore.getState()));
}

/**
 * Um quadro do gesto: guarda os patches, e manda a vista à mesa se ela está
 * vendo esta cena. Ver `publicarGestoAoVivo`.
 */
export function moverNoGesto(
  sceneId: string,
  patches: ItemPatch[],
  textos: TextoPatch[] = [],
  formas: FormaPatch[] = [],
  semAlca?: PatchesSemAlca,
): void {
  useGestoStore.getState().mover(sceneId, patches, textos, formas, semAlca);
  publicarGestoAoVivo(sceneId);
}

/**
 * A mão soltou: o resultado vai para o board de uma vez, e o gesto some.
 *
 * Board primeiro, gesto depois, na mesma tarefa: o React agrupa os dois
 * estados num render, e o palco não mostra um quadro com o item de volta ao
 * lugar de antes do gesto.
 */
export function terminarGesto(
  sceneId: string,
  patches: ItemPatch[],
  textos: TextoPatch[] = [],
  formas: FormaPatch[] = [],
  semAlca?: PatchesSemAlca,
): void {
  if (patches.length > 0) useSceneStore.getState().updateItems(sceneId, patches);
  if (textos.length > 0) useSceneStore.getState().updateTextos(sceneId, textos);
  if (formas.length > 0) useSceneStore.getState().updateFormas(sceneId, formas);
  if (semAlca?.postits?.length)
    useSceneStore.getState().updatePostits(sceneId, semAlca.postits);
  if (semAlca?.documentos?.length)
    useSceneStore.getState().updateDocumentos(sceneId, semAlca.documentos);
  if (semAlca?.tracos?.length)
    useSceneStore.getState().updateTracos(sceneId, semAlca.tracos);
  useGestoStore.getState().terminar();
  ultimaPublicacaoAoVivo = 0;
}

/**
 * Um quadro do arrasto da moldura. Manda a vista à mesa só se ela está vendo
 * esta cena E esta câmera está no ar -- fora disso ninguém além do mestre vê
 * a moldura andar, e o board pode esperar a mão soltar.
 */
export function moverCameraNoGesto(
  sceneId: string,
  cameraId: string,
  viewport: Viewport,
): void {
  useGestoStore.getState().moverCamera(sceneId, cameraId, viewport);
  publicarGestoAoVivo(sceneId, (scene) => scene.cameraNoArId === cameraId);
}

/**
 * A mão soltou a moldura: grava pelo caminho MANUAL, que solta a trava da
 * câmera como o gesto sempre fez (ver `gravarCameraManual`).
 *
 * Larga SÓ a câmera. Ver `soltarCamera`.
 */
export function terminarGestoDaCamera(): void {
  const { camera } = useGestoStore.getState();
  if (camera) gravarCameraManual(camera.cameraId, camera.viewport);
  useGestoStore.getState().soltarCamera();
  ultimaPublicacaoAoVivo = 0;
}

/**
 * Um quadro do arrasto do gizmo do tripé. Manda a vista à mesa só se ela está
 * vendo esta cena E este tripé está no ar, como `moverCameraNoGesto`.
 */
export function moverTripeNoGesto(
  sceneId: string,
  tripeId: string,
  olho: Tripe,
): void {
  useGestoStore.getState().moverTripe(sceneId, tripeId, olho);
  publicarGestoAoVivo(sceneId, (scene) => scene.cameraNoArId === tripeId);
}

/**
 * A mão soltou o gizmo: o olho vai para o board de uma vez -- um passo de
 * desfazer só -- e o gesto do tripé some. Larga SÓ o tripé.
 */
export function terminarGestoDoTripe(): void {
  const { sceneId, tripe } = useGestoStore.getState();
  if (sceneId && tripe) {
    useSceneStore.getState().atualizarTripe(sceneId, tripe.tripeId, tripe.olho);
  }
  useGestoStore.getState().soltarTripe();
  ultimaPublicacaoAoVivo = 0;
}

/**
 * Um quadro do arrasto de uma porta. A mesa vê a folha girar se está nesta
 * cena: é a sala do outro lado acendendo, e quem joga precisa ver isso.
 */
export function moverPortaNoGesto(
  sceneId: string,
  portaId: string,
  patch: Partial<Omit<Porta, "id">>,
): void {
  useGestoStore.getState().moverPorta(sceneId, portaId, patch);
  publicarGestoAoVivo(sceneId);
}

/**
 * A mão soltou a porta: o que mudou vai para o board de uma vez -- um passo de
 * desfazer só -- e o gesto da porta some. Larga SÓ a porta.
 */
export function terminarGestoDaPorta(): void {
  const { sceneId, porta } = useGestoStore.getState();
  if (sceneId && porta) {
    useSceneStore.getState().updatePorta(sceneId, porta.portaId, porta.patch);
  }
  useGestoStore.getState().soltarPorta();
  ultimaPublicacaoAoVivo = 0;
}
