import { getDb } from "@/lib/storage/db";
import type { AssetFolder } from "@/types/scene";

/** Em ordem alfabética: a lista é navegada com o olho, não por recência. */
export async function listFolders(): Promise<AssetFolder[]> {
  const db = await getDb();
  const folders = await db.getAll("folders");

  return folders.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function createFolder(name: string): Promise<AssetFolder> {
  const folder: AssetFolder = { id: crypto.randomUUID(), name, createdAt: Date.now() };

  const db = await getDb();
  await db.put("folders", folder);

  return folder;
}

/** Grava uma pasta que veio da nuvem, com o id de origem. */
export async function putFolder(folder: AssetFolder): Promise<void> {
  const db = await getDb();
  await db.put("folders", folder);
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const db = await getDb();
  const folder = await db.get("folders", id);
  if (!folder) return;

  await db.put("folders", { ...folder, name });
}

/**
 * Apaga a pasta e devolve o conteúdo à raiz.
 *
 * Nunca apaga arquivo: perder um mapa por causa de um clique em "apagar
 * pasta" seria dano desproporcional ao gesto, e o arquivo é o que custou
 * trabalho.
 */
export async function deleteFolder(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["folders", "assets"], "readwrite");

  await tx.objectStore("folders").delete(id);

  const assets = tx.objectStore("assets");
  for (const record of await assets.getAll()) {
    if (record.folderId === id) await assets.put({ ...record, folderId: undefined });
  }

  await tx.done;
}
