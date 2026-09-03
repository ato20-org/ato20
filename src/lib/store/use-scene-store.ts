"use client";

import { create } from "zustand";

import {
  canRedo,
  canUndo,
  emptyHistory,
  pushHistory,
  redoStep,
  undoStep,
  type History,
} from "@/lib/operator/history";
import {
  appendScene,
  insertSceneAfter,
  moveScene as moveSceneInBoard,
  removeScene as removeSceneFromBoard,
} from "@/lib/operator/board-ops";
import {
  moveItemToFrontFirstIndex,
  reorderByZ,
  type ZDirection,
} from "@/lib/operator/z-order";
import { loadBoard, saveBoard } from "@/lib/storage/board";
import {
  cloneScene,
  createScene,
  type Board,
  type CanvasItem,
  type FogRegion,
  type ItemDraft,
  type NewCanvasItem,
  type NewFogRegion,
  type Scene,
  type SceneAudio,
  type Viewport,
} from "@/types/scene";

type HydrationStatus = "idle" | "loading" | "ready" | "error";

/**
 * Janela de fusão do histórico.
 *
 * Mudanças mais próximas que isto entram no mesmo passo de desfazer. Um
 * arrasto emite dezenas de alterações por segundo e precisa voltar de uma vez.
 */
const COALESCE_MS = 400;

export type ItemPatch = { id: string; patch: Partial<CanvasItem> };

export type { ZDirection };

type SceneStore = {
  board: Board | null;
  status: HydrationStatus;
  error: string | null;

  history: History<Board>;
  /** Momento da última alteração, para decidir a fusão do histórico. */
  lastCommitAt: number;
  undo: () => void;
  redo: () => void;

  hydrate: () => Promise<void>;
  /** Abre a cena no palco do Operador. Não muda o que a mesa vê. */
  setEditingSceneId: (sceneId: string | null) => void;
  /** Coloca a cena no ar. `null` deixa a mesa sem nada. */
  setLiveSceneId: (sceneId: string | null) => void;
  addScene: (name?: string) => string;
  renameScene: (sceneId: string, name: string) => void;
  duplicateScene: (sceneId: string) => string | null;
  moveScene: (sceneId: string, direction: "up" | "down") => void;
  removeScene: (sceneId: string) => void;
  /** Primitiva única de mutação de cena. Toda operação de item usa isto. */
  updateScene: (sceneId: string, updater: (scene: Scene) => Scene) => void;

  setBackground: (sceneId: string, assetId: string | undefined) => void;
  /** `undefined` desliga o ambiente da cena. */
  setSceneAudio: (sceneId: string, audio: SceneAudio | undefined) => void;
  /** `undefined` devolve a mesa ao plano inteiro. */
  setSceneCamera: (sceneId: string, camera: Viewport | undefined) => void;
  /** Devolve o id do item criado, para já deixá-lo selecionado. */
  addItem: (sceneId: string, item: NewCanvasItem) => string;
  /** Devolve os ids na mesma ordem dos rascunhos. */
  addItems: (sceneId: string, drafts: ItemDraft[]) => string[];
  updateItem: (sceneId: string, itemId: string, patch: Partial<CanvasItem>) => void;
  /** Um único update para N itens: arrastar em grupo não pode gravar N vezes por frame. */
  updateItems: (sceneId: string, patches: ItemPatch[]) => void;
  removeItems: (sceneId: string, itemIds: string[]) => void;
  moveItemsZ: (sceneId: string, itemIds: string[], direction: ZDirection) => void;
  /** Índice na lista frente-primeiro do painel de camadas. */
  moveItemToIndex: (sceneId: string, itemId: string, frontFirstIndex: number) => void;
  setItemsLocked: (sceneId: string, itemIds: string[], locked: boolean) => void;

  addFog: (sceneId: string, region: NewFogRegion) => string;
  updateFog: (sceneId: string, fogId: string, patch: Partial<FogRegion>) => void;
  removeFog: (sceneId: string, fogId: string) => void;
};

export const useSceneStore = create<SceneStore>((set, get) => {
  /**
   * Toda alteração de conteúdo passa por aqui, e é o único lugar que alimenta
   * o histórico. Navegação — qual cena está aberta, qual está no ar — usa
   * `set` direto: desfazer deve voltar edições, não passos de navegação.
   */
  function commit(next: Board) {
    const { board, history, lastCommitAt } = get();
    const now = Date.now();

    set({
      board: next,
      history: board
        ? pushHistory(history, board, now - lastCommitAt < COALESCE_MS)
        : history,
      lastCommitAt: now,
    });
  }

  return {
  board: null,
  status: "idle",
  error: null,

  history: emptyHistory<Board>(),
  lastCommitAt: 0,

  undo() {
    const { board, history } = get();
    if (!board) return;

    const step = undoStep(history, board);
    if (!step) return;

    // Zera o relógio de fusão: a próxima edição abre passo novo em vez de se
    // grudar no que existia antes do desfazer.
    set({ board: step.value, history: step.history, lastCommitAt: 0 });
  },

  redo() {
    const { board, history } = get();
    if (!board) return;

    const step = redoStep(history, board);
    if (!step) return;

    set({ board: step.value, history: step.history, lastCommitAt: 0 });
  },

  async hydrate() {
    if (get().status !== "idle") return;
    set({ status: "loading" });

    try {
      // Histórico nasce vazio: não faz sentido desfazer para antes de abrir.
      set({
        board: await loadBoard(),
        status: "ready",
        error: null,
        history: emptyHistory<Board>(),
        lastCommitAt: 0,
      });
    } catch (cause) {
      set({
        status: "error",
        error: cause instanceof Error ? cause.message : "Falha ao carregar o board",
      });
    }
  },

  setEditingSceneId(sceneId) {
    const { board } = get();
    if (!board) return;

    set({ board: { ...board, editingSceneId: sceneId } });
  },

  setLiveSceneId(sceneId) {
    const { board } = get();
    if (!board) return;

    set({ board: { ...board, liveSceneId: sceneId } });
  },

  addScene(name) {
    const { board } = get();
    const scene = createScene(name ?? `Cena ${(board?.scenes.length ?? 0) + 1}`);
    const base = board ?? { scenes: [], editingSceneId: null, liveSceneId: null };

    commit(appendScene(base, scene));

    return scene.id;
  },

  renameScene(sceneId, name) {
    get().updateScene(sceneId, (scene) => ({ ...scene, name }));
  },

  duplicateScene(sceneId) {
    const { board } = get();
    const source = board?.scenes.find((scene) => scene.id === sceneId);
    if (!board || !source) return null;

    const copy = cloneScene(source, `${source.name} (cópia)`);
    commit(insertSceneAfter(board, sceneId, copy));

    return copy.id;
  },

  moveScene(sceneId, direction) {
    const { board } = get();
    if (!board) return;

    commit(moveSceneInBoard(board, sceneId, direction));
  },

  removeScene(sceneId) {
    const { board } = get();
    if (!board) return;

    commit(removeSceneFromBoard(board, sceneId));
  },

  updateScene(sceneId, updater) {
    const { board } = get();
    if (!board) return;

    commit({
      ...board,
      scenes: board.scenes.map((scene) =>
        scene.id === sceneId ? { ...updater(scene), updatedAt: Date.now() } : scene,
      ),
    });
  },

  setBackground(sceneId, assetId) {
    get().updateScene(sceneId, (scene) => ({ ...scene, backgroundAssetId: assetId }));
  },

  setSceneAudio(sceneId, audio) {
    get().updateScene(sceneId, (scene) => ({ ...scene, audio }));
  },

  setSceneCamera(sceneId, camera) {
    get().updateScene(sceneId, (scene) => ({ ...scene, camera }));
  },

  addItem(sceneId, item) {
    return get().addItems(sceneId, [item])[0];
  },

  addItems(sceneId, drafts) {
    const ids = drafts.map(() => crypto.randomUUID());

    get().updateScene(sceneId, (scene) => {
      // Nascem na frente de tudo: o mestre acabou de colocar, quer ver.
      const topZ = scene.items.reduce((max, current) => Math.max(max, current.z), 0);

      const created: CanvasItem[] = drafts.map((draft, index) => ({
        rotation: 0,
        locked: false,
        ...draft,
        id: ids[index],
        z: topZ + index + 1,
      }));

      return { ...scene, items: [...scene.items, ...created] };
    });

    return ids;
  },

  updateItem(sceneId, itemId, patch) {
    get().updateItems(sceneId, [{ id: itemId, patch }]);
  },

  updateItems(sceneId, patches) {
    if (patches.length === 0) return;

    const byId = new Map(patches.map(({ id, patch }) => [id, patch]));

    get().updateScene(sceneId, (scene) => ({
      ...scene,
      items: scene.items.map((item) => {
        const patch = byId.get(item.id);
        return patch ? { ...item, ...patch } : item;
      }),
    }));
  },

  removeItems(sceneId, itemIds) {
    if (itemIds.length === 0) return;

    const doomed = new Set(itemIds);
    get().updateScene(sceneId, (scene) => ({
      ...scene,
      items: scene.items.filter((item) => !doomed.has(item.id)),
    }));
  },

  moveItemsZ(sceneId, itemIds, direction) {
    if (itemIds.length === 0) return;

    get().updateScene(sceneId, (scene) => ({
      ...scene,
      items: reorderByZ(scene.items, itemIds, direction),
    }));
  },

  moveItemToIndex(sceneId, itemId, frontFirstIndex) {
    get().updateScene(sceneId, (scene) => ({
      ...scene,
      items: moveItemToFrontFirstIndex(scene.items, itemId, frontFirstIndex),
    }));
  },

  setItemsLocked(sceneId, itemIds, locked) {
    get().updateItems(
      sceneId,
      itemIds.map((id) => ({ id, patch: { locked } })),
    );
  },

  addFog(sceneId, region) {
    const id = crypto.randomUUID();

    get().updateScene(sceneId, (scene) => ({
      ...scene,
      fog: [...scene.fog, { ...region, id, revealed: false }],
    }));

    return id;
  },

  updateFog(sceneId, fogId, patch) {
    get().updateScene(sceneId, (scene) => ({
      ...scene,
      fog: scene.fog.map((region) => (region.id === fogId ? { ...region, ...patch } : region)),
    }));
  },

  removeFog(sceneId, fogId) {
    get().updateScene(sceneId, (scene) => ({
      ...scene,
      fog: scene.fog.filter((region) => region.id !== fogId),
    }));
  },
  };
});


export function selectCanUndo(state: SceneStore): boolean {
  return canUndo(state.history);
}

export function selectCanRedo(state: SceneStore): boolean {
  return canRedo(state.history);
}

function findScene(state: SceneStore, sceneId: string | null | undefined): Scene | null {
  if (!sceneId) return null;

  return state.board?.scenes.find((scene) => scene.id === sceneId) ?? null;
}

/** A cena aberta no palco do Operador. É sobre esta que todas as edições agem. */
export function selectEditingScene(state: SceneStore): Scene | null {
  return findScene(state, state.board?.editingSceneId);
}

/** A cena que a mesa está vendo. É esta que o canal publica. */
export function selectLiveScene(state: SceneStore): Scene | null {
  return findScene(state, state.board?.liveSceneId);
}

/**
 * Persiste fora do store: arrasto dispara dezenas de updates por segundo e
 * gravar todos derruba o frame rate.
 */
const PERSIST_DEBOUNCE_MS = 400;

let persistTimer: ReturnType<typeof setTimeout> | undefined;

useSceneStore.subscribe((state, previous) => {
  if (state.board === previous.board || !state.board) return;

  const board = state.board;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void saveBoard(board);
  }, PERSIST_DEBOUNCE_MS);
});
