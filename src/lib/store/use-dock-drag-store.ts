"use client";

import { create } from "zustand";

import type { AlvoDock } from "@/lib/store/use-layout-store";

/** O retângulo que acende, em pixels relativos à camada de janelas. */
export type Retangulo = { left: number; top: number; width: number; height: number };

type DockDragStore = {
  /** Onde a janela vai encostar se soltarem agora. `null` = continua solta. */
  alvo: AlvoDock | null;
  retangulo: Retangulo | null;
  /**
   * A etiqueta que segue o cursor enquanto uma ABA está sendo arrastada.
   *
   * Só a aba precisa disto: quando o gesto sai do cabeçalho de uma janela
   * flutuante, o que segue o cursor é a própria janela. A aba fica parada na
   * tira — sem uma etiqueta, arrastá-la não mexia nada na tela e o gesto
   * parecia não estar funcionando até o dedo soltar.
   *
   * A posição entra aqui uma vez, na largada, e depois é escrita direto no DOM:
   * uma etiqueta que se reposiciona pelo store custaria um render por quadro.
   */
  fantasma: { titulo: string; x: number; y: number } | null;

  mirar: (alvo: AlvoDock | null, retangulo: Retangulo | null) => void;
  /** Levanta a etiqueta. Chamado quando o gesto passa do limiar de clique. */
  pegar: (titulo: string, x: number, y: number) => void;
  limpar: () => void;
};

/**
 * A mira do arrasto: o que está aceso enquanto uma janela procura lugar.
 *
 * Store próprio, e não um campo do layout nem da pilha de janelas, porque isto
 * não é estado de nenhum dos dois — é o meio de um gesto, e morre quando o
 * ponteiro é solto. Guardado junto do layout, cada quadro do arrasto marcaria a
 * bancada como alterada e a gravaria no disco.
 *
 * Só o alvo e o retângulo: quem desenha é a camada, quem aplica é o `atracar`.
 */
export const useDockDragStore = create<DockDragStore>((set) => ({
  alvo: null,
  retangulo: null,
  fantasma: null,

  mirar(alvo, retangulo) {
    set({ alvo, retangulo });
  },

  pegar(titulo, x, y) {
    set({ fantasma: { titulo, x, y } });
  },

  limpar() {
    set({ alvo: null, retangulo: null, fantasma: null });
  },
}));
