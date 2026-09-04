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
import {
  loadLocalBoard,
  loadSyncMark,
  saveLocalBoard,
  saveSyncMark,
} from "@/lib/storage/board";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { BoardConflictError, loadRemoteBoard, saveRemoteBoard } from "@/lib/supabase/boards";
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
  type Viewport,
} from "@/types/scene";

type HydrationStatus = "idle" | "loading" | "ready" | "error";

/**
 * Relação com a cópia na nuvem.
 *
 * `local` cobre dois casos que a tela trata igual: instalação sem Supabase, e
 * mesa nenhuma aberta. Nos dois, o board é só deste navegador e não há o que
 * dizer ao mestre.
 */
export type SyncStatus = "local" | "saving" | "synced" | "conflict" | "error";

/**
 * Intervalo entre subidas.
 *
 * Bem acima do debounce de gravação local: disco é instantâneo e de graça,
 * rede não. Cinco segundos de atraso não se percebem montando cena, e cortam
 * dezenas de escritas por minuto durante um arrasto longo.
 */
const PUSH_DEBOUNCE_MS = 5000;

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

  /** Qual mesa este board pertence. `null` = instalação local. */
  roomId: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  /** Versão que este navegador carregou. Zero = nunca subiu. */
  remoteVersion: number;
  /** Há edição local que ainda não subiu. */
  dirty: boolean;

  /**
   * Carrega o board da mesa e reconcilia com a nuvem.
   *
   * Local primeiro, sempre: ele pinta a tela na hora e é o que faz o Operador
   * funcionar com a internet caída. A nuvem entra depois, e só ela decide o
   * conflito.
   */
  hydrate: (roomId: string | null) => Promise<void>;
  /** Descarta o board local e assume o do servidor. */
  pullRemote: () => Promise<void>;
  /** Manda o board local por cima do servidor, seja qual for a versão dele. */
  overwriteRemote: () => Promise<void>;
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

  roomId: null,
  syncStatus: "local",
  syncError: null,
  remoteVersion: 0,
  dirty: false,

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

  async hydrate(roomId) {
    // Sai fora quando a mesa é a mesma: o Operador remonta, e recarregar o
    // board por cima do que está sendo editado perderia edição não gravada.
    if (get().status !== "idle" && get().roomId === roomId) return;

    set({ status: "loading", roomId });

    try {
      const local = await loadLocalBoard(roomId);
      const mark = await loadSyncMark(roomId);

      // Histórico nasce vazio: não faz sentido desfazer para antes de abrir.
      set({
        board: local,
        status: "ready",
        error: null,
        history: emptyHistory<Board>(),
        lastCommitAt: 0,
        remoteVersion: mark.version,
        dirty: mark.dirty,
        syncStatus: "local",
        syncError: null,
      });

      if (!roomId || !isSupabaseConfigured()) return;

      const remote = await loadRemoteBoard(roomId);

      // Mesa sem board na nuvem: este navegador é a origem. É o caminho da
      // primeira vez e o da mesa criada antes desta feature existir.
      if (!remote) {
        await pushBoard(local, roomId, 0);
        return;
      }

      // Servidor na mesma versão que carregamos: nada a fazer — o que está na
      // tela já é o que está lá, mais as edições pendentes daqui.
      if (remote.version === mark.version) {
        set({ syncStatus: mark.dirty ? "saving" : "synced" });
        if (mark.dirty) await pushBoard(get().board ?? local, roomId, mark.version);

        return;
      }

      // Servidor à frente E edição local pendente: as duas pontas mudaram, e
      // escolher sozinho apagaria trabalho de alguém. Quem decide é o mestre.
      if (mark.dirty) {
        set({ syncStatus: "conflict" });
        return;
      }

      // Servidor à frente e nada pendente aqui: ele é a verdade.
      await adoptRemote(roomId, remote.board, remote.version);
    } catch (cause) {
      // Falha de rede não invalida o board local: a tela segue editável, e o
      // aviso diz que não está subindo.
      set({
        syncStatus: "error",
        syncError: cause instanceof Error ? cause.message : "Falha ao sincronizar o board",
      });
    }
  },

  async pullRemote() {
    const { roomId } = get();
    if (!roomId) return;

    set({ syncStatus: "saving", syncError: null });

    try {
      const remote = await loadRemoteBoard(roomId);
      if (!remote) return;

      await adoptRemote(roomId, remote.board, remote.version);
    } catch (cause) {
      set({
        syncStatus: "error",
        syncError: cause instanceof Error ? cause.message : "Falha ao puxar o board",
      });
    }
  },

  async overwriteRemote() {
    const { roomId, board } = get();
    if (!roomId || !board) return;

    set({ syncStatus: "saving", syncError: null });

    try {
      // Lê a versão atual só para poder passar por cima dela: o RPC recusa
      // qualquer outra, e é essa recusa que protege contra sobrescrita
      // acidental — aqui ela é intencional.
      const remote = await loadRemoteBoard(roomId);
      await pushBoard(board, roomId, remote?.version ?? 0);
    } catch (cause) {
      set({
        syncStatus: "error",
        syncError: cause instanceof Error ? cause.message : "Falha ao gravar o board",
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
let pushTimer: ReturnType<typeof setTimeout> | undefined;

useSceneStore.subscribe((state, previous) => {
  if (state.board === previous.board || !state.board) return;

  const { board, roomId } = state;

  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void saveLocalBoard(roomId, board);
    // A marca de pendente é gravada junto com o board: se o navegador fechar
    // antes de subir, a próxima abertura sabe que há edição local à frente da
    // nuvem — e é isso que faz o conflito ser detectado em vez de silenciado.
    void saveSyncMark(roomId, {
      version: useSceneStore.getState().remoteVersion,
      dirty: true,
    });
  }, PERSIST_DEBOUNCE_MS);

  if (!roomId || !isSupabaseConfigured()) return;

  useSceneStore.setState({ dirty: true });

  // Em conflito nada sobe até o mestre decidir: empurrar por cima seria
  // exatamente a sobrescrita que a versão existe para impedir.
  if (state.syncStatus !== "conflict") schedulePush();
});

function schedulePush(): void {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const { board, roomId, remoteVersion, syncStatus } = useSceneStore.getState();
    if (!board || !roomId || syncStatus === "conflict") return;

    void pushBoard(board, roomId, remoteVersion);
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Sobe o board e reconcilia a versão.
 *
 * `version` é a que este cliente carregou. O RPC recusa qualquer outra, e essa
 * recusa é o conflito — não um erro de rede.
 */
async function pushBoard(board: Board, roomId: string, version: number): Promise<void> {
  useSceneStore.setState({ syncStatus: "saving", syncError: null });

  try {
    const next = await saveRemoteBoard(roomId, board, version);

    // O mestre pode ter continuado editando durante a subida. Nesse caso a
    // pendência continua de pé, senão a última edição ficaria só no disco.
    const settled = useSceneStore.getState().board === board;

    await saveSyncMark(roomId, { version: next, dirty: !settled });
    useSceneStore.setState({
      remoteVersion: next,
      dirty: !settled,
      syncStatus: settled ? "synced" : "saving",
    });

    if (!settled) schedulePush();
  } catch (cause) {
    if (cause instanceof BoardConflictError) {
      await saveSyncMark(roomId, { version, dirty: true });
      useSceneStore.setState({ dirty: true, syncStatus: "conflict" });

      return;
    }

    useSceneStore.setState({
      syncStatus: "error",
      syncError: cause instanceof Error ? cause.message : "Falha ao gravar o board",
    });
  }
}

/** Assume o board do servidor, no disco e na tela. */
async function adoptRemote(roomId: string, board: Board, version: number): Promise<void> {
  await saveLocalBoard(roomId, board);
  await saveSyncMark(roomId, { version, dirty: false });

  useSceneStore.setState({
    board,
    remoteVersion: version,
    dirty: false,
    syncStatus: "synced",
    syncError: null,
    // Histórico zerado: desfazer para um estado que veio de outra máquina não
    // é desfazer, é apagar o trabalho de lá.
    history: emptyHistory<Board>(),
    lastCommitAt: 0,
  });
}

// Fechar a aba ou minimizar não pode custar os últimos segundos de trabalho:
// o disco já gravou em 400 ms, mas a nuvem só em `PUSH_DEBOUNCE_MS`.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;

    const { board, roomId, remoteVersion, dirty, syncStatus } = useSceneStore.getState();
    if (!board || !roomId || !dirty || syncStatus === "conflict") return;

    clearTimeout(pushTimer);
    void pushBoard(board, roomId, remoteVersion);
  });
}
