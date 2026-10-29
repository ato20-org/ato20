"use client";

import { create } from "zustand";

/**
 * Quanto a marca dura depois da última amostra.
 *
 * As amostras chegam a cada 100ms enquanto o dedo arrasta. Um pouco mais de um
 * segundo cobre o celular engasgando no Wi-Fi sem a etiqueta piscar, e ainda
 * some logo depois que ele solta.
 */
const FOLGA_MS = 1200;

/** Quem está com o token na mão, e em qual cena. */
export type Pegada = { jogadorId: string; sceneId: string };

/** A soltura agendada de cada token, fora do estado. Ver `marcar`. */
const soltura = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Os tokens que um jogador está arrastando agora pelo celular, por id do item.
 *
 * Só do Mestre: quem preenche é o `useMovimentosDaMesa`, a cada amostra que
 * ele aceita, e quem desenha é o `QuemMove`, no palco.
 *
 * O estado muda só na pegada e na soltura, e não a cada amostra: renovar a
 * folga é trocar o temporizador, que mora fora do store. Sem isso o palco
 * redesenharia dez vezes por segundo por causa de uma etiqueta que não mudou.
 */
export const useQuemMoveStore = create<{
  pegadas: Record<string, Pegada>;
  marcar: (itemId: string, pegada: Pegada) => void;
}>((set, get) => ({
  pegadas: {},
  marcar: (itemId, pegada) => {
    clearTimeout(soltura.get(itemId));
    soltura.set(
      itemId,
      setTimeout(() => {
        soltura.delete(itemId);
        set((state) => {
          const pegadas = { ...state.pegadas };
          delete pegadas[itemId];
          return { pegadas };
        });
      }, FOLGA_MS),
    );

    const atual = get().pegadas[itemId];
    if (atual?.jogadorId === pegada.jogadorId && atual.sceneId === pegada.sceneId) {
      return;
    }

    set((state) => ({ pegadas: { ...state.pegadas, [itemId]: pegada } }));
  },
}));
