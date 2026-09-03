"use client";

import { getAsset, markAssetRemote } from "@/lib/storage/assets";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

const BUCKET = "assets";

/**
 * Um ano de cache. O caminho contém o UUID do arquivo, então o conteúdo nunca
 * muda para um mesmo endereço — cachear agressivamente economiza a cota de
 * egress a cada troca de cena.
 */
const CACHE_CONTROL = "31536000";

function objectPath(roomId: string, assetId: string): string {
  return `${roomId}/${assetId}`;
}

/**
 * URL pública do arquivo. É calculável a partir do par sala/arquivo, então
 * ninguém precisa guardar a URL — nem o JSON da cena, que viaja a 10 Hz.
 */
export function remoteAssetUrl(roomId: string, assetId: string): string | null {
  if (!isSupabaseConfigured()) return null;

  return getSupabase().storage.from(BUCKET).getPublicUrl(objectPath(roomId, assetId)).data
    .publicUrl;
}

/** Sobe o binário que está no IndexedDB e marca o registro local. */
export async function uploadAsset(roomId: string, assetId: string): Promise<void> {
  const record = await getAsset(assetId);
  if (!record) throw new Error(`Asset ${assetId} não existe localmente`);

  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(objectPath(roomId, assetId), record.blob, {
      contentType: record.mimeType,
      cacheControl: CACHE_CONTROL,
      // Retomar um upload interrompido reenvia o mesmo caminho.
      upsert: true,
    });

  if (error) throw error;

  await markAssetRemote(assetId);
}

/** Melhor esforço: falhar aqui não deve impedir a exclusão local. */
export async function deleteRemoteAsset(roomId: string, assetId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  await getSupabase().storage.from(BUCKET).remove([objectPath(roomId, assetId)]);
}
