"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileQuestion, Loader2 } from "lucide-react";

import { ImageZoom } from "@/components/attachments/image-zoom";
import { Button } from "@/components/ui/button";
import { attachmentKind } from "@/lib/attachments/kind";
import type { Attachment } from "@/lib/player/session";

/**
 * O anexo renderizado, sem moldura nenhuma.
 *
 * Separado do `AttachmentViewer` porque agora há duas molduras: o diálogo
 * modal, que é o que serve o celular e a ficha do jogador, e a janela interna
 * do mestre, que fica na tela enquanto ele mexe no mapa. O que os dois mostram
 * é igual — cada tipo no elemento que o navegador já sabe renderizar, e o que
 * sobra num botão de baixar.
 */
export function AttachmentBody({ attachment, url }: { attachment: Attachment; url: string | null }) {
  const kind = attachmentKind(attachment.arquivo, attachment.mimeType);

  if (!url) {
    return (
      <div className="grid h-40 place-items-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" aria-label="Carregando" />
      </div>
    );
  }

  if (kind === "image") {
    // `key` na URL: trocar de anexo remonta e o zoom volta ao encaixe.
    // Herdar a ampliação do arquivo anterior mostraria o novo cortado num
    // canto qualquer.
    return <ImageZoom key={url} src={url} alt={attachment.arquivo} />;
  }

  if (kind === "pdf") {
    return (
      <div className="space-y-2">
        <iframe src={url} title={attachment.arquivo} className="h-[70dvh] w-full rounded-md border" />
        {/* iOS Safari costuma recusar PDF em iframe. Em vez de detectar
            navegador, deixo a saída sempre visível. */}
        <ExternalButton url={url} label="Abrir o PDF no navegador" />
      </div>
    );
  }

  if (kind === "audio") {
    return <audio src={url} controls className="w-full" />;
  }

  if (kind === "video") {
    return <video src={url} controls className="max-h-[70dvh] w-full rounded-md bg-black" />;
  }

  if (kind === "text") {
    return <TextBody url={url} name={attachment.arquivo} />;
  }

  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <FileQuestion className="text-muted-foreground size-8" aria-hidden />
      <p className="text-muted-foreground text-sm">
        Este tipo de arquivo não pode ser exibido aqui.
      </p>
      <Button
        render={<a href={url} download={attachment.arquivo} />}
        nativeButton={false}
        variant="outline"
        size="sm"
      >
        <Download />
        Baixar
      </Button>
    </div>
  );
}

function ExternalButton({ url, label }: { url: string; label: string }) {
  return (
    <Button
      render={<a href={url} target="_blank" rel="noopener" />}
      nativeButton={false}
      variant="ghost"
      size="sm"
      className="w-full"
    >
      <ExternalLink />
      {label}
    </Button>
  );
}

function TextBody({ url, name }: { url: string; name: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    void fetch(url)
      .then((response) => response.text())
      .then(
        (text) => {
          // Um arquivo grande travaria a aba ao renderizar como texto puro.
          if (active) setContent(text.slice(0, 200_000));
        },
        () => {
          if (active) setFailed(true);
        },
      );

    return () => {
      active = false;
    };
  }, [url]);

  if (failed) {
    return <ExternalButton url={url} label={`Abrir ${name} no navegador`} />;
  }

  if (content === null) {
    return (
      <div className="grid h-40 place-items-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" aria-label="Carregando" />
      </div>
    );
  }

  return (
    <pre className="max-h-[70dvh] overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
      {content}
    </pre>
  );
}
