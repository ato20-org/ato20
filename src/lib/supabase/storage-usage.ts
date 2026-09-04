"use client";

import { getSupabase } from "@/lib/supabase/client";

const BUCKET = "assets";

/** O Storage pagina; mil por página cobre qualquer mesa com folga. */
const PAGE = 1000;

export type StoredObject = { assetId: string; size: number };

/** Um prefixo do bucket, que é sempre o id de uma sala. */
export type StoredRoom = { roomId: string; files: number; bytes: number };

/**
 * Os arquivos que esta mesa tem no Storage.
 *
 * Lê o bucket, não a tabela do acervo: é o bucket que consome a cota, e é
 * exatamente a diferença entre os dois que interessa medir — linha sem objeto
 * é um arquivo que só existe nas máquinas, e objeto sem linha é lixo.
 */
export async function listRoomObjects(roomId: string): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await getSupabase()
      .storage.from(BUCKET)
      .list(roomId, { limit: PAGE, offset });

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const file of data) {
      objects.push({
        assetId: file.name,
        size: (file.metadata?.size as number | undefined) ?? 0,
      });
    }

    if (data.length < PAGE) break;
  }

  return objects;
}

/**
 * Quanto cada sala ocupa no bucket.
 *
 * Serve para achar mesa morta: o Storage não tem chave estrangeira com
 * `rooms`, então apagar a linha da mesa **não** apaga os arquivos dela. Eles
 * ficam pagando cota num prefixo que ninguém mais consulta.
 */
export async function listStoredRooms(): Promise<StoredRoom[]> {
  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .list("", { limit: PAGE });

  if (error) throw error;

  const prefixes = (data ?? []).filter((entry) => entry.id === null).map((entry) => entry.name);
  const rooms: StoredRoom[] = [];

  for (const roomId of prefixes) {
    const objects = await listRoomObjects(roomId);

    rooms.push({
      roomId,
      files: objects.length,
      bytes: objects.reduce((total, object) => total + object.size, 0),
    });
  }

  return rooms.sort((a, b) => b.bytes - a.bytes);
}

/**
 * Apaga objetos do bucket, em lotes.
 *
 * A policy só deixa o mestre daquela sala apagar, então uma tentativa em
 * prefixo alheio volta recusada pelo servidor — a tela pode oferecer sem
 * arriscar apagar mesa de outro mestre.
 */
export async function removeRoomObjects(roomId: string, assetIds: string[]): Promise<void> {
  if (assetIds.length === 0) return;

  const paths = assetIds.map((assetId) => `${roomId}/${assetId}`);

  for (let start = 0; start < paths.length; start += 100) {
    const { error } = await getSupabase()
      .storage.from(BUCKET)
      .remove(paths.slice(start, start + 100));

    if (error) throw error;
  }
}

/** Tamanho legível, para a tela não mostrar bytes crus. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
