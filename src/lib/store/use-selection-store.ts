"use client";

import { create } from "zustand";

type SelectionStore = {
  /** Ids de itens selecionados no Mestre. Ordem não importa. */
  selectedIds: string[];
  /**
   * Textos soltos do quadro selecionados.
   *
   * Aqui e não no `use-quadro-store`, onde nasceu como um só: a área de
   * seleção pega o que encostar, e um laço em volta de três frases e duas
   * imagens tem de levar as cinco coisas. É a única seleção que COEXISTE com a
   * de itens — as outras continuam exclusivas, porque cada uma traz o próprio
   * gizmo e dois conjuntos de alças disputariam o mesmo clique.
   *
   * Item e texto dividem o mesmo gizmo de grupo, e é por isso que podem andar
   * juntos: arrastar um move o conjunto, e as alças escalam os dois pelo mesmo
   * fator. Ver `grupo-de-textos`.
   */
  selectedTextoIds: string[];
  /**
   * Formas geométricas do quadro selecionadas.
   *
   * Ao lado das outras duas do palco, e pela mesma razão: a área laça o que
   * encostar, e um retângulo desenhado em volta de três postits é justamente o
   * que se quer pegar junto com eles. A forma tem a geometria do item, então
   * divide com ele o gizmo, o arrasto e as contas de grupo -- o que muda é a
   * lista da cena em que ela mora. Ver `Forma`.
   */
  selectedFormaIds: string[];
  /** Área escondida selecionada. Uma por vez — são poucas e não formam grupo. */
  selectedFogId: string | null;
  /**
   * Retratos selecionados.
   *
   * Lista, e não um só: redimensionar o elenco inteiro na mesma proporção é o
   * gesto que mantém os rostos coerentes entre si, e ele exige grupo.
   */
  selectedPortraitIds: string[];
  /** Medidor selecionado. Um por vez, como a área escondida. */
  selectedMedidorId: string | null;

  select: (itemIds: string[]) => void;
  toggle: (itemId: string) => void;
  /** Substitui a seleção inteira pelos textos indicados. Clique num texto. */
  selectTextos: (textoIds: string[]) => void;
  /** Soma ou tira um texto, sem largar o resto. Shift+clique num texto. */
  toggleTexto: (textoId: string) => void;
  /** Substitui a seleção inteira pelas formas indicadas. Clique numa forma. */
  selectFormas: (formaIds: string[]) => void;
  /** Soma ou tira uma forma, sem largar o resto. Shift+clique numa forma. */
  toggleForma: (formaId: string) => void;
  /**
   * As três do palco de uma vez -- o que a área de seleção laçou. Lista
   * ausente é lista vazia: `selectMisto({ textos })` larga imagens e formas.
   */
  selectMisto: (selecao: {
    itens?: string[];
    textos?: string[];
    formas?: string[];
  }) => void;
  selectFog: (fogId: string | null) => void;
  /** `null` limpa. */
  selectMedidor: (medidorId: string | null) => void;
  /** `null` limpa. Substitui a seleção de retratos inteira. */
  selectPortrait: (portraitId: string | null) => void;
  selectPortraits: (portraitIds: string[]) => void;
  togglePortrait: (portraitId: string) => void;
  clear: () => void;
};

/**
 * Seleção é estado de UI do Mestre: não é persistida no board e não viaja
 * no canal. O Jogador e o Espectador nunca sabem o que o mestre tem selecionado.
 *
 * Área escondida, retrato e medidor são seleções mutuamente exclusivas entre si
 * e com as três do palco — imagem, texto solto e forma —, porque cada uma usa o
 * mesmo gizmo na tela. As três do palco são a exceção, e andam juntas: ver
 * `selectedTextoIds` e `selectedFormaIds`.
 *
 * Gesto que SUBSTITUI limpa o resto (`select`, `selectTextos`, `selectFormas`);
 * gesto ADITIVO preserva o que já estava do outro lado (`toggle`,
 * `toggleTexto`, `toggleForma`) — é o que faz Shift+clique somar uma imagem a
 * um punhado de frases já marcadas.
 */
export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selectedIds: [],
  selectedTextoIds: [],
  selectedFormaIds: [],
  selectedFogId: null,
  selectedPortraitIds: [],
  selectedMedidorId: null,

  select(itemIds) {
    get().selectMisto({ itens: itemIds });
  },

  toggle(itemId) {
    const { selectedIds } = get();

    set({
      selectedIds: selectedIds.includes(itemId)
        ? selectedIds.filter((id) => id !== itemId)
        : [...selectedIds, itemId],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: null,
    });
  },

  selectTextos(textoIds) {
    get().selectMisto({ textos: textoIds });
  },

  toggleTexto(textoId) {
    const { selectedTextoIds } = get();

    set({
      selectedTextoIds: selectedTextoIds.includes(textoId)
        ? selectedTextoIds.filter((id) => id !== textoId)
        : [...selectedTextoIds, textoId],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: null,
    });
  },

  selectFormas(formaIds) {
    get().selectMisto({ formas: formaIds });
  },

  toggleForma(formaId) {
    const { selectedFormaIds } = get();

    set({
      selectedFormaIds: selectedFormaIds.includes(formaId)
        ? selectedFormaIds.filter((id) => id !== formaId)
        : [...selectedFormaIds, formaId],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: null,
    });
  },

  selectMisto({ itens = [], textos = [], formas = [] }) {
    set({
      selectedIds: itens,
      selectedTextoIds: textos,
      selectedFormaIds: formas,
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: null,
    });
  },

  selectFog(fogId) {
    set({
      selectedIds: [],
      selectedTextoIds: [],
      selectedFormaIds: [],
      selectedFogId: fogId,
      selectedPortraitIds: [],
      selectedMedidorId: null,
    });
  },

  selectMedidor(medidorId) {
    set({
      selectedIds: [],
      selectedTextoIds: [],
      selectedFormaIds: [],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: medidorId,
    });
  },

  selectPortrait(portraitId) {
    get().selectPortraits(portraitId ? [portraitId] : []);
  },

  selectPortraits(portraitIds) {
    set({
      selectedIds: [],
      selectedTextoIds: [],
      selectedFormaIds: [],
      selectedFogId: null,
      selectedPortraitIds: portraitIds,
      selectedMedidorId: null,
    });
  },

  togglePortrait(portraitId) {
    const { selectedPortraitIds } = get();

    set({
      selectedIds: [],
      selectedTextoIds: [],
      selectedFormaIds: [],
      selectedFogId: null,
      selectedPortraitIds: selectedPortraitIds.includes(portraitId)
        ? selectedPortraitIds.filter((id) => id !== portraitId)
        : [...selectedPortraitIds, portraitId],
      selectedMedidorId: null,
    });
  },

  clear() {
    const {
      selectedIds,
      selectedTextoIds,
      selectedFormaIds,
      selectedFogId,
      selectedPortraitIds,
      selectedMedidorId,
    } = get();
    if (
      selectedIds.length === 0 &&
      selectedTextoIds.length === 0 &&
      selectedFormaIds.length === 0 &&
      selectedFogId === null &&
      selectedPortraitIds.length === 0 &&
      selectedMedidorId === null
    ) {
      return;
    }

    set({
      selectedIds: [],
      selectedTextoIds: [],
      selectedFormaIds: [],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: null,
    });
  },
}));
