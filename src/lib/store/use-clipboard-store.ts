"use client";

import { create } from "zustand";

import type { CanvasItem, ItemDraft } from "@/types/scene";

type ClipboardStore = {
  /** Rascunhos sem `id`/`z`: colar sempre cria itens novos, nunca ressuscita. */
  drafts: ItemDraft[];
  copy: (items: CanvasItem[]) => void;
};

/**
 * Área de transferência interna. Não usa a do sistema de propósito: ler o
 * clipboard do browser exige permissão e handshake assíncrono, e o que
 * copiamos aqui (posição, rotação, referência a asset) não faz sentido fora
 * do app.
 */
export const useClipboardStore = create<ClipboardStore>((set) => ({
  drafts: [],

  copy(items) {
    set({
      drafts: items.map(
        ({ assetId, x, y, width, height, rotation, locked, flipX, flipY, opacity }) => ({
          assetId,
          x,
          y,
          width,
          height,
          rotation,
          locked,
          flipX,
          flipY,
          opacity,
        }),
      ),
    });
  },
}));
