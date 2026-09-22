"use client";

import { create } from "zustand";

import { SCENE_BROADCAST_INTERVAL_MS } from "@/lib/sync/channel";
import {
  useSceneStore,
  type FormaPatch,
  type ItemPatch,
  type TextoPatch,
} from "@/lib/store/use-scene-store";
import { gravarCameraManual } from "@/lib/mestre/camera-actions";
import type { Scene, Viewport } from "@/types/scene";

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
  /** A moldura da câmera sendo arrastada, com o recorte que ela já tem. */
  camera: { cameraId: string; viewport: Viewport } | null;

  mover: (
    sceneId: string,
    patches: ItemPatch[],
    textos: TextoPatch[],
    formas: FormaPatch[],
  ) => void;
  moverCamera: (sceneId: string, cameraId: string, viewport: Viewport) => void;
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
 * A exceção é a mesa no ar: quem assiste precisa ver o token andar. Aí o
 * board é gravado no ritmo do canal (`SCENE_BROADCAST_INTERVAL_MS`), e o
 * histórico funde os commits do mesmo gesto (`COALESCE_MS`).
 *
 * Só o `MestreStage` assina isto. É o que faz o gesto custar um render de um
 * componente, e não da árvore.
 */
export const useGestoStore = create<GestoStore>((set) => ({
  sceneId: null,
  patches: null,
  textos: null,
  formas: null,
  camera: null,

  // Lista vazia vira `null`: um gesto só de texto não tem por que devolver uma
  // lista de itens nova a cada quadro, e é a identidade dela que faz os
  // quarenta tokens do mapa ficarem parados. Ver `aplicarGesto`.
  mover: (sceneId, patches, textos, formas) =>
    set({
      sceneId,
      patches: patches.length > 0 ? patches : null,
      textos: textos.length > 0 ? textos : null,
      formas: formas.length > 0 ? formas : null,
    }),
  moverCamera: (sceneId, cameraId, viewport) =>
    set({ sceneId, camera: { cameraId, viewport } }),
  terminar: () =>
    set({
      sceneId: null,
      patches: null,
      textos: null,
      formas: null,
      camera: null,
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
  >,
): Scene {
  if (gesto.sceneId !== scene.id) return scene;
  if (!gesto.patches && !gesto.textos && !gesto.formas && !gesto.camera)
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

  return vista;
}

/** Quando o board foi gravado pela última vez por um gesto ao vivo. */
let ultimaGravacaoAoVivo = 0;

/**
 * Um quadro do gesto: guarda os patches, e grava no board só se a mesa está
 * vendo esta cena e já passou um intervalo do canal desde a última gravação.
 */
export function moverNoGesto(
  sceneId: string,
  patches: ItemPatch[],
  textos: TextoPatch[] = [],
  formas: FormaPatch[] = [],
): void {
  useGestoStore.getState().mover(sceneId, patches, textos, formas);

  const { board, updateItems, updateTextos, updateFormas } =
    useSceneStore.getState();
  if (board?.liveSceneId !== sceneId) return;

  const agora = performance.now();
  if (agora - ultimaGravacaoAoVivo < SCENE_BROADCAST_INTERVAL_MS) return;

  ultimaGravacaoAoVivo = agora;
  updateItems(sceneId, patches);
  updateTextos(sceneId, textos);
  updateFormas(sceneId, formas);
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
): void {
  if (patches.length > 0) useSceneStore.getState().updateItems(sceneId, patches);
  if (textos.length > 0) useSceneStore.getState().updateTextos(sceneId, textos);
  if (formas.length > 0) useSceneStore.getState().updateFormas(sceneId, formas);
  useGestoStore.getState().terminar();
  ultimaGravacaoAoVivo = 0;
}

/**
 * Um quadro do arrasto da moldura. Grava no board só se a mesa está vendo
 * esta cena E esta câmera está no ar -- fora disso ninguém além do mestre vê
 * a moldura andar, e o board pode esperar a mão soltar.
 */
export function moverCameraNoGesto(
  sceneId: string,
  cameraId: string,
  viewport: Viewport,
): void {
  useGestoStore.getState().moverCamera(sceneId, cameraId, viewport);

  const { board, atualizarCamera } = useSceneStore.getState();
  const scene = board?.scenes.find((s) => s.id === sceneId);
  if (board?.liveSceneId !== sceneId || scene?.cameraNoArId !== cameraId) return;

  const agora = performance.now();
  if (agora - ultimaGravacaoAoVivo < SCENE_BROADCAST_INTERVAL_MS) return;

  ultimaGravacaoAoVivo = agora;
  atualizarCamera(sceneId, cameraId, { viewport });
}

/**
 * A mão soltou a moldura: grava pelo caminho MANUAL, que solta a trava da
 * câmera como o gesto sempre fez (ver `gravarCameraManual`).
 */
export function terminarGestoDaCamera(): void {
  const { camera } = useGestoStore.getState();
  if (camera) gravarCameraManual(camera.cameraId, camera.viewport);
  useGestoStore.getState().terminar();
  ultimaGravacaoAoVivo = 0;
}
