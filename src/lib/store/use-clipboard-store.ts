"use client";

import { create } from "zustand";

import type { CanvasItem, ItemDraft, Texto } from "@/types/scene";

type ClipboardStore = {
  /** Rascunhos sem `id`/`z`: colar sempre cria itens novos, nunca ressuscita. */
  drafts: ItemDraft[];
  /**
   * Um texto solto copiado, sem id. Exclusivo com `drafts`: copiar um texto
   * esvazia os itens e vice-versa, como uma área de transferência de verdade
   * -- o último Ctrl+C é o que vale.
   */
  texto: Omit<Texto, "id"> | null;
  copy: (items: CanvasItem[]) => void;
  copyTexto: (texto: Texto) => void;
};

/**
 * Área de transferência interna. Não usa a do sistema de propósito: ler o
 * clipboard do browser exige permissão e handshake assíncrono, e o que
 * copiamos aqui (posição, rotação, referência a asset) não faz sentido fora
 * do app.
 */
export const useClipboardStore = create<ClipboardStore>((set) => ({
  drafts: [],
  texto: null,

  copyTexto(texto) {
    // Sem id -- a cópia ganha o dela -- e sem a caixa medida, que é do render.
    const copia = { ...texto } as Partial<Texto>;
    delete copia.id;
    delete copia.largura;
    delete copia.altura;
    set({ drafts: [], texto: copia as Omit<Texto, "id"> });
  },

  copy(items) {
    set({
      texto: null,
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
