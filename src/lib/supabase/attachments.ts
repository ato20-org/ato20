"use client";

import { getSupabase } from "@/lib/supabase/client";

const BUCKET = "attachments";

/** Uma hora. Tempo de sobra para abrir o arquivo, curto para vazar um link. */
const SIGNED_URL_TTL_SECONDS = 3600;

export type Attachment = {
  /** Caminho completo no bucket. É o identificador. */
  path: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
};

/**
 * Nome de arquivo seguro como chave de objeto.
 *
 * Barra viraria pasta nova e furaria o `{sala}/{uid}/` que as policies usam
 * para decidir quem escreve onde — é uma questão de acesso, não de estética.
 */
export function safeName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, "-")
    // Caracteres de controle: invisiveis no nome e recusados como chave.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);

  return cleaned || "arquivo";
}

function folder(roomId: string, userId: string): string {
  return `${roomId}/${userId}`;
}

export async function listAttachments(roomId: string, userId: string): Promise<Attachment[]> {
  const prefix = folder(roomId, userId);

  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .list(prefix, { sortBy: { column: "created_at", order: "desc" } });

  if (error) throw error;

  return (data ?? [])
    // `list` inclui marcadores de pasta, que não têm metadados.
    .filter((object) => object.id)
    .map((object) => ({
      path: `${prefix}/${object.name}`,
      name: object.name,
      size: (object.metadata?.size as number | undefined) ?? 0,
      mimeType: (object.metadata?.mimetype as string | undefined) ?? "",
      createdAt: object.created_at ?? "",
    }));
}

/**
 * Nenhuma restrição de tipo: o jogador guarda o que quiser — retrato, ficha em
 * PDF, print de conversa, gravação da sessão.
 */
export async function uploadAttachment(roomId: string, userId: string, file: File): Promise<void> {
  const path = `${folder(roomId, userId)}/${safeName(file.name)}`;

  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      // Reenviar o mesmo nome substitui, que é o comportamento esperado de
      // "atualizei minha ficha".
      upsert: true,
    });

  if (error) throw error;
}

export async function deleteAttachment(path: string): Promise<void> {
  const { error } = await getSupabase().storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

/**
 * Assina o lote inteiro numa requisição.
 *
 * O bucket é privado, então não existe URL pública e cada arquivo precisa de
 * link assinado para ser exibido. Assinar um por um custaria uma chamada por
 * arquivo a cada abertura da aba; `createSignedUrls` resolve tudo de uma vez,
 * o que é o que viabiliza mostrar miniatura de todos.
 *
 * Caminhos que falharem simplesmente não aparecem no resultado.
 */
export async function signAttachments(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;

  return Object.fromEntries(
    (data ?? []).flatMap((entry) =>
      entry.signedUrl && entry.path ? [[entry.path, entry.signedUrl] as const] : [],
    ),
  );
}

/** Um único arquivo, para quando o lote já passou e falta só este. */
export async function signAttachment(path: string): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Não foi possível assinar o anexo");

  return data.signedUrl;
}
