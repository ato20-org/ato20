"use client";

import { create } from "zustand";

import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import type { PontaDeLigacao } from "@/types/scene";

/**
 * Abaixo do texto e acima das imagens: a forma é o que CERCA, e cercar por
 * cima da letra taparia o que ela aponta.
 */
export const FORMA_Z = 7_800;
/** Abaixo do postit (8 500) e acima das imagens: letra na folha, sob o papel. */
export const TEXTO_Z = 8_000;
/** A seta passa por cima de tudo o que amarra, inclusive o postit. */
export const LIGACAO_Z = 8_600;

/**
 * O estado de tela do quadro: que texto está sendo escrito, que seta está
 * selecionada, e de onde a próxima seta sai.
 *
 * Fora da cena porque nada disto é conteúdo: é o que está na mão do mestre
 * agora, e não vai para o disco nem para a mesa. Mesmo desenho de
 * `use-postit-store`.
 *
 * Quem está SELECIONADO não mora mais aqui: o texto solto virou seleção de
 * palco, ao lado da de itens, para a área poder laçar frase e imagem no mesmo
 * gesto. Ver `selectedTextoIds` em `use-selection-store`.
 */
type QuadroStore = {
  textoEditandoId: string | null;
  ligacaoSelecionadaId: string | null;
  /**
   * A seta em curso: a ponta que já foi decidida, de onde ela sai. `null` fora
   * do gesto.
   *
   * O gesto tem duas formas, e este campo é o que as une. Arrastar de um ponto
   * até outro faz a seta de uma vez, como antes; CLICAR num ponto e soltar
   * deixa a seta pendurada no cursor até o clique seguinte -- que é o gesto
   * que se pede a um quadro, onde a segunda ponta costuma estar do outro lado
   * da folha, longe demais para um arrasto caber na mesa.
   *
   * Onde o cursor está NÃO mora aqui, e isto é deliberado: a ponta solta segue
   * o ponteiro, e guardá-la em estado redesenharia o quadro inteiro a cada
   * milímetro de mouse. Quem a desenha escreve direto no `<line>`, como o
   * fantasma do postit escreve no `style`. Ver `AncorasDeSeta`.
   */
  setaEmCurso: { de: PontaDeLigacao } | null;

  editarTexto: (textoId: string | null) => void;
  selecionarLigacao: (ligacaoId: string | null) => void;
  /** Começa a seta: daqui em diante ela segue o cursor. */
  comecarSeta: (de: PontaDeLigacao) => void;
  /** Larga a seta em curso sem criar nada: Esc, ou o gesto que não vingou. */
  largarSeta: () => void;
  /** Larga tudo: Esc, troca de cena, troca de ferramenta. */
  limpar: () => void;
};

export const useQuadroStore = create<QuadroStore>((set) => ({
  textoEditandoId: null,
  ligacaoSelecionadaId: null,
  setaEmCurso: null,

  editarTexto: (textoEditandoId) => {
    // Escrever num texto é tê-lo na mão: a seleção acompanha a edição, e é ela
    // que põe o gizmo em volta quando o campo fecha.
    if (textoEditandoId)
      useSelectionStore.getState().selectTextos([textoEditandoId]);
    set({ textoEditandoId, ligacaoSelecionadaId: null });
  },
  selecionarLigacao: (ligacaoSelecionadaId) => {
    // Seta e palco não coexistem: as duas usariam a mesma tecla Delete, e o
    // mestre não teria como dizer de qual estava falando.
    if (ligacaoSelecionadaId) useSelectionStore.getState().clear();
    set({ ligacaoSelecionadaId });
  },
  comecarSeta: (de) => set({ setaEmCurso: { de } }),
  largarSeta: () => set({ setaEmCurso: null }),
  limpar: () =>
    set({
      textoEditandoId: null,
      ligacaoSelecionadaId: null,
      setaEmCurso: null,
    }),
}));

/**
 * Selecionar no palco larga a seta: as duas seleções não coexistem, e é isso
 * que deixa Ctrl+C e Delete decidirem pelo que está na mão sem perguntar. O
 * caminho inverso é `selecionarLigacao`, que limpa o palco ao ser chamada.
 *
 * Limpar o palco não conta — aí não há nada de novo na mão, e a seta clicada
 * seria desfeita pelo `clear` do próprio `selecionarLigacao`.
 */
useSelectionStore.subscribe((state, previous) => {
  if (
    state.selectedIds === previous.selectedIds &&
    state.selectedTextoIds === previous.selectedTextoIds &&
    state.selectedFormaIds === previous.selectedFormaIds
  )
    return;
  if (
    state.selectedIds.length === 0 &&
    state.selectedTextoIds.length === 0 &&
    state.selectedFormaIds.length === 0
  )
    return;
  if (useQuadroStore.getState().ligacaoSelecionadaId)
    useQuadroStore.setState({ ligacaoSelecionadaId: null });
});

/**
 * Largar a ferramenta larga a seta pendurada.
 *
 * Ela só existe enquanto a seta está na mão: quem a desenha é a camada das
 * âncoras, que sai do ar junto com a ferramenta. Sem isto o estado sobreviveria
 * INVISÍVEL -- o mestre escolheria a seta de novo cinco minutos depois e o
 * primeiro clique fecharia uma seta que ele já tinha esquecido, saindo de um
 * postit do outro lado do quadro.
 */
useToolStore.subscribe((state, previous) => {
  if (state.tool === previous.tool || state.tool === "ligacao") return;
  if (useQuadroStore.getState().setaEmCurso)
    useQuadroStore.setState({ setaEmCurso: null });
});
