"use client";

import { getSupabase } from "@/lib/supabase/client";

const BUCKET = "attachments";

/** Uma hora. Tempo de sobra para abrir o arquivo, curto para vazar um link. */
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Teto por arquivo no Storage.
 *
 * É limite do plano, não escolha nossa: o servidor recusa acima disso com
 * "The object exceeded the maximum allowed size". Conferir antes de enviar
 * troca uma espera longa que termina em erro por uma resposta imediata que
 * diz o tamanho e o limite.
 */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type Attachment = {
  /** Caminho completo no bucket. É o identificador. */
  path: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
};

/**
 * Caracteres que o Storage aceita numa chave de objeto.
 *
 * Medido contra o servidor, não deduzido: qualquer coisa fora deste conjunto
 * volta como `Invalid key` e o envio falha inteiro. Acento não está incluído —
 * e "Histórico - Edgar.jpg" é o nome que qualquer ficha em português tem.
 *
 * A barra fica de fora de propósito, apesar de o servidor aceitá-la: ela
 * viraria pasta nova e furaria o `{sala}/{uid}/` que as policies usam para
 * decidir quem escreve onde. É acesso, não estética.
 */
const ALLOWED_KEY_CHARS = /[^ !#$&'()*+,.:;=?@_0-9A-Za-z-]/g;

/** Tira o acento mantendo a letra: "ação" vira "acao", não "a--o". */
function deaccent(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cleanPart(part: string): string {
  return deaccent(part).replace(ALLOWED_KEY_CHARS, "-").replace(/-{2,}/g, "-").trim();
}

/**
 * Nome de arquivo utilizável como chave de objeto.
 *
 * O nome exibido sai daqui — não há onde guardar o original sem custo: metadado
 * customizado sobrevive no Storage, mas só o `info` de cada arquivo o devolve, e
 * isso trocaria uma assinatura em lote por uma chamada por anexo a cada abertura
 * da aba. Um acento perdido custa menos que isso no celular de quem joga.
 *
 * Dois nomes que só diferem no acento passam a colidir, e o segundo substitui o
 * primeiro — mesma regra de sempre para nomes iguais.
 */
export function safeName(name: string): string {
  const dot = name.lastIndexOf(".");
  // Extensão só conta se for curta e vier depois de algum nome: assim
  // "ficha.tar.gz" mantém ".gz" e ".gitignore" não é tratado como extensão solta.
  const hasExtension = dot > 0 && name.length - dot <= 11;

  const stem = cleanPart(hasExtension ? name.slice(0, dot) : name)
    .slice(0, 100)
    .replace(/^-+|-+$/g, "");

  // Um nome inteiro fora do ASCII vira só traços; um nome genérico que preserva
  // a extensão diz mais que "---.jpg".
  return (stem || "arquivo") + cleanPart(hasExtension ? name.slice(dot) : "");
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
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `${file.name} tem ${formatBytes(file.size)} e o limite por arquivo é ${formatBytes(MAX_ATTACHMENT_BYTES)}.`,
    );
  }

  const path = `${folder(roomId, userId)}/${safeName(file.name)}`;

  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      // Reenviar o mesmo nome substitui, que é o comportamento esperado de
      // "atualizei minha ficha".
      upsert: true,
    });

  // O erro do Storage vem em inglês e sem dizer de qual arquivo é. Enviando
  // vários de uma vez, saber o nome é metade da informação.
  if (error) throw new Error(`${file.name} não pôde ser enviado. ${error.message}`);
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
