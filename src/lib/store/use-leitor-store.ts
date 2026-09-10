"use client";

import { create } from "zustand";

/** Onde as proporções do split sobrevivem ao fechar o aplicativo. */
const CHAVE_DISCO = "ato20:leitor";

/**
 * Quanto da linha o livro ocupa, no split.
 *
 * Metade por padrão, que é o pedido: o mapa de um lado, o manual do outro. Os
 * limites impedem o gesto de anular qualquer um dos dois — um palco de 8% não
 * é palco, e um livro de 8% não tem coluna de texto legível.
 */
const PADRAO = 0.5;
export const MIN_FRACAO = 0.2;
export const MAX_FRACAO = 0.8;

type LeitorStore = {
  /**
   * O livro no split, ou nenhum.
   *
   * Um por vez, de propósito: o split divide a linha com o PALCO, e um segundo
   * livro ali deixaria o mapa com um terço da tela. Vários livros ao mesmo
   * tempo é o caso das janelas flutuantes, que empilham.
   *
   * Não sobrevive ao fechar o aplicativo, como as janelas: abrir o ATO20 começa
   * com a bancada limpa. A fração sobrevive, porque é arrumação.
   */
  livroId: string | null;
  fracao: number;

  /** Manda o livro para o split. Já lá, não faz nada. */
  abrirNoSplit: (livroId: string) => void;
  /** Tira o livro do split. Quem o quer flutuando abre a janela em seguida. */
  fecharSplit: () => void;
  redimensionar: (fracao: number) => void;
  /** Grava a fração atual no disco da máquina. Chamado no fim do gesto. */
  guardar: () => void;
  restaurar: () => void;
};

function ler(): number {
  try {
    const cru = localStorage.getItem(CHAVE_DISCO);
    if (!cru) return PADRAO;

    const lido: unknown = JSON.parse(cru);
    if (typeof lido !== "object" || lido === null) return PADRAO;

    const fracao = (lido as { fracao?: unknown }).fracao;
    // `localStorage` é entrada não confiável como qualquer outra: a chave pode
    // ter sido escrita por uma versão anterior ou editada à mão, e uma fração
    // inválida deixaria o palco ou o livro com largura zero.
    if (typeof fracao !== "number" || !Number.isFinite(fracao)) return PADRAO;

    return Math.min(Math.max(fracao, MIN_FRACAO), MAX_FRACAO);
  } catch {
    return PADRAO;
  }
}

/**
 * O leitor de Regras dividindo a linha com o palco.
 *
 * Região própria, e não uma coluna do dock: coluna do dock tem teto de 640
 * pixels e serve painel de cena, e manual de RPG é diagramado em duas colunas
 * de texto — abaixo de meia tela ele deixa de ser legível. O dock continua
 * intocado, e o livro também pode virar janela flutuante ou aba dele, para
 * quem quiser: ver `ConteudoJanela`.
 */
export const useLeitorStore = create<LeitorStore>((set, get) => ({
  livroId: null,
  fracao: PADRAO,

  abrirNoSplit(livroId) {
    if (get().livroId === livroId) return;

    set({ livroId });
  },

  fecharSplit() {
    set({ livroId: null });
  },

  redimensionar(fracao) {
    set({ fracao: Math.min(Math.max(fracao, MIN_FRACAO), MAX_FRACAO) });
  },

  guardar() {
    try {
      localStorage.setItem(CHAVE_DISCO, JSON.stringify({ fracao: get().fracao }));
    } catch {
      // Cota cheia ou armazenamento bloqueado: a divisão continua onde está
      // nesta sessão, e só volta ao padrão na próxima. Não vale um aviso.
    }
  },

  restaurar() {
    set({ fracao: ler() });
  },
}));
