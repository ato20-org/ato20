"use client";

import { getAssetUrl } from "@/lib/storage/assets";
import { remoteAssetUrl } from "@/lib/supabase/asset-sync";

/**
 * Endereço de um arquivo, seja ele local ou remoto.
 *
 * É a costura que faz as três visões usarem o mesmo componente de cena. No
 * Operador o arquivo está no IndexedDB e resolve para uma blob URL, instantânea
 * e sem rede. No celular do jogador não há IndexedDB nenhum, e cai para a URL
 * pública do Storage. Nenhum componente de desenho sabe a diferença.
 */
export async function resolveAssetUrl(
  assetId: string,
  roomId: string | null,
): Promise<string | null> {
  const local = await getAssetUrl(assetId);
  if (local) return local;

  if (!roomId) return null;

  return remoteAssetUrl(roomId, assetId);
}
