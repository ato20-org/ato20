import { getDb, type AssetRecord } from "@/lib/storage/db";
import { SYNCED_KINDS, type AssetKind, type AssetMeta } from "@/types/scene";

const MIME_TO_KIND: Array<[prefix: string, kind: AssetKind]> = [
  ["image/", "image"],
  ["audio/", "audio"],
  ["application/pdf", "pdf"],
];

export function kindFromMimeType(mimeType: string): AssetKind | null {
  return MIME_TO_KIND.find(([prefix]) => mimeType.startsWith(prefix))?.[1] ?? null;
}

function toMeta(record: AssetRecord): AssetMeta {
  const { id, kind, name, mimeType, size, createdAt, naturalWidth, naturalHeight, remoteAt } =
    record;
  return { id, kind, name, mimeType, size, createdAt, naturalWidth, naturalHeight, remoteAt };
}

/**
 * Mede a imagem no upload e guarda junto. Sem isso, cada "adicionar à cena"
 * teria que decodificar o arquivo de novo só para descobrir a proporção.
 */
async function readImageSize(blob: Blob): Promise<{ naturalWidth: number; naturalHeight: number }> {
  const bitmap = await createImageBitmap(blob);

  try {
    return { naturalWidth: bitmap.width, naturalHeight: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/** Guarda o arquivo e devolve os metadados. Rejeita tipo não suportado. */
export async function putAsset(file: File): Promise<AssetMeta> {
  const kind = kindFromMimeType(file.type);
  if (!kind) {
    throw new Error(`Tipo de arquivo não suportado: ${file.type || "desconhecido"}`);
  }

  const record: AssetRecord = {
    id: crypto.randomUUID(),
    kind,
    name: file.name,
    mimeType: file.type,
    size: file.size,
    createdAt: Date.now(),
    blob: file,
    ...(kind === "image" ? await readImageSize(file) : {}),
  };

  const db = await getDb();
  await db.put("assets", record);

  return toMeta(record);
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  const db = await getDb();
  return db.get("assets", id);
}

export async function listAssets(kind?: AssetKind): Promise<AssetMeta[]> {
  const db = await getDb();
  const records = kind
    ? await db.getAllFromIndex("assets", "by-kind", kind)
    : await db.getAll("assets");

  return records.map(toMeta).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("assets", id);
  revokeAssetUrl(id);
}

/** Registra que o arquivo já está no Storage, para não subir de novo. */
export async function markAssetRemote(id: string): Promise<void> {
  const db = await getDb();
  const record = await db.get("assets", id);
  if (!record) return;

  await db.put("assets", { ...record, remoteAt: Date.now() });
}

/**
 * Arquivos que precisam subir e ainda não subiram.
 *
 * É uma reconciliação, não um gancho no upload: cobre também o que foi
 * enviado antes de a sala existir, ou numa sessão em que o Supabase estava
 * fora do ar.
 */
export async function listPendingUploads(): Promise<AssetMeta[]> {
  const db = await getDb();
  const records = await db.getAll("assets");

  return records
    .filter((record) => !record.remoteAt && SYNCED_KINDS.includes(record.kind))
    .map(toMeta);
}

/**
 * Cache de object URLs por aba. Sem ele, cada render recria a URL e vaza
 * memória — o browser só libera no revoke explícito.
 */
const urlCache = new Map<string, string>();

export async function getAssetUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;

  const record = await getAsset(id);
  if (!record) return null;

  const url = URL.createObjectURL(record.blob);
  urlCache.set(id, url);

  return url;
}

export function revokeAssetUrl(id: string): void {
  const url = urlCache.get(id);
  if (!url) return;

  URL.revokeObjectURL(url);
  urlCache.delete(id);
}

export function revokeAllAssetUrls(): void {
  for (const id of [...urlCache.keys()]) revokeAssetUrl(id);
}
