"use client";

import { create } from "zustand";

import { semIdDaForma } from "@/types/scene";
import type { CanvasItem, Forma, ItemDraft, Texto } from "@/types/scene";

type ClipboardStore = {
  /** Rascunhos sem `id`/`z`: colar sempre cria itens novos, nunca ressuscita. */
  drafts: ItemDraft[];
  /**
   * Os textos soltos copiados, sem id. AO LADO dos itens e não no lugar deles:
   * a área do quadro marca frase e imagem no mesmo laço, e um Ctrl+C que
   * escolhesse um dos dois perderia metade do que estava na mão.
   *
   * Cada Ctrl+C substitui as duas listas, como uma área de transferência de
   * verdade -- o último é o que vale.
   */
  textos: Omit<Texto, "id">[];
  /** E as formas do quadro, pela mesma razão: a seleção mistura as três. */
  formas: Omit<Forma, "id">[];
  copy: (items: CanvasItem[], textos?: Texto[], formas?: Forma[]) => void;
};

/**
 * Área de transferência interna. Não usa a do sistema de propósito: ler o
 * clipboard do browser exige permissão e handshake assíncrono, e o que
 * copiamos aqui (posição, rotação, referência a asset) não faz sentido fora
 * do app.
 */
export const useClipboardStore = create<ClipboardStore>((set) => ({
  drafts: [],
  textos: [],
  formas: [],

  copy(items, textos = [], formas = []) {
    set({
      formas: formas.map(semIdDaForma),
      // Campo a campo como os itens: fica de fora o id -- a cópia ganha o dela
      // -- e a caixa medida, que é do render e não do conteúdo.
      textos: textos.map(({ x, y, texto, tamanho, rotation, naMesa }) => ({
        x,
        y,
        texto,
        tamanho,
        rotation,
        // Como na forma: a decisão de mostrar acompanha a cópia.
        naMesa,
      })),
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
