"use client";

import { create } from "zustand";

import { novoId } from "@/lib/id";

import {
  canRedo,
  canUndo,
  emptyHistory,
  pushHistory,
  redoStep,
  undoStep,
  type History,
} from "@/lib/mestre/history";
import {
  appendScene,
  insertSceneAfter,
  moveSceneToIndex as moveSceneToIndexInBoard,
  removeScene as removeSceneFromBoard,
} from "@/lib/mestre/board-ops";
import {
  moveItemsBefore,
  moveItemToFrontFirstIndex,
  reorderByZ,
  type ZDirection,
} from "@/lib/mestre/z-order";
import { loadBoard, saveBoard, saveBoardPatch } from "@/lib/vault/board";
import {
  cloneScene,
  CORES_POSTIT,
  createEmptyBoard,
  createScene,
  ehQuadro,
  POSTIT_ALTURA,
  POSTIT_LARGURA,
  type Board,
  type CameraSalva,
  type CanvasItem,
  type FogRegion,
  type Grupo,
  type ItemDraft,
  type MapPin,
  type NewCanvasItem,
  type NewFogRegion,
  type NewPostit,
  type NewTraco,
  type NewMapPin,
  type Postit,
  type Scene,
  type SceneGrid,
  type TipoDeCena,
  type Viewport,
  type Medidor,
  type NewMedidor,
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

  /**
   * Qual campanha o board carregado pertence.
   *
   * Existe para a hidratação se guardar sozinha. A versão sem isto saía cedo
   * "se já carregou", e trocar de campanha mantinha o board da anterior na
   * tela — com o agravante de que a próxima gravação o escreveria dentro da
   * campanha nova.
   */
  campaignPath: string | null;

  /**
   * Carrega o board do vault.
   *
   * Com a nuvem foram embora a versão remota, a marca de pendente e o estado
   * de conflito — o disco é a verdade, e não há segunda ponta com quem
   * discordar.
   */
  hydrate: (campaignPath: string) => Promise<void>;
  /** Abre a cena no palco do Mestre. Não muda o que a mesa vê. */
  setEditingSceneId: (sceneId: string | null) => void;
  /** Coloca a cena no ar. `null` deixa a mesa sem nada. */
  setLiveSceneId: (sceneId: string | null) => void;
  /**
   * Cria e abre no palco. `tipo` ausente é mapa; `"quadro"` é a mesa de
   * trabalho do mestre. O nome de fábrica conta só as do mesmo tipo: "Quadro 1"
   * numa campanha de trinta mapas, e não "Quadro 31".
   */
  addScene: (name?: string, tipo?: TipoDeCena) => string;
  renameScene: (sceneId: string, name: string) => void;
  duplicateScene: (sceneId: string) => string | null;
  /** Posição na lista de cenas. É o que o arrasto da lista emite. */
  moveSceneToIndex: (sceneId: string, index: number) => void;
  removeScene: (sceneId: string) => void;
  /** Primitiva única de mutação de cena. Toda operação de item usa isto. */
  updateScene: (sceneId: string, updater: (scene: Scene) => Scene) => void;

  setBackground: (sceneId: string, assetId: string | undefined) => void;
  /** `undefined` devolve a mesa ao plano inteiro. */
  setSceneCamera: (sceneId: string, camera: Viewport | undefined) => void;
  /** Cria uma câmera. Devolve o id. */
  salvarCamera: (sceneId: string, camera: Omit<CameraSalva, "id">) => string;
  /**
   * Altera uma câmera. Se ela está no ar, o recorte novo vai junto para
   * `camera`, que é o que a mesa lê: transmitir é contínuo, não um retrato.
   */
  atualizarCamera: (
    sceneId: string,
    cameraId: string,
    patch: Partial<Omit<CameraSalva, "id">>,
  ) => void;
  /** Remove. Se era a que estava no ar, a mesa volta à cena inteira. */
  removerCamera: (sceneId: string, cameraId: string) => void;
  /** Põe uma câmera no ar, ou nenhuma: aí a mesa vê a cena inteira. */
  transmitirCamera: (sceneId: string, cameraId: string | undefined) => void;
  /**
   * Liga, ajusta ou desliga a grade da cena. `undefined` desliga.
   *
   * Passa pelo `updateScene`, e portanto pelo histórico: ligar a grade é uma
   * edição da cena como qualquer outra, e Ctrl+Z tem de desfazê-la.
   */
  setSceneGrid: (sceneId: string, grid: SceneGrid | undefined) => void;
  /** Devolve o id do item criado, para já deixá-lo selecionado. */
  addItem: (sceneId: string, item: NewCanvasItem) => string;
  /** Devolve os ids na mesma ordem dos rascunhos. */
  addItems: (sceneId: string, drafts: ItemDraft[]) => string[];
  updateItem: (
    sceneId: string,
    itemId: string,
    patch: Partial<CanvasItem>,
  ) => void;
  /** Um único update para N itens: arrastar em grupo não pode gravar N vezes por frame. */
  updateItems: (sceneId: string, patches: ItemPatch[]) => void;
  removeItems: (sceneId: string, itemIds: string[]) => void;
  moveItemsZ: (
    sceneId: string,
    itemIds: string[],
    direction: ZDirection,
  ) => void;
  /** Índice na lista frente-primeiro do painel de camadas. */
  moveItemToIndex: (
    sceneId: string,
    itemId: string,
    frontFirstIndex: number,
  ) => void;
  setItemsLocked: (sceneId: string, itemIds: string[], locked: boolean) => void;

  /**
   * Cria um grupo com estes itens dentro. Devolve o id. `parentId` presente =
   * nasce dentro de outro grupo.
   */
  criarGrupo: (
    sceneId: string,
    nome: string,
    itemIds: string[],
    parentId?: string,
  ) => string;
  atualizarGrupo: (
    sceneId: string,
    grupoId: string,
    patch: Partial<Omit<Grupo, "id">>,
  ) => void;
  /**
   * Desfaz o grupo. Itens e subgrupos sobem para o pai dele, ou para a raiz.
   * Nunca apaga item: desagrupar é organização, não remoção.
   */
  removerGrupo: (sceneId: string, grupoId: string) => void;
  /**
   * O que um arrasto na lista de camadas faz: põe os itens numa pasta E os
   * reposiciona, num commit só.
   *
   * Um só porque é um gesto só: em duas chamadas, o desfazer pedia dois
   * Ctrl+Z para voltar um arrasto. `antesDe` nulo manda para o fundo.
   */
  soltarItens: (
    sceneId: string,
    itemIds: string[],
    grupoId: string | undefined,
    antesDe: string | null,
  ) => void;
  /** Põe itens num grupo, ou tira deles (`undefined` = raiz). */
  moverParaGrupo: (
    sceneId: string,
    itemIds: string[],
    grupoId: string | undefined,
  ) => void;
  /**
   * Põe um grupo dentro de outro, ou na raiz. Recusa ciclo: um grupo não entra
   * em si mesmo nem num descendente seu.
   */
  moverGrupo: (
    sceneId: string,
    grupoId: string,
    parentId: string | undefined,
  ) => void;

  addFog: (sceneId: string, region: NewFogRegion) => string;
  /** Crava um risco. Passa pelo histórico: riscar é edição da cena. */
  addTraco: (sceneId: string, traco: NewTraco) => string;
  /**
   * Apaga vários riscos de uma vez.
   *
   * Vários e não um: a borracha atravessa três riscos numa passada, e apagar um
   * por um daria três entradas no desfazer para um gesto só.
   */
  removeTracos: (sceneId: string, tracoIds: string[]) => void;
  /** Coloca um medidor. Passa pelo histórico: medir e deixar é edição da cena. */
  addMedidor: (sceneId: string, medidor: NewMedidor) => string;
  updateMedidor: (
    sceneId: string,
    medidorId: string,
    patch: Partial<Omit<Medidor, "id">>,
  ) => void;
  removeMedidores: (sceneId: string, medidorIds: string[]) => void;
  updateFog: (
    sceneId: string,
    fogId: string,
    patch: Partial<FogRegion>,
  ) => void;
  removeFog: (sceneId: string, fogId: string) => void;

  /** Crava um ponto de anotação. Devolve o id, para já abrir a nota dele. */
  addPin: (sceneId: string, pin: NewMapPin) => string;
  updatePin: (sceneId: string, pinId: string, patch: Partial<MapPin>) => void;
  removePin: (sceneId: string, pinId: string) => void;
  /** Anexa arquivos do acervo ao ponto, sem repetir os que já estão nele. */
  attachToPin: (sceneId: string, pinId: string, assetIds: string[]) => void;
  detachFromPin: (sceneId: string, pinId: string, assetId: string) => void;

  /**
   * Guarda imagens do acervo no handout da cena. Repetidas não entram.
   * Ver `Scene.handout`.
   */
  guardarNoHandout: (sceneId: string, assetIds: string[]) => void;
  tirarDoHandout: (sceneId: string, assetId: string) => void;

  /** Cola um postit. Devolve o id, para já abrir o texto dele para digitar. */
  addPostit: (sceneId: string, postit: NewPostit) => string;
  updatePostit: (
    sceneId: string,
    postitId: string,
    patch: Partial<Postit>,
  ) => void;
  removePostit: (sceneId: string, postitId: string) => void;
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
    campaignPath: null,

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

    async hydrate(campaignPath) {
      // Sai fora se já carregou ESTA campanha: o Mestre remonta, e reler o
      // disco por cima do que está sendo editado perderia edição que o debounce
      // ainda não gravou. Campanha diferente sempre recarrega.
      if (get().campaignPath === campaignPath && get().status !== "idle")
        return;

      // Zera antes de ler: sem isto o board da campanha anterior ficaria na tela
      // durante a leitura, e o assinante de gravação o escreveria na campanha
      // nova.
      // Zera a base da diferença ANTES de ler: ela descreve o que o disco da
      // campanha ANTERIOR tinha, e usá-la para diferenciar o board de outra
      // campanha mandaria um patch medido contra o vault errado.
      salvo = null;

      set({
        board: null,
        status: "loading",
        campaignPath,
        history: emptyHistory<Board>(),
      });

      try {
        // Campanha sem board ainda devolve `null`, e quem cria o primeiro é
        // daqui: o formato de `Scene` é da tela, e o Rust trata cena como JSON
        // opaco justamente para o formato não ter duas fontes de verdade.
        const carregado = await loadBoard();
        const board = carregado ?? createEmptyBoard();

        // Board que veio do disco JÁ está no disco: a primeira gravação depois de
        // abrir a campanha pode ser um patch. Board criado aqui — campanha sem
        // board ainda — não, e por isso a base fica nula: não existe arquivo
        // nenhum contra o que diferenciar.
        salvo = carregado;

        // Histórico nasce vazio: não faz sentido desfazer para antes de abrir.
        set({
          board,
          status: "ready",
          error: null,
          campaignPath,
          history: emptyHistory<Board>(),
          lastCommitAt: 0,
        });
      } catch (cause) {
        // Sem board não há tela: ao contrário da falha de rede de antes, que
        // deixava o Mestre editável e só avisava que não estava subindo, um
        // disco ilegível não tem versão local para cair.
        set({
          status: "error",
          error:
            cause instanceof Error ? cause.message : "Falha ao abrir o board",
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

    addScene(name, tipo) {
      const { board } = get();
      const iguais =
        board?.scenes.filter((scene) => ehQuadro(scene) === (tipo === "quadro"))
          .length ?? 0;
      const scene = createScene(
        name ?? `${tipo === "quadro" ? "Quadro" : "Cena"} ${iguais + 1}`,
        tipo,
      );
      const base = board ?? {
        scenes: [],
        editingSceneId: null,
        liveSceneId: null,
      };

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

    moveSceneToIndex(sceneId, index) {
      const { board } = get();
      if (!board) return;

      commit(moveSceneToIndexInBoard(board, sceneId, index));
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
          scene.id === sceneId
            ? { ...updater(scene), updatedAt: Date.now() }
            : scene,
        ),
      });
    },

    setBackground(sceneId, assetId) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        backgroundAssetId: assetId,
      }));
    },

    setSceneCamera(sceneId, camera) {
      get().updateScene(sceneId, (scene) => ({ ...scene, camera }));
    },

    salvarCamera(sceneId, camera) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        cameras: [...(scene.cameras ?? []), { ...camera, id }],
      }));

      return id;
    },

    atualizarCamera(sceneId, cameraId, patch) {
      get().updateScene(sceneId, (scene) => {
        const noAr = scene.cameraNoArId === cameraId && patch.viewport;

        return {
          ...scene,
          cameras: (scene.cameras ?? []).map((camera) =>
            camera.id === cameraId ? { ...camera, ...patch } : camera,
          ),
          camera: noAr ? patch.viewport : scene.camera,
        };
      });
    },

    removerCamera(sceneId, cameraId) {
      get().updateScene(sceneId, (scene) => {
        const cameras = (scene.cameras ?? []).filter(
          (camera) => camera.id !== cameraId,
        );
        const eraNoAr = scene.cameraNoArId === cameraId;

        // Lista vazia sai do objeto, pela mesma razão de `grid` e `tracos`:
        // não engordar toda cena com um campo que não diz nada.
        return {
          ...scene,
          cameras: cameras.length > 0 ? cameras : undefined,
          cameraNoArId: eraNoAr ? undefined : scene.cameraNoArId,
          camera: eraNoAr ? undefined : scene.camera,
        };
      });
    },

    transmitirCamera(sceneId, cameraId) {
      get().updateScene(sceneId, (scene) => {
        const alvo = scene.cameras?.find((camera) => camera.id === cameraId);

        return {
          ...scene,
          cameraNoArId: alvo?.id,
          camera: alvo?.viewport,
        };
      });
    },

    setSceneGrid(sceneId, grid) {
      get().updateScene(sceneId, (scene) => ({ ...scene, grid }));
    },

    addItem(sceneId, item) {
      return get().addItems(sceneId, [item])[0];
    },

    addItems(sceneId, drafts) {
      const ids = drafts.map(() => novoId());

      get().updateScene(sceneId, (scene) => {
        // Nascem na frente de tudo: o mestre acabou de colocar, quer ver.
        const topZ = scene.items.reduce(
          (max, current) => Math.max(max, current.z),
          0,
        );

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

    criarGrupo(sceneId, nome, itemIds, parentId) {
      const id = novoId();
      const dentro = new Set(itemIds);

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        grupos: [...(scene.grupos ?? []), { id, nome: nome.trim(), parentId }],
        items: scene.items.map((item) =>
          dentro.has(item.id) ? { ...item, grupoId: id } : item,
        ),
      }));

      return id;
    },

    atualizarGrupo(sceneId, grupoId, patch) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        grupos: (scene.grupos ?? []).map((grupo) =>
          grupo.id === grupoId ? { ...grupo, ...patch } : grupo,
        ),
      }));
    },

    removerGrupo(sceneId, grupoId) {
      get().updateScene(sceneId, (scene) => {
        const alvo = scene.grupos?.find((grupo) => grupo.id === grupoId);
        if (!alvo) return scene;

        const grupos = (scene.grupos ?? [])
          .filter((grupo) => grupo.id !== grupoId)
          .map((grupo) =>
            grupo.parentId === grupoId
              ? { ...grupo, parentId: alvo.parentId }
              : grupo,
          );

        return {
          ...scene,
          // Lista vazia sai do objeto, como `grid` e `tracos`.
          grupos: grupos.length > 0 ? grupos : undefined,
          items: scene.items.map((item) =>
            item.grupoId === grupoId
              ? { ...item, grupoId: alvo.parentId }
              : item,
          ),
        };
      });
    },

    soltarItens(sceneId, itemIds, grupoId, antesDe) {
      if (itemIds.length === 0) return;

      const dentro = new Set(itemIds);

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        items: moveItemsBefore(
          scene.items.map((item) =>
            dentro.has(item.id) ? { ...item, grupoId } : item,
          ),
          itemIds,
          antesDe,
        ),
      }));
    },

    moverParaGrupo(sceneId, itemIds, grupoId) {
      const alvo = new Set(itemIds);

      get().updateItems(
        sceneId,
        get()
          .board?.scenes.find((scene) => scene.id === sceneId)
          ?.items.filter((item) => alvo.has(item.id) && item.grupoId !== grupoId)
          .map((item) => ({ id: item.id, patch: { grupoId } })) ?? [],
      );
    },

    moverGrupo(sceneId, grupoId, parentId) {
      get().updateScene(sceneId, (scene) => {
        const grupos = scene.grupos ?? [];

        // Sobe do destino até a raiz; se passar pelo próprio grupo, é ciclo.
        let cursor = parentId;
        while (cursor) {
          if (cursor === grupoId) return scene;
          cursor = grupos.find((grupo) => grupo.id === cursor)?.parentId;
        }

        return {
          ...scene,
          grupos: grupos.map((grupo) =>
            grupo.id === grupoId ? { ...grupo, parentId } : grupo,
          ),
        };
      });
    },

    addFog(sceneId, region) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        fog: [...scene.fog, { ...region, id, revealed: false }],
      }));

      return id;
    },

    addTraco(sceneId, traco) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        tracos: [...(scene.tracos ?? []), { ...traco, id }],
      }));

      return id;
    },

    removeTracos(sceneId, tracoIds) {
      if (tracoIds.length === 0) return;

      const apagar = new Set(tracoIds);

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        tracos: (scene.tracos ?? []).filter((traco) => !apagar.has(traco.id)),
      }));
    },

    addMedidor(sceneId, medidor) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        medidores: [...(scene.medidores ?? []), { ...medidor, id }],
      }));

      return id;
    },

    updateMedidor(sceneId, medidorId, patch) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        medidores: (scene.medidores ?? []).map((medidor) =>
          medidor.id === medidorId ? { ...medidor, ...patch } : medidor,
        ),
      }));
    },

    removeMedidores(sceneId, medidorIds) {
      if (medidorIds.length === 0) return;

      const apagar = new Set(medidorIds);

      get().updateScene(sceneId, (scene) => {
        const restantes = (scene.medidores ?? []).filter(
          (medidor) => !apagar.has(medidor.id),
        );

        // `undefined` quando esvazia, como `removePostit`: é a AUSÊNCIA do
        // campo que mantém a cena sem nada do mestre na mesma referência.
        return {
          ...scene,
          medidores: restantes.length > 0 ? restantes : undefined,
        };
      });
    },

    updateFog(sceneId, fogId, patch) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        fog: scene.fog.map((region) =>
          region.id === fogId ? { ...region, ...patch } : region,
        ),
      }));
    },

    removeFog(sceneId, fogId) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        fog: scene.fog.filter((region) => region.id !== fogId),
      }));
    },

    addPin(sceneId, pin) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        pins: [
          ...(scene.pins ?? []),
          { title: "", note: "", ...pin, id, attachments: [] },
        ],
      }));

      return id;
    },

    updatePin(sceneId, pinId, patch) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        pins: (scene.pins ?? []).map((pin) =>
          pin.id === pinId ? { ...pin, ...patch } : pin,
        ),
      }));
    },

    removePin(sceneId, pinId) {
      get().updateScene(sceneId, (scene) => {
        const restantes = (scene.pins ?? []).filter((pin) => pin.id !== pinId);

        // Volta a `undefined` quando esvazia, em vez de deixar `[]` no arquivo:
        // é o mesmo estado, e `sceneForTable` decide por identidade da
        // referência quando o campo está ausente.
        return { ...scene, pins: restantes.length > 0 ? restantes : undefined };
      });
    },

    attachToPin(sceneId, pinId, assetIds) {
      if (assetIds.length === 0) return;

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        pins: (scene.pins ?? []).map((pin) =>
          pin.id === pinId
            ? // `Set` para o mesmo arquivo anexado duas vezes não render duas
              // miniaturas iguais com o mesmo botão de transmitir.
              {
                ...pin,
                attachments: [...new Set([...pin.attachments, ...assetIds])],
              }
            : pin,
        ),
      }));
    },

    detachFromPin(sceneId, pinId, assetId) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        pins: (scene.pins ?? []).map((pin) =>
          pin.id === pinId
            ? // Só desanexa: o arquivo continua no acervo. Apagar o asset aqui
              // levaria embora a imagem de quem a usa como fundo de outra cena.
              {
                ...pin,
                attachments: pin.attachments.filter((id) => id !== assetId),
              }
            : pin,
        ),
      }));
    },

    guardarNoHandout(sceneId, assetIds) {
      const atual = get().board?.scenes.find((scene) => scene.id === sceneId);
      if (!atual) return;

      const guardados = new Set(atual.handout ?? []);
      const novos = [...new Set(assetIds)].filter((id) => !guardados.has(id));

      // Nada novo, nada gravado: `updateScene` alimenta o histórico, e um
      // passo de desfazer que não muda nada confunde quem desfaz.
      if (novos.length === 0) return;

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        handout: [...(scene.handout ?? []), ...novos],
      }));
    },

    tirarDoHandout(sceneId, assetId) {
      get().updateScene(sceneId, (scene) => {
        const restantes = (scene.handout ?? []).filter((id) => id !== assetId);

        // `undefined` quando esvazia, como `removePin`: `sceneForTable`
        // decide por ausência do campo.
        return {
          ...scene,
          handout: restantes.length > 0 ? restantes : undefined,
        };
      });
    },

    addPostit(sceneId, postit) {
      const id = novoId();

      get().updateScene(sceneId, (scene) => ({
        ...scene,
        postits: [
          ...(scene.postits ?? []),
          {
            largura: POSTIT_LARGURA,
            altura: POSTIT_ALTURA,
            texto: "",
            cor: CORES_POSTIT[0],
            ...postit,
            id,
          },
        ],
      }));

      return id;
    },

    updatePostit(sceneId, postitId, patch) {
      get().updateScene(sceneId, (scene) => ({
        ...scene,
        postits: (scene.postits ?? []).map((postit) =>
          postit.id === postitId ? { ...postit, ...patch } : postit,
        ),
      }));
    },

    removePostit(sceneId, postitId) {
      get().updateScene(sceneId, (scene) => {
        const restantes = (scene.postits ?? []).filter(
          (postit) => postit.id !== postitId,
        );

        // Volta a `undefined` quando esvazia, como `removePin`: é o mesmo estado,
        // e é a AUSÊNCIA do campo que faz `sceneForTable` devolver a mesma
        // referência em vez de uma cópia por render.
        return {
          ...scene,
          postits: restantes.length > 0 ? restantes : undefined,
        };
      });
    },
  };
});

export function selectCanUndo(state: SceneStore): boolean {
  return canUndo(state.history);
}

export function selectCanRedo(state: SceneStore): boolean {
  return canRedo(state.history);
}

function findScene(
  state: SceneStore,
  sceneId: string | null | undefined,
): Scene | null {
  if (!sceneId) return null;

  return state.board?.scenes.find((scene) => scene.id === sceneId) ?? null;
}

/** A cena aberta no palco do Mestre. É sobre esta que todas as edições agem. */
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

/**
 * O board que o disco JÁ TEM.
 *
 * Base da diferença, e é o que permite mandar só as cenas mudadas. Avança
 * apenas depois de a gravação voltar: se ela falhar e este ponteiro avançasse
 * junto, a gravação seguinte omitiria uma mudança que nunca chegou ao disco — e
 * a perda apareceria só na próxima abertura da campanha.
 *
 * Zerado na hidratação, por campanha. Ver `hydrate`.
 */
let salvo: Board | null = null;

/**
 * Manda ao disco o que mudou desde a última gravação.
 *
 * A comparação é por IDENTIDADE, e é de graça: cena é imutável aqui, e
 * `updateScene` troca só a cena editada — as outras vinte e nove chegam neste
 * ponto como a mesma referência que o disco já viu. Ver `saveBoardPatch`.
 *
 * Sem base — a primeira gravação de uma campanha recém-aberta cujo board nasceu
 * na tela, ou uma gravação anterior que falhou — vai o board inteiro. É o
 * caminho de antes, e ele continua sendo o certo quando não há do que
 * diferenciar.
 */
async function persistir(board: Board): Promise<void> {
  const base = salvo;

  if (base === null) {
    await saveBoard(board);
    salvo = board;

    return;
  }

  const noDisco = new Map(base.scenes.map((scene) => [scene.id, scene]));

  await saveBoardPatch({
    // Completa de propósito: é ela que decide o que existe, e cena que sai
    // dela tem o arquivo apagado. Mandar a lista parcial faria "não mudou" e
    // "foi apagada" virarem a mesma coisa.
    ordem: board.scenes.map((scene) => scene.id),
    scenes: board.scenes.filter((scene) => noDisco.get(scene.id) !== scene),
    editingSceneId: board.editingSceneId,
    liveSceneId: board.liveSceneId,
  });

  salvo = board;
}

useSceneStore.subscribe((state, previous) => {
  if (state.board === previous.board || !state.board) return;

  const { board } = state;

  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    // Era rejeição sem ninguém ouvindo: um erro de disco na gravação sumia no
    // console. A pasta apagada já é tratada em `call` -- ver `aoSumirCampanha`
    // --, então aqui é só não deixar os outros passarem calados.
    persistir(board).catch((cause: unknown) => {
      console.error("falha ao gravar o board", cause);
    });
  }, PERSIST_DEBOUNCE_MS);
});

/**
 * Grava agora o que estiver pendente.
 *
 * Chamado ANTES de trocar de campanha, e a ordem não é detalhe: `saveBoard`
 * grava na campanha que o processo nativo tem aberta. Um debounce de 400ms
 * ainda no ar no momento da troca escreveria o board da campanha ANTERIOR
 * dentro da nova — e ninguém associaria a perda ao clique de trocar.
 */
export async function flushBoard(): Promise<void> {
  clearTimeout(persistTimer);
  persistTimer = undefined;

  const { board } = useSceneStore.getState();
  if (!board) return;

  await persistir(board);
}

/**
 * Fechar a janela não pode custar os últimos 400ms de trabalho.
 *
 * Continua valendo sem a nuvem, e por um motivo diferente do de antes: o
 * atraso que sobrou é o do próprio disco, e é justamente o gesto de fechar que
 * cai dentro dele.
 */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;

    const { board } = useSceneStore.getState();
    if (!board) return;

    clearTimeout(persistTimer);
    void persistir(board);
  });
}
