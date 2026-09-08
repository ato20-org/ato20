import type { Board, Scene } from "@/types/scene";

/**
 * Regras de ciclo de vida das cenas de um board.
 *
 * Puras e fora do store porque o que elas decidem é sutil: toda operação tem
 * de responder ao mesmo tempo "qual cena o mestre passa a editar" e "o que a
 * mesa continua vendo", e errar o segundo troca a cena dos jogadores sem
 * ninguém pedir.
 */

/** Nasce no palco do mestre. A mesa não muda de cena por causa disso. */
export function appendScene(board: Board, scene: Scene): Board {
  return {
    scenes: [...board.scenes, scene],
    editingSceneId: scene.id,
    liveSceneId: board.liveSceneId,
  };
}

/** Insere logo após a cena de origem, para a cópia ficar ao lado do original. */
export function insertSceneAfter(board: Board, afterId: string, scene: Scene): Board {
  const at = board.scenes.findIndex((candidate) => candidate.id === afterId);
  const position = at < 0 ? board.scenes.length : at + 1;

  return {
    scenes: [...board.scenes.slice(0, position), scene, ...board.scenes.slice(position)],
    editingSceneId: scene.id,
    liveSceneId: board.liveSceneId,
  };
}

/**
 * Move a cena para uma posição da lista.
 *
 * Substituiu o par "para cima"/"para baixo". Aqueles trocavam com o vizinho, o
 * que servia para acertar uma cena fora de lugar e não para organizar um
 * roteiro: levar a última cena para o começo custava um clique por posição,
 * cada um deles no fundo de um menu que precisava ser reaberto. Arrastar
 * resolve numa passada.
 *
 * Remove e insere, e não troca de lugar: trocar embaralharia tudo que estivesse
 * entre a origem e o destino, e o que se quer de um arrasto é a cena parar onde
 * foi solta com o resto fechando a fila.
 */
export function moveSceneToIndex(board: Board, sceneId: string, index: number): Board {
  const from = board.scenes.findIndex((scene) => scene.id === sceneId);
  if (from < 0) return board;

  const target = Math.min(Math.max(index, 0), board.scenes.length - 1);
  if (target === from) return board;

  const scenes = [...board.scenes];
  const [moving] = scenes.splice(from, 1);
  scenes.splice(target, 0, moving!);

  return { ...board, scenes };
}

export function removeScene(board: Board, sceneId: string): Board {
  const scenes = board.scenes.filter((scene) => scene.id !== sceneId);

  return {
    scenes,
    editingSceneId:
      board.editingSceneId === sceneId ? (scenes[0]?.id ?? null) : board.editingSceneId,
    // Apagar a cena que está no ar tira a mesa do ar. Promover outra cena
    // sozinha jogaria conteúdo não escolhido na frente dos jogadores.
    liveSceneId: board.liveSceneId === sceneId ? null : board.liveSceneId,
  };
}
