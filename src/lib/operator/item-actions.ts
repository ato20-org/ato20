"use client";

import { offsetInsideScene } from "@/lib/geometry/transform";
import { flipPatches, type FlipAxis } from "@/lib/operator/flip";
import { useClipboardStore } from "@/lib/store/use-clipboard-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { selectEditingScene, useSceneStore, type ZDirection } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import type { CanvasItem, ItemDraft, Scene } from "@/types/scene";

/** Deslocamento do "colar" e do "duplicar", para a cópia não sumir sob o original. */
export const PASTE_OFFSET = 32;

/**
 * Ações do Operador sobre a seleção, em um lugar só.
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
};

function read(): ActionContext {
  // Sempre a cena em edição: as ações do mestre agem no palco dele, nunca
  // direto no que a mesa está vendo.
  const scene = selectEditingScene(useSceneStore.getState());
  const { selectedIds } = useSelectionStore.getState();

  return {
    scene,
    selectedIds,
    selectedItems: scene ? scene.items.filter((item) => selectedIds.includes(item.id)) : [],
  };
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
  };
}

export function copySelection(): void {
  const { selectedItems } = read();
  if (selectedItems.length === 0) return;

  useClipboardStore.getState().copy(selectedItems);
}

export function removeSelection(): void {
  const { scene, selectedIds } = read();
  if (!scene || selectedIds.length === 0) return;

  useSceneStore.getState().removeItems(scene.id, selectedIds);
  useSelectionStore.getState().clear();
}

export function cutSelection(): void {
  copySelection();
  removeSelection();
}

export function pasteClipboard(): void {
  const { scene } = read();
  const { drafts } = useClipboardStore.getState();
  if (!scene || drafts.length === 0) return;

  const ids = useSceneStore.getState().addItems(
    scene.id,
    drafts.map((draft) => ({ ...draft, ...offsetInsideScene(draft, PASTE_OFFSET) })),
  );

  useSelectionStore.getState().select(ids);
}

export function duplicateSelection(): void {
  const { scene, selectedItems } = read();
  if (!scene || selectedItems.length === 0) return;

  const ids = useSceneStore.getState().addItems(scene.id, selectedItems.map(offsetDraft));
  useSelectionStore.getState().select(ids);
}

export function moveSelectionZ(direction: ZDirection): void {
  const { scene, selectedIds } = read();
  if (!scene || selectedIds.length === 0) return;

  useSceneStore.getState().moveItemsZ(scene.id, selectedIds, direction);
}

/** Trava tudo se houver algum destravado; só destrava quando todos estão travados. */
export function toggleSelectionLock(): void {
  const { scene, selectedIds, selectedItems } = read();
  if (!scene || selectedItems.length === 0) return;

  const locking = selectedItems.some((item) => !item.locked);
  useSceneStore.getState().setItemsLocked(scene.id, selectedIds, locking);
}

export function selectAllItems(): void {
  const { scene } = read();
  if (!scene) return;

  useSelectionStore
    .getState()
    .select(scene.items.filter((item) => !item.locked).map((item) => item.id));
}

/** Alterna revelada/escondida da área selecionada, ou de uma indicada pelo id. */
export function toggleFogRevealed(fogId?: string): void {
  const { scene } = read();
  const id = fogId ?? useSelectionStore.getState().selectedFogId;
  const region = scene?.fog.find((candidate) => candidate.id === id);
  if (!scene || !region) return;

  useSceneStore.getState().updateFog(scene.id, region.id, { revealed: !region.revealed });
}

export function removeFogSelection(): void {
  const { scene } = read();
  const fogId = useSelectionStore.getState().selectedFogId;
  if (!scene || !fogId) return;

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

  useSceneStore.getState().updateItems(scene.id, flipPatches(selectedItems, axis));
}

export function nudgeSelection(dx: number, dy: number): void {
  const { scene, selectedItems } = read();
  if (!scene || selectedItems.length === 0) return;

  useSceneStore.getState().updateItems(
    scene.id,
    selectedItems
      .filter((item) => !item.locked)
      .map((item) => ({ id: item.id, patch: { x: item.x + dx, y: item.y + dy } })),
  );
}
