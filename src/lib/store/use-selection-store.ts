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
  /**
   * Postits laçados pela área.
   *
   * Papel, cartão e risco entraram juntos, e juntos formam o grupo que só
   * ANDA: nenhum deles escala nem gira pelo gizmo -- o papel e o cartão medem
   * o texto por dentro em unidades de cena, e o risco é uma nuvem de pontos
   * sem caixa gravada. Enquanto um deles está na mão, o gizmo de alças sai do
   * ar e sobra a caixa do grupo, que arrasta. Ver `grupo-sem-alca`.
   *
   * Coexistem com as três do palco pela mesma razão que elas coexistem entre
   * si: o laço pega o que encostar, e um quadro tem postit ao lado de frase ao
   * lado de imagem. Uma seleção que pulasse o papel deixaria o gesto pela
   * metade justo onde ele mais serve.
   */
  selectedPostitIds: string[];
  /** Cartões de nota laçados. Irmãos do postit, mesma caixa e mesmo limite. */
  selectedDocumentoIds: string[];
  /** Riscos do lápis laçados. A caixa é a dos pontos; ver `caixaDoTraco`. */
  selectedTracoIds: string[];
  /** Área escondida selecionada. Uma por vez — são poucas e não formam grupo. */
  selectedFogId: string | null;
  /**
   * Retratos selecionados.
   *
   * Lista, e não um só: redimensionar o elenco inteiro na mesma proporção é o
   * gesto que mantém os rostos coerentes entre si, e ele exige grupo.
   */
  selectedPortraitIds: string[];
  /** Regua selecionado. Um por vez, como a área escondida. */
  selectedMedidorId: string | null;
  /**
   * Parede selecionada. Uma por vez, como a área escondida e o medidor: elas
   * não formam grupo, e o que se faz com uma parede -- mover uma ponta, apagar
   * -- é gesto de uma só.
   */
  selectedParedeId: string | null;

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
  /** Substitui a seleção inteira pelos postits indicados. Clique num papel. */
  selectPostits: (postitIds: string[]) => void;
  /** Soma ou tira um postit, sem largar o resto. Shift+clique num papel. */
  togglePostit: (postitId: string) => void;
  /** O mesmo para o cartão de nota, que tem a faixa de arrasto do papel. */
  selectDocumentos: (documentoIds: string[]) => void;
  toggleDocumento: (documentoId: string) => void;
  /**
   * As seis do palco de uma vez -- o que a área de seleção laçou. Lista
   * ausente é lista vazia: `selectMisto({ textos })` larga imagens, formas,
   * papéis, cartões e riscos.
   */
  selectMisto: (selecao: {
    itens?: string[];
    textos?: string[];
    formas?: string[];
    postits?: string[];
    documentos?: string[];
    tracos?: string[];
  }) => void;
  selectFog: (fogId: string | null) => void;
  /** `null` limpa. */
  selectMedidor: (medidorId: string | null) => void;
  /** `null` limpa. */
  selectParede: (paredeId: string | null) => void;
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
 * e com as SEIS do palco — imagem, texto solto, forma, postit, cartão de nota e
 * risco —, porque cada uma usa o mesmo gizmo na tela. As seis do palco são a
 * exceção, e andam juntas: ver `selectedTextoIds` e `selectedPostitIds`.
 *
 * Entre as seis há uma divisão que o gizmo respeita: imagem, texto e forma
 * escalam e giram; postit, cartão e risco só ANDAM. Ver `grupo-sem-alca`.
 *
 * Gesto que SUBSTITUI limpa o resto (`select`, `selectTextos`, `selectFormas`,
 * `selectPostits`, `selectDocumentos`); gesto ADITIVO preserva o que já estava
 * do outro lado (`toggle`, `toggleTexto`, `toggleForma`, `togglePostit`,
 * `toggleDocumento`) — é o que faz Shift+clique somar uma imagem a um punhado
 * de frases já marcadas.
 *
 * O risco não tem gesto próprio: ele não ouve o ponteiro (a camada dele é um
 * SVG atravessável, compartilhado com a mesa), então entra pela área e sai
 * pela área. Quem o arrasta é a pega da margem.
 */
export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selectedIds: [],
  selectedTextoIds: [],
  selectedFormaIds: [],
  selectedPostitIds: [],
  selectedDocumentoIds: [],
  selectedTracoIds: [],
  selectedFogId: null,
  selectedPortraitIds: [],
  selectedMedidorId: null,
  selectedParedeId: null,

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
      selectedParedeId: null,
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
      selectedParedeId: null,
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
      selectedParedeId: null,
    });
  },

  selectPostits(postitIds) {
    get().selectMisto({ postits: postitIds });
  },

  togglePostit(postitId) {
    const { selectedPostitIds } = get();

    set({
      selectedPostitIds: selectedPostitIds.includes(postitId)
        ? selectedPostitIds.filter((id) => id !== postitId)
        : [...selectedPostitIds, postitId],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: null,
      selectedParedeId: null,
    });
  },

  selectDocumentos(documentoIds) {
    get().selectMisto({ documentos: documentoIds });
  },

  toggleDocumento(documentoId) {
    const { selectedDocumentoIds } = get();

    set({
      selectedDocumentoIds: selectedDocumentoIds.includes(documentoId)
        ? selectedDocumentoIds.filter((id) => id !== documentoId)
        : [...selectedDocumentoIds, documentoId],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: null,
      selectedParedeId: null,
    });
  },

  selectMisto({
    itens = [],
    textos = [],
    formas = [],
    postits = [],
    documentos = [],
    tracos = [],
  }) {
    set({
      selectedIds: itens,
      selectedTextoIds: textos,
      selectedFormaIds: formas,
      selectedPostitIds: postits,
      selectedDocumentoIds: documentos,
      selectedTracoIds: tracos,
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: null,
      selectedParedeId: null,
    });
  },

  selectFog(fogId) {
    set({
      selectedIds: [],
      selectedTextoIds: [],
      selectedFormaIds: [],
      selectedPostitIds: [],
      selectedDocumentoIds: [],
      selectedTracoIds: [],
      selectedFogId: fogId,
      selectedPortraitIds: [],
      selectedMedidorId: null,
      selectedParedeId: null,
    });
  },

  selectMedidor(medidorId) {
    set({
      selectedIds: [],
      selectedTextoIds: [],
      selectedFormaIds: [],
      selectedPostitIds: [],
      selectedDocumentoIds: [],
      selectedTracoIds: [],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: medidorId,
    });
  },

  selectParede(paredeId) {
    set({
      selectedIds: [],
      selectedTextoIds: [],
      selectedFormaIds: [],
      selectedPostitIds: [],
      selectedDocumentoIds: [],
      selectedTracoIds: [],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: null,
      selectedParedeId: paredeId,
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
      selectedPostitIds: [],
      selectedDocumentoIds: [],
      selectedTracoIds: [],
      selectedFogId: null,
      selectedPortraitIds: portraitIds,
      selectedMedidorId: null,
      selectedParedeId: null,
    });
  },

  togglePortrait(portraitId) {
    const { selectedPortraitIds } = get();

    set({
      selectedIds: [],
      selectedTextoIds: [],
      selectedFormaIds: [],
      selectedPostitIds: [],
      selectedDocumentoIds: [],
      selectedTracoIds: [],
      selectedFogId: null,
      selectedPortraitIds: selectedPortraitIds.includes(portraitId)
        ? selectedPortraitIds.filter((id) => id !== portraitId)
        : [...selectedPortraitIds, portraitId],
      selectedMedidorId: null,
      selectedParedeId: null,
    });
  },

  clear() {
    const {
      selectedIds,
      selectedTextoIds,
      selectedFormaIds,
      selectedPostitIds,
      selectedDocumentoIds,
      selectedTracoIds,
      selectedFogId,
      selectedPortraitIds,
      selectedMedidorId,
      selectedParedeId,
    } = get();
    if (
      selectedIds.length === 0 &&
      selectedTextoIds.length === 0 &&
      selectedFormaIds.length === 0 &&
      selectedPostitIds.length === 0 &&
      selectedDocumentoIds.length === 0 &&
      selectedTracoIds.length === 0 &&
      selectedFogId === null &&
      selectedPortraitIds.length === 0 &&
      selectedMedidorId === null &&
      selectedParedeId === null
    ) {
      return;
    }

    set({
      selectedIds: [],
      selectedTextoIds: [],
      selectedFormaIds: [],
      selectedPostitIds: [],
      selectedDocumentoIds: [],
      selectedTracoIds: [],
      selectedFogId: null,
      selectedPortraitIds: [],
      selectedMedidorId: null,
      selectedParedeId: null,
    });
  },
}));
