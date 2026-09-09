"use client";

import { useEffect } from "react";

import { AttachmentBody } from "@/components/attachments/attachment-body";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Attachment } from "@/lib/player/session";

type AttachmentViewerProps = {
  attachment: Attachment | null;
  /** Endereço exibível. `null` enquanto ainda não foi baixado. */
  url: string | null;
  /**
   * Pedido para resolver o endereço deste anexo.
   *
   * Existe porque a rota do anexo exige a credencial do jogador, e por isso o
   * arquivo tem de ser baixado para uma blob URL antes de aparecer. Só as
   * imagens são resolvidas na montagem da aba; o resto -- um PDF de 40 MB --
   * espera alguém abrir, e é este gancho que dispara isso.
   */
  onOpen?: (attachment: Attachment) => void | Promise<void>;
  onClose: () => void;
};

/**
 * Vê o anexo dentro do app, sem jogar o usuário para outra aba.
 *
 * Cada tipo tem o elemento nativo que o browser já sabe renderizar. O que
 * sobra cai num botão de download — melhor oferecer isso claramente do que
 * abrir um visualizador vazio.
 */
export function AttachmentViewer({ attachment, url, onOpen, onClose }: AttachmentViewerProps) {
  useEffect(() => {
    if (!attachment || url || !onOpen) return;

    void onOpen(attachment);
  }, [attachment, url, onOpen]);

  return (
    <Dialog open={Boolean(attachment)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] gap-3 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6 text-sm">{attachment?.arquivo}</DialogTitle>
        </DialogHeader>

        {attachment ? <AttachmentBody attachment={attachment} url={url} /> : null}
      </DialogContent>
    </Dialog>
  );
}
