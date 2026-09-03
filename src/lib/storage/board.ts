import { BOARD_KEY, getDb } from "@/lib/storage/db";
import { createEmptyBoard, type Board, type Scene } from "@/types/scene";

/**
 * Formato anterior, em que uma única cena servia de edição e de exibição.
 * Boards gravados antes da separação preview/no-ar chegam assim.
 */
export type LegacyBoard = { scenes: Scene[]; activeSceneId: string | null };

/**
 * Normaliza o board lido do disco.
 *
 * A migração vive aqui e não no `upgrade` do IndexedDB porque o board é um
 * único registro JSON: transformá-lo na leitura é mais simples que versionar o
 * schema, e roda uma vez só — o resultado é gravado de volta.
 */
export function migrateBoard(stored: Board | LegacyBoard): Board {
  if ("editingSceneId" in stored) return stored;

  // No formato antigo, o que o mestre editava era exatamente o que a mesa via.
  return {
    scenes: stored.scenes,
    editingSceneId: stored.activeSceneId,
    liveSceneId: stored.activeSceneId,
  };
}

/** Carrega o board salvo, ou cria um vazio na primeira visita. */
export async function loadBoard(): Promise<Board> {
  const db = await getDb();
  // O tipo do store descreve o formato atual; o disco pode ter o anterior.
  const stored = (await db.get("boards", BOARD_KEY)) as Board | LegacyBoard | undefined;

  if (stored) {
    const board = migrateBoard(stored);
    if (board !== stored) await saveBoard(board);

    return board;
  }

  const board = createEmptyBoard();
  await db.put("boards", board, BOARD_KEY);

  return board;
}

export async function saveBoard(board: Board): Promise<void> {
  const db = await getDb();
  await db.put("boards", board, BOARD_KEY);
}
