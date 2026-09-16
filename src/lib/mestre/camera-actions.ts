"use client";

import { boundsOfItems, type Bounds } from "@/lib/geometry/bounds";
import {
  clampViewport,
  viewportQueCabe,
  zoomViewportCentered,
} from "@/lib/geometry/viewport";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import {
  selectEditingScene,
  useSceneStore,
} from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { CameraSalva, Scene, Viewport } from "@/types/scene";

/**
 * De quanto a câmera anda por toque de seta, como fração da própria largura.
 *
 * Fração e não unidades de cena: a câmera fechada num corredor precisa andar
 * menos por toque do que a câmera aberta na sala inteira, e "um vinte avos do
 * que a mesa vê" é o mesmo gesto nos dois casos.
 */
export const PASSO_CAMERA = 0.05;
export const PASSO_CAMERA_LARGO = 0.25;

/** Passo dos botões, do slider por toque e da roda sobre a alça. */
export const ZOOM_CAMERA_STEP = 1.25;

/**
 * Folga em volta da seleção ao enquadrá-la, como fração do maior lado.
 *
 * Sem folga o token encostaria na borda da TV, e a mesa não veria em que ele
 * está encostado.
 */
const MARGEM_SELECAO = 0.35;

/**
 * Ações do Mestre sobre a câmera SELECIONADA, em um lugar só.
 *
 * O mesmo motivo de `item-actions.ts`: atalho, botão da pílula, alça da
 * moldura e menu de contexto chamam ESTAS funções. Se cada um calculasse o
 * próprio deslocamento, "andar com a seta" e "arrastar pela alça" divergiriam
 * no primeiro ajuste de clamp.
 *
 * Selecionada, e não a que está no ar: o mestre edita a que escolheu, e a
 * mesa só vê se ela estiver transmitindo. Ver `useCameraLockStore`.
 *
 * Todas leem o estado via `getState()` na hora, para o listener de atalhos
 * poder ser montado uma vez e nunca mais.
 */
function lerCena(): Scene | null {
  return selectEditingScene(useSceneStore.getState());
}

/** A câmera que o mestre está editando, ou nada antes da cena abrir. */
export function cameraSelecionada(): CameraSalva | undefined {
  const scene = lerCena();
  const id = useCameraLockStore.getState().selecionadaId;

  return scene?.cameras?.find((camera) => camera.id === id);
}

/** O recorte da selecionada. É o que toda ação abaixo parte. */
export function cameraAtual(): Viewport | undefined {
  return cameraSelecionada()?.viewport;
}

function conteudo(): Bounds {
  return useViewportStore.getState().conteudo;
}

/**
 * Grava o recorte da câmera por um gesto MANUAL do mestre, e por isso solta
 * a trava dela.
 *
 * Toda ação deste arquivo é manual: seta, alça, roda, enquadrar. Se a câmera
 * seguia um token ou espelhava o palco, o gesto diz "agora sou eu", e deixar
 * a trava acesa faria o seguidor desfazer o gesto no próximo movimento. Os
 * seguidores gravam por outro caminho, direto no `atualizarCamera`.
 */
export function gravarCameraManual(cameraId: string, viewport: Viewport): void {
  const scene = lerCena();
  if (!scene) return;

  const trava = useCameraLockStore.getState();
  if (trava.selecionadaId === cameraId) trava.soltar();

  useSceneStore.getState().atualizarCamera(scene.id, cameraId, {
    viewport: clampViewport(viewport, conteudo()),
    alvoIds: undefined,
  });
}

function gravar(viewport: Viewport): void {
  const camera = cameraSelecionada();
  if (camera) gravarCameraManual(camera.id, viewport);
}

/** Leva a selecionada para o recorte que o mestre está vendo agora. */
export function enquadrarAqui(): void {
  gravar(useViewportStore.getState().viewport);
}

/**
 * Põe a selecionada no ar, ou tira do ar se já estava. O que a mesa vê muda
 * neste toque, e só neste: selecionar não transmite.
 */
export function alternarTransmissao(): void {
  const scene = lerCena();
  const camera = cameraSelecionada();
  if (!scene || !camera) return;

  useSceneStore
    .getState()
    .transmitirCamera(
      scene.id,
      scene.cameraNoArId === camera.id ? undefined : camera.id,
    );
}

/** Tira qualquer câmera do ar: a mesa fica escura. */
export function mostrarCenaInteira(): void {
  const scene = lerCena();
  if (scene) useSceneStore.getState().transmitirCamera(scene.id, undefined);
}

/** Anda com a selecionada. `dx` e `dy` são frações da largura e da altura. */
export function moverCamera(dx: number, dy: number): void {
  const camera = cameraAtual();
  if (!camera) return;

  gravar({
    ...camera,
    x: camera.x + dx * camera.width,
    y: camera.y + dy * camera.height,
  });
}

/** `factor > 1` aproxima. O centro fica parado. */
export function zoomCamera(factor: number): void {
  const camera = cameraAtual();
  if (!camera) return;

  gravar(zoomViewportCentered(camera, factor, conteudo()));
}

/** Selecionada com a largura pedida, mantendo o centro. O slider chama isto. */
export function larguraDaCamera(width: number): void {
  const camera = cameraAtual();
  if (!camera) return;

  const cx = camera.x + camera.width / 2;
  const cy = camera.y + camera.height / 2;
  const height = width * (camera.height / camera.width);

  gravar({ x: cx - width / 2, y: cy - height / 2, width, height });
}

/**
 * Enquadra a seleção de itens na câmera selecionada, com folga.
 *
 * O gesto que faltava: o mestre seleciona os três tokens da luta e quer a
 * câmera olhando para eles. Antes ele tinha de aproximar o próprio palco,
 * enquadrar, e depois afastar de volta para continuar trabalhando.
 */
export function enquadrarSelecao(): void {
  const scene = lerCena();
  if (!scene) return;

  const { selectedIds } = useSelectionStore.getState();
  const caixa = boundsOfItems(
    scene.items.filter((item) => selectedIds.includes(item.id)),
  );
  if (!caixa) return;

  const folga =
    Math.max(caixa.maxX - caixa.minX, caixa.maxY - caixa.minY) *
    MARGEM_SELECAO;

  gravar(
    viewportQueCabe({
      minX: caixa.minX - folga,
      minY: caixa.minY - folga,
      maxX: caixa.maxX + folga,
      maxY: caixa.maxY + folga,
    }),
  );
}

/**
 * Leva o palco do MESTRE até onde a selecionada está.
 *
 * O contrário de `enquadrarAqui`. Existe porque o mestre ampliado num canto do
 * mapa perde a moldura de vista, e sem isto o único caminho de volta era
 * afastar tudo e procurar o tracejado.
 */
export function irParaCamera(): void {
  const camera = cameraAtual();
  if (!camera) return;

  useViewportStore.getState().setViewport(clampViewport(camera, conteudo()));
}

/**
 * Cria uma câmera nova a partir do recorte da selecionada, e a seleciona.
 *
 * Nome numerado por padrão: o mestre no meio da sessão não vai parar para
 * batizar, e "Câmera 3" já diz em que ordem nasceu. Renomeia depois, pelo
 * chip. Nasce fora do ar: criar é preparar, e transmitir é outro toque.
 */
export function novaCamera(nome?: string): string | undefined {
  const scene = lerCena();
  if (!scene) return undefined;

  const base = cameraAtual() ?? useViewportStore.getState().viewport;
  const ordem = (scene.cameras?.length ?? 0) + 1;
  const id = useSceneStore.getState().salvarCamera(scene.id, {
    nome: nome ?? `Câmera ${ordem}`,
    viewport: base,
  });

  useCameraLockStore.getState().selecionar(id);

  return id;
}

/**
 * A n-ésima câmera, para os atalhos `Shift+1..9`. Posição na lista, e não um
 * número guardado: a ordem que o mestre vê nos chips é a ordem que a tecla
 * usa, sem uma segunda numeração para divergir.
 */
export function cameraNaPosicao(posicao: number): CameraSalva | undefined {
  return lerCena()?.cameras?.[posicao - 1];
}
