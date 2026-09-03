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
