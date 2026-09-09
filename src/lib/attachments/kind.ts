export type AttachmentKind = "image" | "pdf" | "audio" | "video" | "text" | "other";

const BY_EXTENSION: Record<string, AttachmentKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  svg: "image",
  bmp: "image",
  pdf: "pdf",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  m4a: "audio",
  mp4: "video",
  webm: "video",
  mov: "video",
  txt: "text",
  md: "text",
  csv: "text",
  json: "text",
};

/**
 * O tipo de imagem pela extensão.
 *
 * Só imagem, e de propósito: quem precisa disto é a ficha, que é guardada pelo
 * NOME do arquivo e não pelo registro do anexo — ver `Personagem.ficha`. Para
 * montar a blob da miniatura é preciso um tipo, e blob sem tipo deixa a decisão
 * de renderizar para o palpite do navegador.
 */
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
};

/** O tipo MIME de imagem pelo nome, ou `null` se o nome não é de imagem. */
export function imageMimeByName(name: string): string | null {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";

  return IMAGE_MIME[extension] ?? null;
}

/**
 * Como exibir o anexo.
 *
 * O `mimeType` manda, mas o Storage às vezes devolve vazio ou
 * `application/octet-stream` — sobretudo em arquivo vindo de celular. Aí a
 * extensão é o que resta, e é melhor que jogar tudo em "outro".
 */
export function attachmentKind(name: string, mimeType: string): AttachmentKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("text/") || mimeType === "application/json") return "text";

  const extension = name.split(".").pop()?.toLowerCase() ?? "";

  return BY_EXTENSION[extension] ?? "other";
}
