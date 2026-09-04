import { BOARD_KEY, getDb } from "@/lib/storage/db";
import { createEmptyBoard, type Board, type Scene } from "@/types/scene";

/**
 * Formato anterior, em que uma única cena servia de edição e de exibição.
 * Boards gravados antes da separação preview/no-ar chegam assim.
 */
export type LegacyBoard = { scenes: Scene[]; activeSceneId: string | null };

/** O que este navegador sabe da cópia na nuvem. */
export type SyncMark = { version: number; dirty: boolean };

/** Nunca sincronizado: versão zero, e nada pendente para subir. */
const UNSYNCED: SyncMark = { version: 0, dirty: false };

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

/**
 * A chave do board no disco.
 *
 * Uma por mesa: com a chave única de antes, abrir a mesa de casa sobrescrevia
 * o cache da mesa do trabalho. `null` — instalação sem Supabase — continua na
 * chave antiga, que lá é a única que existe.
 */
function boardKey(roomId: string | null): string {
  return roomId ?? BOARD_KEY;
}

/**
 * Carrega o board desta mesa, ou cria um vazio.
 *
 * Quando a mesa ainda não tem cache próprio, adota o board que estava na chave
 * antiga — é o board de quem já usava a ferramenta antes das cenas na nuvem, e
 * deixá-lo para trás significaria abrir a mesa vazia com o trabalho todo ainda
 * no disco.
 *
 * A adoção **copia e não remove**. Remover era a decisão original, para a
 * segunda mesa não herdar as cenas da primeira — mas o preço apareceu na
 * prática: quem trocou de mesa depois da adoção abriu um board vazio, com o
 * trabalho preso numa chave que só o devtools alcança. Herdar uma cópia é
 * visível e reversível; perder o acesso não é.
 */
export async function loadLocalBoard(roomId: string | null): Promise<Board> {
  const db = await getDb();
  const key = boardKey(roomId);
  const stored = (await db.get("boards", key)) as Board | LegacyBoard | undefined;

  if (stored) {
    const board = migrateBoard(stored);
    if (board !== stored) await db.put("boards", board, key);

    return board;
  }

  if (roomId) {
    const legacy = (await db.get("boards", BOARD_KEY)) as Board | LegacyBoard | undefined;

    if (legacy) {
      const board = migrateBoard(legacy);
      await db.put("boards", board, key);

      return board;
    }
  }

  const board = createEmptyBoard();
  await db.put("boards", board, key);

  return board;
}

export async function saveLocalBoard(roomId: string | null, board: Board): Promise<void> {
  const db = await getDb();
  await db.put("boards", board, boardKey(roomId));
}

export async function loadSyncMark(roomId: string | null): Promise<SyncMark> {
  if (!roomId) return UNSYNCED;

  const db = await getDb();

  return (await db.get("sync", roomId)) ?? UNSYNCED;
}

export async function saveSyncMark(roomId: string | null, mark: SyncMark): Promise<void> {
  if (!roomId) return;

  const db = await getDb();
  await db.put("sync", mark, roomId);
}
