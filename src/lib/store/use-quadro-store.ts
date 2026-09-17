"use client";

import { create } from "zustand";

import { useSelectionStore } from "@/lib/store/use-selection-store";
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

/**
 * Selecionar um item do palco larga o texto e a seta: as duas seleções não
 * coexistem, e é isso que deixa Ctrl+C e Delete decidirem pelo que está na
 * mão sem perguntar. O caminho inverso já é feito por quem seleciona texto e
 * seta, que limpa a seleção de itens ao ser clicado.
 */
useSelectionStore.subscribe((state, previous) => {
  if (state.selectedIds === previous.selectedIds || state.selectedIds.length === 0)
    return;
  const quadro = useQuadroStore.getState();
  if (quadro.textoSelecionadoId || quadro.ligacaoSelecionadaId)
    useQuadroStore.setState({ textoSelecionadoId: null, ligacaoSelecionadaId: null });
});
