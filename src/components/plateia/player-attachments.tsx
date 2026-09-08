"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileAudio, FileText, FileVideo, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AttachmentViewer } from "@/components/attachments/attachment-viewer";
import { Button } from "@/components/ui/button";
import { attachmentKind, type AttachmentKind } from "@/lib/attachments/kind";
import {
  attachmentUrl,
  deleteAttachment,
  formatBytes,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
  revokeAttachmentUrl,
  uploadAttachment,
  type Attachment,
} from "@/lib/player/session";

/**
 * Arquivos do personagem. Sem campo nenhum pré-definido: o jogador guarda o
 * que quiser — retrato, ficha em PDF, print de conversa, gravação da sessão.
 *
 * Impor "foto do personagem" e "ficha" como dois campos separados obrigaria
 * cada mesa a caber num formato que não é o dela.
 *
 * Os arquivos vão para `jogadores/{id}/` dentro da pasta da campanha, então
 * eles viajam no zip junto com as cenas — e o mestre os alcança pelo explorador
 * do sistema, sem precisar do aplicativo.
 */
export function PlayerAttachments({ codigo }: { codigo: string }) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const lista = await listAttachments(codigo);
      setFiles(lista);

      // As miniaturas são blob URLs: `<img src>` não manda cabeçalho, e a rota
      // do anexo exige a credencial. Só as imagens são baixadas aqui — um PDF
      // de 40 MB só desce quando alguém o abre.
      const imagens = lista.filter(
        (file) => attachmentKind(file.arquivo, file.mimeType) === "image",
      );

      const resolvidas = await Promise.all(
        imagens.map(async (file) => {
          try {
            return [file.arquivo, await attachmentUrl(codigo, file.arquivo)] as const;
          } catch {
            return null;
          }
        }),
      );

      setUrls(Object.fromEntries(resolvidas.filter(Boolean) as Array<readonly [string, string]>));
    } catch {
      setFiles([]);
      setUrls({});
    }
  }, [codigo]);

  useEffect(() => {
    let ativo = true;

    // `set-state-in-effect` desligado com motivo: a regra rastreia os
    // `setState` de `reload` de volta ate aqui e nao ve que todos acontecem
    // depois de um `await` de rede -- que e o "callback de sistema externo" que
    // a documentacao dela permite. Buscar na montagem e o uso legitimo de
    // efeito, e as saidas seriam mover uma lista puramente local para um store
    // so para agradar o lint, ou trazer uma biblioteca de data fetching para
    // uma chamada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload().finally(() => {
      if (ativo) setLoaded(true);
    });

    return () => {
      ativo = false;
    };
  }, [reload]);

  async function handleUpload(selected: FileList | null) {
    if (!selected?.length) return;

    setBusy(true);

    try {
      // Em série: são arquivos grandes indo para o mesmo disco pela rede, e
      // cinco de uma vez só faz todos terminarem mais tarde.
      for (const file of selected) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(
            `${file.name} tem ${formatBytes(file.size)}. O limite é ${formatBytes(MAX_ATTACHMENT_BYTES)}.`,
          );
          continue;
        }

        try {
          await uploadAttachment(codigo, file);
        } catch (cause) {
          // Um motivo por arquivo, não uma contagem: "1 arquivo não pôde ser
          // enviado" obriga quem enviou a adivinhar se foi tamanho ou limite.
          toast.error(cause instanceof Error ? cause.message : `Falha ao enviar ${file.name}.`);
        }
      }

      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function remove(anexo: Attachment) {
    try {
      await deleteAttachment(codigo, anexo.arquivo);
      revokeAttachmentUrl(anexo.arquivo);
      await reload();
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
      <p className="text-muted-foreground text-[10px]">
        Qualquer tipo, até {formatBytes(MAX_ATTACHMENT_BYTES)} por arquivo.
      </p>
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
            <li key={file.arquivo} className="group relative">
              <button
                type="button"
                className="hover:border-primary/60 focus-visible:ring-ring block w-full overflow-hidden rounded-md border text-left focus-visible:ring-2 focus-visible:outline-none"
                onClick={() => setViewing(file)}
              >
                <Thumbnail file={file} url={urls[file.arquivo]} />
                <span className="block truncate p-1 text-[10px]" title={file.arquivo}>
                  {file.arquivo}
                </span>
              </button>

              <Button
                variant="secondary"
                size="icon-xs"
                // Some no toque até o foco, para não competir com a miniatura
                // num alvo pequeno de celular.
                className="absolute top-1 right-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                aria-label={`Remover ${file.arquivo}`}
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
        url={viewing ? (urls[viewing.arquivo] ?? null) : null}
        onOpen={async (anexo) => {
          // O que não é imagem só desce quando alguém abre: baixar todo PDF da
          // mesa na montagem da aba gastaria banda e memória por nada.
          const url = await attachmentUrl(codigo, anexo.arquivo);
          setUrls((atual) => ({ ...atual, [anexo.arquivo]: url }));
        }}
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
  const kind = attachmentKind(file.arquivo, file.mimeType);

  if (kind === "image" && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={file.arquivo} className="aspect-square w-full bg-black object-cover" />
    );
  }

  const Icon = kind === "image" ? FileText : KIND_ICON[kind];

  return (
    <span className="bg-muted grid aspect-square w-full place-items-center">
      <Icon className="text-muted-foreground size-6" aria-hidden />
    </span>
  );
}
