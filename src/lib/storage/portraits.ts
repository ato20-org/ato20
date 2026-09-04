import { getDb, SESSION_KEY } from "@/lib/storage/db";
import type { Portrait } from "@/types/scene";

/**
 * Os retratos da sessão, guardados fora do board.
 *
 * Fora pelo mesmo motivo da trilha: o histórico de desfazer tira retratos do
 * board, e um Ctrl+Z depois de mover uma imagem não deve mexer em quem está no
 * ar. E eles não pertencem a nenhuma cena — trocar de mapa não troca o elenco.
 */
export async function loadPortraits(): Promise<Portrait[]> {
  const db = await getDb();

  return (await db.get("portraits", SESSION_KEY))?.portraits ?? [];
}

export async function savePortraits(portraits: Portrait[]): Promise<void> {
  const db = await getDb();
  await db.put("portraits", { portraits }, SESSION_KEY);
}
