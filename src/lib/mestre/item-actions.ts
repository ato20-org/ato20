"use client";

import {
  MIN_ITEM_SIZE,
  normalizeAngle,
  offsetInsideScene,
} from "@/lib/geometry/transform";
import { flipPatches, type FlipAxis } from "@/lib/mestre/flip";
import { useClipboardStore } from "@/lib/store/use-clipboard-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import {
  selectEditingScene,
  useSceneStore,
  type ItemPatch,
  type ZDirection,
} from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import type { CanvasItem, ItemDraft, Scene } from "@/types/scene";

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
};

function read(): ActionContext {
  // Sempre a cena em edição: as ações do mestre agem no palco dele, nunca
  // direto no que a mesa está vendo.
  const scene = selectEditingScene(useSceneStore.getState());
  const { selectedIds } = useSelectionStore.getState();

  return {
    scene,
    selectedIds,
    selectedItems: scene
      ? scene.items.filter((item) => selectedIds.includes(item.id))
      : [],
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
    opacity: item.opacity,
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
    drafts.map((draft) => ({
      ...draft,
      ...offsetInsideScene(draft, PASTE_OFFSET),
    })),
  );

  useSelectionStore.getState().select(ids);
}

export function duplicateSelection(): void {
  const { scene, selectedItems } = read();
  if (!scene || selectedItems.length === 0) return;

  const ids = useSceneStore
    .getState()
    .addItems(scene.id, selectedItems.map(offsetDraft));
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
    .criarGrupo(scene.id, `Pasta ${ordem}`, selectedIds, parentId);
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

  useSceneStore
    .getState()
    .updateFog(scene.id, region.id, { revealed: !region.revealed });
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
export function girarPatches(items: CanvasItem[], graus: number): ItemPatch[] {
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
  items: CanvasItem[],
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
  const { scene, selectedItems } = read();
  if (!scene || selectedItems.length === 0) return;

  useSceneStore
    .getState()
    .updateItems(scene.id, girarPatches(selectedItems, graus));
}

export function nudgeSelection(dx: number, dy: number): void {
  const { scene, selectedItems } = read();
  if (!scene || selectedItems.length === 0) return;

  useSceneStore.getState().updateItems(
    scene.id,
    selectedItems
      .filter((item) => !item.locked)
      .map((item) => ({
        id: item.id,
        patch: { x: item.x + dx, y: item.y + dy },
      })),
  );
}
