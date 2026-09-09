"use client";

import { create } from "zustand";

import type { AnexoPersonagem } from "@/types/character";

/**
 * O que uma janela interna mostra.
 *
 * União discriminada, e não um id opaco com o conteúdo procurado noutro lugar:
 * é o que faz a camada que desenha as janelas ser um `switch` exaustivo, com o
 * compilador cobrando um caso novo quando um tipo novo aparecer.
 *
 * O que entra aqui é DESCRITOR, nunca o dado resolvido. Uma janela de anexo
 * guarda de que personagem e qual arquivo, e não o endereço da imagem: quem
 * baixa os bytes e revoga a blob é o componente, no ciclo de vida dele. Uma
 * blob URL guardada no store viveria até alguém lembrar de revogá-la no
 * `fechar`, e a primeira vez que esquecessem seria um vazamento silencioso.
 */
export type ConteudoJanela =
  | { tipo: "personagens" }
  | { tipo: "personagem"; personagemId: string }
  | { tipo: "anexo"; personagemId: string; anexo: AnexoPersonagem }
  | { tipo: "asset"; assetId: string; nome: string }
  // Os cinco painéis de sempre, agora janelas como as outras. Eram markup fixo
  // dentro de dois `aside`, com abas próprias; virar conteúdo de janela é o que
  // permite tirar Retratos da esquerda e deixar embaixo da direita, ou empilhar
  // a ficha do Edgar sob o acervo. Ver `useLayoutStore`.
  //
  // Sem campo nenhum: o que eles mostram sai do store da cena, não de um
  // descritor. Só existe UMA lista de cenas, e é isso que os torna diferentes
  // de uma ficha, que existe uma por personagem.
  | { tipo: "cenas" }
  | { tipo: "areas" }
  | { tipo: "retratos" }
  | { tipo: "imagens" }
  | { tipo: "sons" }
  | { tipo: "camadas" };

/**
 * A chave de uma janela, derivada do conteúdo.
 *
 * Derivada, e não sorteada, é o que faz "abrir o mesmo personagem de novo"
 * virar trazer-para-a-frente sem nenhum código a mais — e é o que dá uma
 * posição lembrada por personagem em vez de uma por abertura.
 */
export function chaveDe(conteudo: ConteudoJanela): string {
  switch (conteudo.tipo) {
    case "personagens":
      return "personagens";
    case "personagem":
      return `personagem:${conteudo.personagemId}`;
    case "anexo":
      return `anexo:${conteudo.personagemId}/${conteudo.anexo.autor}/${conteudo.anexo.arquivo}`;
    case "asset":
      return `asset:${conteudo.assetId}`;
    // Painel é único: o próprio tipo é a chave, e é o que impede dois grupos de
    // mostrarem a mesma lista de cenas.
    case "cenas":
    case "areas":
    case "retratos":
    case "imagens":
    case "sons":
    case "camadas":
      return conteudo.tipo;
  }
}

export type Janela = {
  chave: string;
  conteudo: ConteudoJanela;
  /** Canto de cima e à esquerda, em pixels de tela, relativo ao palco. */
  x: number;
  y: number;
  /**
   * Tamanho, em pixels — `undefined` é "nunca redimensionada".
   *
   * Ausente e não um número padrão: o padrão é do CONTEÚDO, não do store. A
   * lista de personagens nasce estreita e a ficha larga, e é cada janela que
   * sabe disso. Um padrão aqui teria de ser um só para as quatro.
   */
  largura?: number;
  altura?: number;
  /** Recolhida: só o cabeçalho, como uma aba. */
  recolhida?: boolean;
};

/**
 * O que sobrevive ao fechar: onde estava e de que tamanho.
 *
 * Tamanho junto da posição, na mesma chave do disco, porque é a mesma
 * pergunta — como o mestre deixou esta janela. `largura`/`altura` são
 * opcionais para uma entrada gravada por uma versão anterior, que só tinha
 * `x`/`y`, continuar valendo em vez de ser descartada como lixo.
 *
 * `recolhida` NÃO entra: recolher é estado do momento, não arrumação. Reabrir
 * o aplicativo numa janela colapsada seria abrir uma janela que não mostra
 * nada, sem pista de por quê.
 */
type Posicao = { x: number; y: number; largura?: number; altura?: number };

/** Onde as posições sobrevivem ao fechamento da janela. */
const CHAVE_DISCO = "ato20:janelas-posicao";

/**
 * Quantas janelas guardam posição.
 *
 * Mesma razão do teto das notas de ponto: a chave é uma só para todas as
 * campanhas, e ids de personagem são uuid, então a lista cresceria para sempre
 * com personagens que já não existem. Posição de janela é memória de bancada,
 * não arquivo de campanha.
 */
const LEMBRADAS = 100;

/**
 * Onde uma janela nunca movida nasce, e o quanto cada nova se desloca da
 * anterior.
 *
 * Em escada, e não todas no mesmo canto: abrir três personagens seguidos
 * deixaria as três exatamente sobrepostas, e o mestre teria de arrastar duas
 * para descobrir que havia três.
 */
const INICIAL = { x: 56, y: 56 };
const ESCADA = 28;

/**
 * Quanto de uma janela precisa continuar alcançável.
 *
 * O arrasto é limitado ao palco menos esta folga: sem limite, um gesto
 * distraído deixa a janela inteira fora da vista, e não há barra de tarefas
 * onde reencontrá-la — só reabrir pelo canto, que traz de volta a posição
 * guardada, ou seja, o mesmo nada.
 */
const MARGEM_PX = 40;

/**
 * O tamanho que uma janela pode ter.
 *
 * O mínimo é o que mantém o cabeçalho legível e o corpo utilizável: abaixo
 * disso o título vira reticências e a alça de redimensionar cobre o conteúdo.
 * O máximo é generoso porque o teto de verdade é o CSS — a janela é limitada à
 * altura do palco por `max-h`, e isto só existe para um arrasto de mil pixels
 * para a direita não gravar uma largura absurda no disco.
 */
const MIN_LARGURA_PX = 224;
const MIN_ALTURA_PX = 140;
const MAX_PX = 1_600;

/** Largura da janela recolhida. Ver `alternarRecolhida`. */
export const TAB_PX = 240;

function eNumeroOuAusente(valor: unknown): boolean {
  return valor === undefined || typeof valor === "number";
}

function ePosicao(valor: unknown): valor is Posicao {
  return (
    typeof valor === "object" &&
    valor !== null &&
    typeof (valor as Posicao).x === "number" &&
    typeof (valor as Posicao).y === "number" &&
    eNumeroOuAusente((valor as Posicao).largura) &&
    eNumeroOuAusente((valor as Posicao).altura)
  );
}

/**
 * Lê as posições guardadas, tolerando lixo.
 *
 * `localStorage` é entrada não confiável como qualquer outra: a chave pode ter
 * sido escrita por uma versão anterior, editada à mão ou truncada. Uma entrada
 * inválida derrubaria a montagem do palco se entrasse sem conferência.
 */
function ler(): Record<string, Posicao> {
  try {
    const cru = localStorage.getItem(CHAVE_DISCO);
    if (!cru) return {};

    const lido: unknown = JSON.parse(cru);
    if (typeof lido !== "object" || lido === null) return {};

    return Object.fromEntries(
      Object.entries(lido as Record<string, unknown>)
        .filter(([, valor]) => ePosicao(valor))
        .map(([chave, valor]) => [
          chave,
          {
            x: (valor as Posicao).x,
            y: (valor as Posicao).y,
            largura: (valor as Posicao).largura,
            altura: (valor as Posicao).altura,
          },
        ]),
    );
  } catch {
    return {};
  }
}

function gravar(posicoes: Record<string, Posicao>) {
  try {
    localStorage.setItem(CHAVE_DISCO, JSON.stringify(posicoes));
  } catch {
    // Cota cheia ou armazenamento bloqueado: a janela continua onde está nesta
    // sessão, e só não é reencontrada na próxima. Não vale um aviso na tela.
  }
}

type WindowStore = {
  /**
   * As janelas abertas, da mais atrás para a mais à frente.
   *
   * Lista e não mapa: a ordem É o empilhamento, e guardá-la na própria
   * estrutura evita um campo `z` que precisaria ser reordenado na mão a cada
   * clique.
   */
  janelas: Janela[];
  /**
   * Onde o mestre deixou cada janela, da última vez que a moveu.
   *
   * Separado de `janelas` porque sobrevive a fechar: a lista de cima é o que
   * está na tela AGORA, e isto é lembrança. Sem essa divisão, encostar a ficha
   * do Edgar no canto para não cobrir o mapa seria trabalho a refazer a cada
   * consulta.
   */
  posicoes: Record<string, Posicao>;

  /**
   * Traz a janela para a tela. Já aberta, só vem para a frente.
   *
   * `posicao` força o canto, e existe para desatracar: arrastar uma aba para
   * fora tem de deixar a janela onde a mão a soltou, e não onde ela estava a
   * arrumação passada. Sem ela vence a posição lembrada, e depois o padrão.
   */
  abrir: (conteudo: ConteudoJanela, posicao?: { x: number; y: number }) => void;
  /** Move durante o arrasto. Não grava: quem grava é `guardar`. */
  mover: (chave: string, x: number, y: number) => void;
  /**
   * Fixa a posição atual como a desta janela, e a guarda no disco da máquina.
   *
   * Chamado no FIM do arrasto, e não a cada quadro: gravar por quadro seriam
   * dezenas de escritas em `localStorage` por gesto, e o que interessa é onde
   * a janela parou.
   */
  guardar: (chave: string) => void;
  /**
   * Redimensiona durante o arrasto da alça. Não grava: quem grava é `guardar`.
   *
   * A largura e a altura andam juntas porque a alça é uma, no canto: separar em
   * duas ações daria dois updates de store por quadro do mesmo gesto.
   */
  redimensionar: (chave: string, largura: number, altura: number) => void;
  /**
   * Recolhe ou devolve a janela.
   *
   * Recolhida ela guarda tudo — posição, tamanho, o que estava rolado — e
   * mostra só o cabeçalho. É o que permite deixar três fichas ao pé do palco
   * durante a sessão sem elas cobrirem o mapa, e sem ter de reabrir cada uma
   * pela lista quando a cena chega em quem elas descrevem.
   */
  alternarRecolhida: (chave: string) => void;
  trazerPraFrente: (chave: string) => void;
  fechar: (chave: string) => void;
  /** Fecha a que está na frente. É o que o ESC de dentro de uma janela usa. */
  fecharDaFrente: () => void;
  /**
   * Lê as posições guardadas.
   *
   * Depois da montagem, e não na criação do store: ler `localStorage` antes
   * disso divergiria da marcação pré-renderizada. Mesmo caminho do
   * `use-panels-store` e do `use-pin-window-store`.
   */
  restaurar: () => void;
  /**
   * Limita a posição ao que o palco alcança.
   *
   * Vem de fora porque o tamanho do palco é da tela, não do store: quem mede é
   * a camada que desenha, no arrasto e ao redimensionar a janela do aplicativo.
   */
  acomodar: (largura: number, altura: number) => void;
};

/**
 * As janelas internas que o mestre tem abertas sobre o palco.
 *
 * Janela, e não diálogo modal, porque o uso normal é consultar a ficha COM a
 * mesa andando: o mestre lê o que o Edgar tem na mochila e move o token dele no
 * mesmo minuto. Modal transformava isso em abrir, ler, fechar, mover, abrir de
 * novo — e cada ciclo desses perdia a rolagem, o personagem escolhido e o lugar
 * onde a lista estava.
 *
 * Um único empilhamento para todas: a janela de uma imagem tem de poder vir na
 * frente da janela do personagem que a abriu. Dois stores, um por tipo de tela,
 * teriam duas escadas de z-index que não sabem uma da outra.
 *
 * Estado de máquina, não de campanha: nada disto entra no vault nem viaja para
 * a mesa. As posições ficam em `localStorage`, que é a estante da máquina do
 * mestre. Quais janelas estavam abertas NÃO é guardado — reabrir o aplicativo
 * começa com o palco limpo, e é de propósito: a janela é o que está em uso
 * agora, não mobília da campanha.
 */
export const useWindowStore = create<WindowStore>((set, get) => ({
  janelas: [],
  posicoes: {},

  abrir(conteudo, posicao) {
    const chave = chaveDe(conteudo);

    if (get().janelas.some((janela) => janela.chave === chave)) {
      get().trazerPraFrente(chave);
      return;
    }

    // A posição de antes vence o padrão: reabrir é continuar de onde se parou,
    // não recomeçar a arrumação da mesa. Mas a pedida vence as duas.
    const lembrada = posicao ?? get().posicoes[chave];
    const escada = get().janelas.length * ESCADA;
    const inicial = { x: INICIAL.x + escada, y: INICIAL.y + escada };

    // O tamanho lembrado vem junto da posição: `lembrada` é a geometria inteira.
    set((state) => ({
      janelas: [...state.janelas, { chave, conteudo, ...(lembrada ?? inicial) }],
    }));
  },

  mover(chave, x, y) {
    set((state) => ({
      janelas: state.janelas.map((janela) =>
        janela.chave === chave ? { ...janela, x: Math.round(x), y: Math.round(y) } : janela,
      ),
    }));
  },

  guardar(chave) {
    const janela = get().janelas.find((atual) => atual.chave === chave);
    if (!janela) return;

    const posicoes = {
      ...get().posicoes,
      [chave]: {
        x: janela.x,
        y: janela.y,
        largura: janela.largura,
        altura: janela.altura,
      },
    };
    const chaves = Object.keys(posicoes);

    // Corta as mais antigas pela ordem de inserção do objeto, que é a ordem em
    // que foram gravadas. Aproximação boa: o que se quer manter é o que foi
    // mexido por último.
    for (const antiga of chaves.slice(0, Math.max(0, chaves.length - LEMBRADAS))) {
      delete posicoes[antiga];
    }

    set({ posicoes });
    gravar(posicoes);
  },

  redimensionar(chave, largura, altura) {
    const limitar = (valor: number, minimo: number) =>
      Math.round(Math.min(Math.max(valor, minimo), MAX_PX));

    set((state) => ({
      janelas: state.janelas.map((janela) =>
        janela.chave === chave
          ? {
              ...janela,
              largura: limitar(largura, MIN_LARGURA_PX),
              altura: limitar(altura, MIN_ALTURA_PX),
            }
          : janela,
      ),
    }));
  },

  alternarRecolhida(chave) {
    set((state) => ({
      janelas: state.janelas.map((janela) =>
        janela.chave === chave ? { ...janela, recolhida: !janela.recolhida } : janela,
      ),
    }));
  },

  trazerPraFrente(chave) {
    const janelas = get().janelas;
    // Já na frente: sair aqui evita um render por pointerdown em cada gesto
    // dentro da janela que já está em uso.
    if (janelas[janelas.length - 1]?.chave === chave) return;

    const alvo = janelas.find((janela) => janela.chave === chave);
    if (!alvo) return;

    set({ janelas: [...janelas.filter((janela) => janela.chave !== chave), alvo] });
  },

  fechar(chave) {
    set((state) => ({ janelas: state.janelas.filter((janela) => janela.chave !== chave) }));
  },

  fecharDaFrente() {
    set((state) => ({ janelas: state.janelas.slice(0, -1) }));
  },

  restaurar() {
    set({ posicoes: ler() });
  },

  acomodar(largura, altura) {
    if (largura <= 0 || altura <= 0) return;

    set((state) => ({
      janelas: state.janelas.map((janela) => ({
        ...janela,
        x: Math.min(Math.max(janela.x, 0), Math.max(0, largura - MARGEM_PX)),
        y: Math.min(Math.max(janela.y, 0), Math.max(0, altura - MARGEM_PX)),
      })),
    }));
  },
}));
