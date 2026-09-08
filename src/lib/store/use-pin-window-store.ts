"use client";

import { create } from "zustand";

/** Largura do cartão, em pixels de tela. Constante porque ele não escala. */
export const LARGURA_PX = 320;

/**
 * Onde a linha encosta no cartão, medido do topo dele.
 *
 * Cai na altura do cabeçalho, e é de propósito: a linha aponta para o número e
 * o título do ponto, que é a parte que identifica a nota. Encostando no meio
 * ela apontaria para o meio de um parágrafo.
 */
export const ANCORA_Y_PX = 18;

/**
 * Onde os pontos de anotação entram na escada de empilhamento do palco.
 *
 * O palco já tem uma: item da cena usa o `z` dele (1, 2, 3…), névoa 5000,
 * contorno de seleção 9000, alças de transformação 10000. Nenhum desses cria
 * contexto de empilhamento próprio, então tudo compete no mesmo plano — e uma
 * camada sem `z-index` fica ATRÁS de qualquer item da cena. Foi assim que a
 * primeira versão do laço sumiu: ele passava por baixo de uma imagem do mapa,
 * e só aparecia quando calhava de cruzar área vazia.
 *
 * A ordem escolhida:
 *
 * - o laço acima dos itens e da névoa, porque é a amarra e precisa ser vista,
 *   mas abaixo do que se clica;
 * - o alfinete acima do contorno de seleção e abaixo das alças, porque quando
 *   as duas coisas se sobrepõem quem está no meio de um gesto de
 *   redimensionar quer a alça;
 * - o cartão acima de tudo, inclusive das alças: ele tem campo de texto e
 *   botões, e uma alça por cima dele roubaria o clique.
 */
export const LACO_Z = 8_000;
export const ALFINETE_Z = 9_500;
export const CARTAO_Z = 12_000;

/**
 * Quanto a nota pode se afastar do alfinete, em pixels de tela.
 *
 * O limite é o que sustenta a promessa do laço: achar o alfinete é achar a
 * nota. Sem ele, um arrasto distraído deixaria o cartão a três mil pixels do
 * ponto, fora de qualquer enquadramento, e a única pista de onde ele foi seria
 * a linha saindo da tela.
 */
const ALCANCE_X_PX = 900;
const ALCANCE_Y_PX = 600;

/**
 * Deslocamento inicial: à direita do alfinete, quase na mesma altura.
 *
 * É mais ou menos onde o popover estava quando o botão de fixar foi clicado
 * (`side="right"`, `align="start"`), então o cartão não salta ao ser fixado.
 */
const INICIAL = { dx: 26, dy: -8 };

export type PinNoteWindow = {
  pinId: string;
  /**
   * Deslocamento do canto do cartão em relação ao alfinete, em pixels de TELA.
   *
   * Pixels de tela, e não unidades de cena, é a decisão que define o
   * comportamento: o cartão fica sempre à mesma distância aparente do ponto.
   * Em unidades de cena ele se afastaria ao ampliar o mapa — dar zoom num
   * ponto jogaria a nota dele para fora da vista, que é o contrário do que um
   * laço serve para fazer.
   */
  dx: number;
  dy: number;
};

type PinWindowStore = {
  /**
   * As notas fixas, da mais atrás para a mais à frente.
   *
   * Lista e não mapa: a ordem É o empilhamento, e guardá-la na própria
   * estrutura evita um campo `z` que precisaria ser reordenado na mão a cada
   * clique.
   */
  notas: PinNoteWindow[];

  /** Fixa a nota no mapa. Já fixada, só vem para a frente. */
  fixar: (pinId: string) => void;
  mover: (pinId: string, dx: number, dy: number) => void;
  trazerPraFrente: (pinId: string) => void;
  fechar: (pinId: string) => void;
};

/**
 * As notas que o mestre deixou abertas sobre o mapa.
 *
 * O `Popover` do alfinete serve a olhada rápida: abre, lê, fecha ao clicar
 * fora. Não serve o caso de conduzir a cena com a nota à vista, porque
 * qualquer clique no mapa — mover um token, revelar uma área — a fecharia. Daí
 * a nota fixa: ela sai do ciclo de dispensa e fica onde foi posta.
 *
 * Guarda um deslocamento, não uma posição: a nota é amarrada ao alfinete e
 * viaja com ele quando o mapa desloca ou amplia. Uma posição absoluta na tela
 * ficaria parada enquanto o mapa corre por baixo, e a linha que liga os dois
 * viraria uma diagonal atravessando a janela.
 *
 * Estado de máquina, não de campanha: não é gravado no vault e não viaja. É
 * bancada de trabalho, e restaurar notas de uma sessão passada só cobriria o
 * mapa de cartões que ninguém pediu.
 */
export const usePinWindowStore = create<PinWindowStore>((set, get) => ({
  notas: [],

  fixar(pinId) {
    if (get().notas.some((nota) => nota.pinId === pinId)) {
      get().trazerPraFrente(pinId);
      return;
    }

    set((state) => ({ notas: [...state.notas, { pinId, ...INICIAL }] }));
  },

  mover(pinId, dx, dy) {
    const limitadoX = Math.round(Math.min(Math.max(dx, -ALCANCE_X_PX), ALCANCE_X_PX));
    const limitadoY = Math.round(Math.min(Math.max(dy, -ALCANCE_Y_PX), ALCANCE_Y_PX));

    set((state) => ({
      notas: state.notas.map((nota) =>
        nota.pinId === pinId ? { ...nota, dx: limitadoX, dy: limitadoY } : nota,
      ),
    }));
  },

  trazerPraFrente(pinId) {
    const { notas } = get();
    const alvo = notas.find((nota) => nota.pinId === pinId);

    // Já na frente: sem isto, clicar na nota de cima criaria um array novo a
    // cada clique e redesenharia todas as outras por nada.
    if (!alvo || notas[notas.length - 1] === alvo) return;

    set({ notas: [...notas.filter((nota) => nota !== alvo), alvo] });
  },

  fechar(pinId) {
    set((state) => ({ notas: state.notas.filter((nota) => nota.pinId !== pinId) }));
  },
}));
