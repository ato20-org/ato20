"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileAudio, FileText, FileVideo, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AttachmentViewer } from "@/components/attachments/attachment-viewer";
import { Button } from "@/components/ui/button";
import { attachmentKind, type AttachmentKind } from "@/lib/attachments/kind";
import { currentUserId } from "@/lib/supabase/auth";
import {
  deleteAttachment,
  listAttachments,
  signAttachments,
  uploadAttachment,
  type Attachment,
} from "@/lib/supabase/attachments";

/**
 * Arquivos do personagem. Sem campo nenhum pré-definido: o jogador guarda o
 * que quiser — retrato, ficha em PDF, print de conversa, gravação da sessão.
 *
 * Impor "foto do personagem" e "ficha" como dois campos separados obrigaria
 * cada mesa a caber num formato que não é o dela.
 */
export function PlayerAttachments({ roomId }: { roomId: string }) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(
    async (uid: string) => {
      try {
        const list = await listAttachments(roomId, uid);
        setFiles(list);
        // Um único pedido assina o lote, e é isso que permite miniatura de
        // todos sem uma chamada por arquivo.
        setUrls(await signAttachments(list.map((file) => file.path)));
      } catch {
        setFiles([]);
        setUrls({});
      }
    },
    [roomId],
  );

  useEffect(() => {
    let active = true;

    void currentUserId()
      .then(async (uid) => {
        if (!active || !uid) return;

        setUserId(uid);
        await reload(uid);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [reload]);

  async function handleUpload(selected: FileList | null) {
    if (!selected?.length || !userId) return;

    setBusy(true);

    try {
      const results = await Promise.allSettled(
        [...selected].map((file) => uploadAttachment(roomId, userId, file)),
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      if (failed > 0) toast.error(`${failed} arquivo(s) não puderam ser enviados.`);

      await reload(userId);
    } finally {
      setBusy(false);
    }
  }

  async function remove(attachment: Attachment) {
    if (!userId) return;

    try {
      await deleteAttachment(attachment.path);
      await reload(userId);
    } catch {
      toast.error("Não foi possível remover o arquivo.");
    }
  }

  if (!loaded) {
    return <Loader2 className="text-muted-foreground mx-auto size-4 animate-spin" />;
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Meus arquivos</h2>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Paperclip />}
        Anexar arquivo
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          void handleUpload(event.target.files);
          // Sem isso, reenviar o mesmo arquivo não dispara `change`.
          event.target.value = "";
        }}
      />

      {files.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Nada anexado. Retrato, ficha, mapa rabiscado — o que for útil pra ti.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {files.map((file) => (
            <li key={file.path} className="group relative">
              <button
                type="button"
                className="hover:border-primary/60 focus-visible:ring-ring block w-full overflow-hidden rounded-md border text-left focus-visible:ring-2 focus-visible:outline-none"
                onClick={() => setViewing(file)}
              >
                <Thumbnail file={file} url={urls[file.path]} />
                <span className="block truncate p-1 text-[10px]" title={file.name}>
                  {file.name}
                </span>
              </button>

              <Button
                variant="secondary"
                size="icon-xs"
                // Some no toque até o foco, para não competir com a miniatura
                // num alvo pequeno de celular.
                className="absolute top-1 right-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                aria-label={`Remover ${file.name}`}
                onClick={() => void remove(file)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AttachmentViewer
        attachment={viewing}
        url={viewing ? (urls[viewing.path] ?? null) : null}
        onClose={() => setViewing(null)}
      />
    </section>
  );
}

const KIND_ICON: Record<Exclude<AttachmentKind, "image">, typeof FileText> = {
  pdf: FileText,
  audio: FileAudio,
  video: FileVideo,
  text: FileText,
  other: FileText,
};

/** Imagem mostra a si mesma; o resto mostra o ícone do tipo. */
function Thumbnail({ file, url }: { file: Attachment; url: string | undefined }) {
  const kind = attachmentKind(file.name, file.mimeType);

  if (kind === "image" && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={file.name} className="aspect-square w-full bg-black object-cover" />
    );
  }

  const Icon = kind === "image" ? FileText : KIND_ICON[kind];

  return (
    <span className="bg-muted grid aspect-square w-full place-items-center">
      <Icon className="text-muted-foreground size-6" aria-hidden />
    </span>
  );
}
