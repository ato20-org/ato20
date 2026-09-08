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
 * Deslocamento de um cartão que nunca foi movido: à direita do alfinete, quase
 * na mesma altura.
 *
 * Só vale para a PRIMEIRA abertura de cada ponto. Depois disso vence o lugar
 * onde o mestre deixou o cartão — ver `posicoes`.
 */
const INICIAL = { dx: 26, dy: -8 };

/** Onde as posições sobrevivem ao fechamento da janela. */
const CHAVE = "ato20:notas-posicao";

/**
 * Quantos pontos guardam posição.
 *
 * Existe porque a chave é uma só para todas as campanhas — os ids de ponto são
 * uuid, então não colidem — e sem teto a lista cresceria para sempre com
 * pontos de cenas que nem existem mais. Guardar os últimos movidos é o que
 * importa: posição de nota é memória de bancada, não arquivo.
 */
const LEMBRADAS = 200;

type Offset = { dx: number; dy: number };

function eOffset(valor: unknown): valor is Offset {
  return (
    typeof valor === "object" &&
    valor !== null &&
    typeof (valor as Offset).dx === "number" &&
    typeof (valor as Offset).dy === "number"
  );
}

/**
 * Lê as posições guardadas, tolerando lixo.
 *
 * `localStorage` é entrada não confiável como qualquer outra: a chave pode ter
 * sido escrita por uma versão anterior, editada à mão ou truncada. Uma entrada
 * inválida derrubaria a montagem do palco se entrasse sem conferência.
 */
function ler(): Record<string, Offset> {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return {};

    const lido: unknown = JSON.parse(cru);
    if (typeof lido !== "object" || lido === null) return {};

    return Object.fromEntries(
      Object.entries(lido as Record<string, unknown>)
        .filter(([, valor]) => eOffset(valor))
        .map(([pinId, valor]) => [pinId, { dx: (valor as Offset).dx, dy: (valor as Offset).dy }]),
    );
  } catch {
    return {};
  }
}

function gravar(posicoes: Record<string, Offset>) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(posicoes));
  } catch {
    // Cota cheia ou armazenamento bloqueado: a nota continua onde está nesta
    // sessão, e só não é reencontrada na próxima. Não vale um aviso na tela.
  }
}

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
   * As notas abertas, da mais atrás para a mais à frente.
   *
   * Lista e não mapa: a ordem É o empilhamento, e guardá-la na própria
   * estrutura evita um campo `z` que precisaria ser reordenado na mão a cada
   * clique.
   */
  notas: PinNoteWindow[];
  /**
   * Onde o mestre deixou o cartão de cada ponto, da última vez que o moveu.
   *
   * Separado de `notas` porque sobrevive a fechar a nota: a lista de cima é o
   * que está na tela AGORA, e isto é lembrança. Sem essa divisão, arrumar o
   * cartão do "Alçapão" longe do alfinete para não cobrir o corredor seria um
   * trabalho a refazer a cada vez que a nota fosse consultada.
   */
  posicoes: Record<string, Offset>;

  /** Traz a nota do ponto para a tela. Já aberta, só vem para a frente. */
  abrir: (pinId: string) => void;
  /** Move o cartão durante o arrasto. Não grava: quem grava é `guardar`. */
  mover: (pinId: string, dx: number, dy: number) => void;
  /**
   * Fixa a posição atual como a deste ponto, e a guarda no disco da máquina.
   *
   * Chamado no FIM do arrasto, não a cada quadro dele: gravar por quadro seria
   * dezenas de escritas em `localStorage` por gesto, e o que interessa é onde
   * o cartão parou.
   */
  guardar: (pinId: string) => void;
  trazerPraFrente: (pinId: string) => void;
  fechar: (pinId: string) => void;
  /**
   * Lê as posições guardadas.
   *
   * Depois da montagem, e não na criação do store: ler `localStorage` antes
   * disso divergiria da marcação pré-renderizada. Mesmo caminho do
   * `use-panels-store`.
   */
  restaurar: () => void;
};

/**
 * As notas que o mestre tem abertas sobre o mapa.
 *
 * Cada ponto abre direto assim, amarrado ao alfinete por uma linha. Antes o
 * clique abria um popover e um botão dentro dele transformava aquilo nisto —
 * dois cartões idênticos, um passo de distância, e o passo servia só para o
 * cartão parar de fechar ao primeiro clique no mapa. Conduzir a cena com a
 * nota à vista é o uso normal, não o avançado: mover um token, revelar uma
 * área e enquadrar a câmera são cliques no mapa, e cada um deles fechava o
 * popover.
 *
 * Guarda um deslocamento, não uma posição: a nota é amarrada ao alfinete e
 * viaja com ele quando o mapa desloca ou amplia. Uma posição absoluta na tela
 * ficaria parada enquanto o mapa corre por baixo, e a linha que liga os dois
 * viraria uma diagonal atravessando a janela.
 *
 * Estado de máquina, não de campanha: nada disto entra no vault nem viaja para
 * a mesa. As posições ficam em `localStorage`, que é a estante da máquina do
 * mestre — o cartão reencontra o canto onde foi posto sem que a campanha
 * carregue mobília de bancada dentro dela.
 */
export const usePinWindowStore = create<PinWindowStore>((set, get) => ({
  notas: [],
  posicoes: {},

  abrir(pinId) {
    if (get().notas.some((nota) => nota.pinId === pinId)) {
      get().trazerPraFrente(pinId);
      return;
    }

    // A posição de antes vence o padrão: reabrir uma nota é continuar de onde
    // se parou, não recomeçar a arrumação da mesa.
    const lembrada = get().posicoes[pinId] ?? INICIAL;

    set((state) => ({ notas: [...state.notas, { pinId, ...lembrada }] }));
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

  guardar(pinId) {
    const nota = get().notas.find((nota) => nota.pinId === pinId);
    if (!nota) return;

    // Reinsere a chave no fim, em vez de sobrescrever no lugar: a ordem do
    // objeto passa a ser a de uso, e é ela que o corte abaixo respeita.
    const posicoes = { ...get().posicoes };
    delete posicoes[pinId];
    posicoes[pinId] = { dx: nota.dx, dy: nota.dy };

    const chaves = Object.keys(posicoes);
    for (const antiga of chaves.slice(0, Math.max(0, chaves.length - LEMBRADAS))) {
      delete posicoes[antiga];
    }

    gravar(posicoes);
    set({ posicoes });
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

  restaurar() {
    set({ posicoes: ler() });
  },
}));
