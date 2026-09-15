"use client";

import { create } from "zustand";

/**
 * O token no ar: o que a lista de personagens já soltou da mão e o mapa ainda
 * não recebeu.
 *
 * ## Por que não é o arrasto do navegador
 *
 * O token da lista ia ao mapa por HTML5 drag-and-drop, como o acervo e o
 * inventário ainda vão. Esse arrasto não serve aqui por duas razões, e as duas
 * são justamente o que esta tela precisa mostrar:
 *
 * - durante um arrasto nativo o conteúdo do `dataTransfer` é ilegível por
 *   segurança, e o palco só sabe QUE tipo vem, não qual imagem — não dá para
 *   desenhar a prévia do que está chegando;
 * - o navegador entra num laço de arrasto do sistema e engole a roda e o
 *   teclado. Só o `Escape` sobrevive. Sem a roda não há como escolher o tamanho
 *   no ar.
 *
 * Então o gesto é próprio, por `pointer capture` — ver `useTokenDrag`. O que
 * este store carrega é o meio do gesto, e ele morre quando o ponteiro solta:
 * guardado dentro da cena, cada quadro do arrasto marcaria a cena como alterada
 * e a gravaria no disco. Mesma decisão do `useDockDragStore`.
 */
export type ArrastoDeToken = {
  personagemId: string;
  /** A miniatura do personagem, que já é arquivo do acervo. */
  assetId: string;
  /** O tamanho com que o token nasceria sem a roda, em unidades de cena. */
  largura: number;
  altura: number;
  /** O que a roda fez com esse tamanho. 1 é o tamanho de nascença. */
  fator: number;
  /** Onde está o ponteiro, em pixels da janela. */
  x: number;
  y: number;
  /**
   * O ponteiro está sobre o plano da cena AGORA.
   *
   * Some quando o cursor passa por cima de uma janela da bancada, que fica
   * sobre o palco: ali a prévia estaria escondida atrás da janela, e soltar
   * cravaria um token num lugar que o mestre não viu.
   */
  noPalco: boolean;
};

type TokenDragStore = {
  arrasto: ArrastoDeToken | null;
  /**
   * Como o palco põe o token no mapa.
   *
   * Uma função guardada no store, e não a lista chamando `addItem` direto,
   * porque transformar o ponto do ponteiro em coordenada de cena precisa da
   * escala e do deslocamento do palco — que vivem num contexto dentro do
   * `SceneStage`, onde a lista de personagens não está e nem deveria estar.
   *
   * Quem registra é `TokenFantasma`, que é o único componente desta feature que
   * mora lá dentro.
   */
  soltarNoPalco: ((arrasto: ArrastoDeToken) => void) | null;

  /** Levanta o token. Chamado quando o gesto passa do limiar de clique. */
  pegar: (arrasto: ArrastoDeToken) => void;
  mover: (x: number, y: number, noPalco: boolean) => void;
  /** A roda: `passo` maior que 1 cresce, menor encolhe. */
  ajustar: (passo: number) => void;
  largar: () => void;
  registrarPalco: (soltar: TokenDragStore["soltarNoPalco"]) => void;
};

/**
 * De quanto a roda mexe no tamanho, por entalhe.
 *
 * Menor que o passo do zoom do palco (1,15): ali a roda enquadra o mapa e
 * errar meia volta se conserta com a volta seguinte; aqui ela escolhe o tamanho
 * com que o token vai ficar, e o mestre está mirando um quadrado da grade.
 */
export const PASSO_DA_RODA = 1.1;

/**
 * Até onde a roda vai.
 *
 * Um quarto e quatro vezes, e não livre, porque o gesto não tem trilho de volta:
 * quem passa de vinte entalhes para um lado precisa de vinte para o outro para
 * achar o tamanho de novo. Nos extremos o que sobra é apagar e pôr de novo, e
 * fora dessa faixa o token ou some sob a grade ou cobre o mapa inteiro — dois
 * tamanhos que ninguém escolhe de propósito.
 */
const FATOR_MIN = 0.25;
const FATOR_MAX = 4;

/** O tamanho que o token terá se for solto agora, em unidades de cena. */
export function tamanhoDoArrasto(arrasto: ArrastoDeToken): {
  largura: number;
  altura: number;
} {
  return {
    largura: Math.round(arrasto.largura * arrasto.fator),
    altura: Math.round(arrasto.altura * arrasto.fator),
  };
}

export const useTokenDragStore = create<TokenDragStore>((set) => ({
  arrasto: null,
  soltarNoPalco: null,

  pegar(arrasto) {
    set({ arrasto });
  },

  mover(x, y, noPalco) {
    set((state) =>
      state.arrasto ? { arrasto: { ...state.arrasto, x, y, noPalco } } : state,
    );
  },

  ajustar(passo) {
    set((state) => {
      if (!state.arrasto) return state;

      const fator = Math.min(
        FATOR_MAX,
        Math.max(FATOR_MIN, state.arrasto.fator * passo),
      );

      // Identidade preservada no batente: sem isto, rodar contra o limite
      // redesenharia a prévia a cada entalhe para não mudar nada.
      if (fator === state.arrasto.fator) return state;

      return { arrasto: { ...state.arrasto, fator } };
    });
  },

  largar() {
    set({ arrasto: null });
  },

  /**
   * O palco não desmonta enquanto o mestre trabalha, mas desmonta ao trocar de
   * campanha — e um `soltar` velho apontaria para a cena de antes.
   */
  registrarPalco(soltar) {
    set({ soltarNoPalco: soltar });
  },
}));
