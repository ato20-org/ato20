"use client";

import { create } from "zustand";

import type { PontaDeLigacao, Vec2 } from "@/types/scene";

/** Abaixo do postit (8 500) e acima das imagens: letra na folha, sob o papel. */
export const TEXTO_Z = 8_000;
/** A seta passa por cima de tudo o que amarra, inclusive o postit. */
export const LIGACAO_Z = 8_600;

/**
 * O estado de tela do quadro: que texto está sendo escrito ou selecionado, que
 * seta está selecionada, e de onde a próxima seta sai.
 *
 * Fora da cena porque nada disto é conteúdo: é o que está na mão do mestre
 * agora, e não vai para o disco nem para a mesa. Mesmo desenho de
 * `use-postit-store`.
 */
type QuadroStore = {
  textoEditandoId: string | null;
  textoSelecionadoId: string | null;
  ligacaoSelecionadaId: string | null;
  /**
   * A seta sendo puxada: de onde o arrasto começou e onde o cursor está.
   * `null` fora do gesto. Só a camada desenha; quem escreve é o palco.
   */
  previa: { de: PontaDeLigacao; ate: Vec2 } | null;

  editarTexto: (textoId: string | null) => void;
  selecionarTexto: (textoId: string | null) => void;
  selecionarLigacao: (ligacaoId: string | null) => void;
  setPrevia: (previa: { de: PontaDeLigacao; ate: Vec2 } | null) => void;
  /** Larga tudo: Esc, troca de cena, troca de ferramenta. */
  limpar: () => void;
};

export const useQuadroStore = create<QuadroStore>((set) => ({
  textoEditandoId: null,
  textoSelecionadoId: null,
  ligacaoSelecionadaId: null,
  previa: null,

  editarTexto: (textoEditandoId) =>
    set({ textoEditandoId, textoSelecionadoId: textoEditandoId, ligacaoSelecionadaId: null }),
  selecionarTexto: (textoSelecionadoId) =>
    set({ textoSelecionadoId, ligacaoSelecionadaId: null }),
  selecionarLigacao: (ligacaoSelecionadaId) =>
    set({ ligacaoSelecionadaId, textoSelecionadoId: null }),
  setPrevia: (previa) => set({ previa }),
  limpar: () =>
    set({
      textoEditandoId: null,
      textoSelecionadoId: null,
      ligacaoSelecionadaId: null,
      previa: null,
    }),
}));
