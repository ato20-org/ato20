import { getDb, SESSION_KEY } from "@/lib/storage/db";
import type { SessionTrack } from "@/types/scene";

/**
 * A trilha da sessão, guardada fora do board.
 *
 * Fora de propósito: o histórico de desfazer tira retratos do board, e se a
 * trilha morasse lá um Ctrl+Z depois de mover uma imagem também mudaria a
 * música. Som não é conteúdo de cena.
 */
export async function loadTrack(): Promise<SessionTrack | null> {
  const db = await getDb();

  return (await db.get("session", SESSION_KEY))?.track ?? null;
}

export async function saveTrack(track: SessionTrack | null): Promise<void> {
  const db = await getDb();
  await db.put("session", { track }, SESSION_KEY);
}
