"use client";

import { deviceId } from "@/lib/device";
import { getSupabase } from "@/lib/supabase/client";
import type { AssetFolder, AssetKind, AssetMeta } from "@/types/scene";

/**
 * Uma linha do acervo da mesa.
 *
 * É o `AssetMeta` mais o que só o servidor sabe: quais aparelhos já têm cópia
 * local, e se o binário ainda está no bucket.
 */
export type RemoteAsset = AssetMeta & { mirrors: string[]; inBucket: boolean };

type Row = {
  asset_id: string;
  kind: string;
  name: string;
  mime_type: string;
  size: number;
  natural_width: number | null;
  natural_height: number | null;
  folder_id: string | null;
  created_at: string;
  mirrors: string[];
  in_bucket: boolean;
};

const COLUMNS =
  "asset_id, kind, name, mime_type, size, natural_width, natural_height, folder_id, created_at, mirrors, in_bucket";

function toRemote(row: Row): RemoteAsset {
  return {
    id: row.asset_id,
    kind: row.kind as AssetKind,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: new Date(row.created_at).getTime(),
    naturalWidth: row.natural_width ?? undefined,
    naturalHeight: row.natural_height ?? undefined,
    folderId: row.folder_id ?? undefined,
    mirrors: row.mirrors,
    inBucket: row.in_bucket,
  };
}

export async function listRemoteAssets(roomId: string): Promise<RemoteAsset[]> {
  const { data, error } = await getSupabase()
    .from("library_assets")
    .select(COLUMNS)
    .eq("room_id", roomId);

  if (error) throw error;

  return (data as Row[] | null)?.map(toRemote) ?? [];
}

/**
 * Grava (ou atualiza) as linhas destes arquivos.
 *
 * Em lote e por `upsert`: subir o acervo de quem já usava a ferramenta são
 * dezenas de linhas de uma vez, e uma requisição por arquivo pagaria latência
 * por nada. `mirrors` fica de fora do payload de propósito — quem o escreve é
 * o RPC, e mandá-lo aqui apagaria a marca das outras máquinas.
 */
export async function upsertAssets(roomId: string, assets: AssetMeta[]): Promise<void> {
  if (assets.length === 0) return;

  const { error } = await getSupabase()
    .from("library_assets")
    .upsert(
      assets.map((asset) => ({
        room_id: roomId,
        asset_id: asset.id,
        kind: asset.kind,
        name: asset.name,
        mime_type: asset.mimeType,
        size: asset.size,
        natural_width: asset.naturalWidth ?? null,
        natural_height: asset.naturalHeight ?? null,
        folder_id: asset.folderId ?? null,
        created_at: new Date(asset.createdAt).toISOString(),
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "room_id,asset_id" },
    );

  if (error) throw error;
}

export async function deleteAssetRow(roomId: string, assetId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("library_assets")
    .delete()
    .eq("room_id", roomId)
    .eq("asset_id", assetId);

  if (error) throw error;
}

/** Registra que este aparelho tem cópia local. Ver o RPC na 0006. */
export async function markMirror(roomId: string, assetId: string): Promise<void> {
  const { error } = await getSupabase().rpc("mark_asset_mirror", {
    p_room_id: roomId,
    p_asset_id: assetId,
    p_device: deviceId(),
  });

  if (error) throw error;
}

/** Depois da faxina o binário não está mais no Storage — só nas máquinas. */
export async function setInBucket(
  roomId: string,
  assetIds: string[],
  inBucket: boolean,
): Promise<void> {
  if (assetIds.length === 0) return;

  const { error } = await getSupabase()
    .from("library_assets")
    .update({ in_bucket: inBucket, updated_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .in("asset_id", assetIds);

  if (error) throw error;
}

export async function listRemoteFolders(roomId: string): Promise<AssetFolder[]> {
  const { data, error } = await getSupabase()
    .from("library_folders")
    .select("id, name, created_at")
    .eq("room_id", roomId);

  if (error) throw error;

  return (
    (data as Array<{ id: string; name: string; created_at: string }> | null)?.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: new Date(row.created_at).getTime(),
    })) ?? []
  );
}

export async function upsertFolders(roomId: string, folders: AssetFolder[]): Promise<void> {
  if (folders.length === 0) return;

  const { error } = await getSupabase()
    .from("library_folders")
    .upsert(
      folders.map((folder) => ({
        room_id: roomId,
        id: folder.id,
        name: folder.name,
        created_at: new Date(folder.createdAt).toISOString(),
      })),
      { onConflict: "room_id,id" },
    );

  if (error) throw error;
}

export async function deleteFolderRow(roomId: string, folderId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("library_folders")
    .delete()
    .eq("room_id", roomId)
    .eq("id", folderId);

  if (error) throw error;
}
