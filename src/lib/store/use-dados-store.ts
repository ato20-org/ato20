"use client";

import { create } from "zustand";

import { sortearValor, tipoDado, type Dado, type FacesDado, type Rolagem } from "@/types/dado";
import { novoId } from "@/lib/id";

const STORAGE_KEY = "ato20:saquinho";

/** Quantas rolagens o histórico guarda. */
const HISTORICO = 12;

/**
 * Raio de referência do dado, em unidades de cena.
 *
 * Fixo, e não regulável: num plano de 1920 com grade de 96, isto dá um dado que
 * ocupa mais ou menos meio quadrado — grande o bastante para o número ser lido
 * sem ampliar, pequeno o bastante para não cobrir o que está embaixo dele. Um
 * ajuste aqui seria mais um botão para uma decisão que só tem uma resposta boa.
 *
 * De REFERÊNCIA porque cada tipo ajusta em cima dele: raio igual não é tamanho
 * igual quando os sólidos são diferentes. Ver `TipoDado.escala`.
 */
export const RAIO_DADO = 46;

/**
 * Onde os dados entram na escada de empilhamento do palco.
 *
 * A escada é a documentada em `use-pin-window-store`: item da cena usa o `z`
 * dele (1, 2, 3...), névoa 5000, laço 8000, contorno de seleção 9000, alfinete
 * 9500, alças de transformação 10000, cartão de nota 12000. Nenhum desses cria
 * contexto de empilhamento próprio, então todos competem no mesmo plano — e uma
 * camada SEM `z-index` fica atrás de qualquer item do mapa.
 *
 * Seis mil: acima de tudo que é MAPA, abaixo de tudo que é CONTROLE.
 *
 * Acima do mapa porque o dado é um objeto sobre a mesa — inclusive sobre a
 * névoa: dado que cai numa área escondida continua sendo do mestre, e escondê-lo
 * do próprio mestre não esconderia nada de ninguém.
 *
 * Abaixo dos controles porque o dado ACEITA CLIQUE, e quem está no meio de um
 * gesto de redimensionar quer a alça, não uma jogada nova. Um dado por cima de
 * uma alça de trinta pixels roubaria o gesto.
 */
export const DADO_Z = 6_000;

/** Posição da bolinha, em fração do palco. Canto livre à direita, meia altura. */
const POSICAO_PADRAO = { x: 0.955, y: 0.42 };

type DadosStore = {
  /**
   * Os dados no tabuleiro. Vazio = tabuleiro limpo.
   *
   * FORA da cena, como a medida da régua e a evidência: dado não é conteúdo de
   * mapa. Não viaja no zip, não entra no Ctrl+Z, e trocar de cena não troca os
   * dados — a jogada é do momento da mesa, não do lugar onde ela aconteceu.
   */
  dados: Dado[];
  /** Últimas rolagens, a mais nova na frente. */
  historico: Rolagem[];

  /**
   * Onde a bolinha está, em FRAÇÃO do palco — não em pixel.
   *
   * Fração porque a bancada muda de tamanho: painel recolhido, janela
   * redimensionada, tela cheia. Em pixel, a bolinha deixada na borda direita
   * ficaria fora da vista no primeiro estreitamento; em fração ela acompanha.
   */
  posicao: { x: number; y: number };
  /** `localStorage` já foi lido. Antes disso a posição é só o padrão. */
  restaurado: boolean;

  /**
   * O dado que está na mão agora, em pixel de TELA. `null` = mão vazia.
   *
   * Em pixel de tela porque a bolinha e o mapa vivem em espaços diferentes: o
   * saquinho flutua sobre a bancada, medido em pixel, e só quem está DENTRO do
   * palco sabe traduzir pixel de tela em unidade de cena — a conta depende do
   * zoom e do deslocamento, e mora no `useSceneScale`.
   *
   * Então o saquinho não desenha o dado na mão: ele diz ONDE a mão está. Quem
   * desenha é a `DadoLayer`, que está dentro do palco. A alternativa era o
   * saquinho ir atrás do retângulo do plano por conta própria, refazendo essa
   * conta num segundo lugar — e ela erra sozinha no dia em que o palco ganhar
   * uma margem.
   *
   * A `semente` nasce ao PEGAR, e não ao soltar: é ela que dá o eixo da tombada
   * na mão, e o mesmo eixo continua valendo depois do arremesso. Sem isso o
   * dado trocaria de eixo de giro no instante em que saísse da mão.
   */
  naMao: {
    faces: FacesDado;
    clientX: number;
    clientY: number;
    semente: number;
    /**
     * O dado da mesa que está nesta mão. Ausente = veio do saquinho.
     *
     * O dado NÃO sai de `dados` ao ser pego, e isso é de propósito: quem
     * captura o ponteiro é o elemento SVG dele, e remover o dado da lista
     * desmontaria esse elemento no primeiro pixel de arrasto — o gesto morreria
     * na hora de começar. Então ele fica na lista e a `DadoView` para de
     * desenhá-lo enquanto está aqui; quem o tira é o arremesso.
     */
    daMesa?: string;
  } | null;
  pegarDado: (faces: FacesDado, clientX: number, clientY: number, daMesa?: string) => void;
  moverMao: (clientX: number, clientY: number) => void;

  /**
   * O arremesso à espera de virar dado, em pixel de tela por segundo.
   *
   * Mesma razão do `naMao` para estar em pixel: quem converte é a camada. E é
   * uma etapa separada de `naMao` porque soltar é um instante, não um estado —
   * a mão esvazia e a jogada nasce no mesmo quadro.
   */
  arremesso: {
    faces: FacesDado;
    clientX: number;
    clientY: number;
    vx: number;
    vy: number;
    semente: number;
    /** O dado da mesa a recolher quando este arremesso virar jogada. */
    daMesa?: string;
  } | null;
  /** Solta o dado da mão com a velocidade do gesto, em pixel de tela por segundo. */
  arremessar: (vx: number, vy: number) => void;
  /** Consome o arremesso. Chamado pela camada depois de converter e lançar. */
  consumirArremesso: () => void;

  lancar: (
    faces: FacesDado,
    x: number,
    y: number,
    impulso: { x: number; y: number },
    semente?: number,
    /**
     * O número gravado, quando ele NÃO foi sorteado aqui.
     *
     * É o caso do celular do jogador: lá quem sorteia é o daemon, e o que a
     * tela faz é animar até a face que voltou. Ver `rolarDado`.
     *
     * Ausente é o caso do mestre, e continua sendo o normal: o dado dele não
     * viaja para lugar nenhum, então não há o que conferir com ninguém.
     */
    valor?: number,
  ) => Dado;
  recolher: () => void;
  /** Tira um dado do tabuleiro, sem mexer no histórico. */
  guardar: (id: string) => void;
  mover: (posicao: { x: number; y: number }) => void;
  restaurar: () => void;
};

type Guardado = { x: number; y: number };

function ler(): Guardado | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Guardado>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;

    return { x: limitar(parsed.x), y: limitar(parsed.y) };
  } catch {
    // Modo privado, cota cheia ou JSON corrompido. O padrão serve.
    return null;
  }
}

function limitar(valor: number): number {
  return Math.min(1, Math.max(0, valor));
}

/**
 * O saquinho de dados.
 *
 * Store de sessão, no mesmo desenho do `useReguaStore`: fora da cena, fora do
 * vault, fora do histórico de desfazer. A ÚNICA coisa que sobrevive ao
 * fechamento é onde a bolinha foi deixada, e isso porque é mobília — o mestre
 * escolheu um canto que não atrapalha o mapa dele, e devolvê-la ao meio da tela
 * a cada abertura seria desfazer uma decisão dele toda sessão.
 *
 * Os dados no tabuleiro NÃO persistem: dado esquecido de ontem reaparecendo
 * sobre o mapa de hoje é lixo, não memória.
 *
 * Nada aqui é publicado, e isso continua valendo depois de os jogadores
 * passarem a rolar dados. Este store é a MESA DE QUEM OLHA: no Operador ele é o
 * saquinho do mestre, no celular é o do jogador, e em nenhum dos dois o que
 * está nele viaja. O que viaja é a `RolagemDaMesa`, que nasce no daemon e mora
 * em `useRolagensStore` — dois estados, porque são duas coisas: o dado que ESTÁ
 * na minha tela, e o fato de alguém ter rolado.
 *
 * A camada que desenha continua em `components/operator` por consequência
 * disso: ela é a mesma nas duas telas justamente por não prometer transmissão
 * nenhuma. O que a mesa vê de uma rolagem alheia é o `DadoParado`, que está em
 * `playground` porque as três telas o desenham.
 */
export const useDadosStore = create<DadosStore>((set, get) => ({
  dados: [],
  historico: [],
  posicao: POSICAO_PADRAO,
  restaurado: false,

  naMao: null,
  pegarDado: (faces, clientX, clientY, daMesa) =>
    set({
      naMao: {
        faces,
        clientX,
        clientY,
        semente: crypto.getRandomValues(new Uint32Array(1))[0],
        daMesa,
      },
    }),
  moverMao: (clientX, clientY) =>
    set((state) => (state.naMao ? { naMao: { ...state.naMao, clientX, clientY } } : {})),

  arremesso: null,
  arremessar: (vx, vy) =>
    set((state) =>
      state.naMao ? { arremesso: { ...state.naMao, vx, vy }, naMao: null } : {},
    ),
  consumirArremesso: () => set({ arremesso: null }),

  /**
   * Lança um dado no ponto pedido, em unidades de cena.
   *
   * O valor sai sorteado JÁ AQUI, no lançamento, e não quando o dado para de
   * girar. Ver o comentário de `Dado`: é o que torna a jogada conferível, e é o
   * que deixa publicar para a mesa ser um clique em vez de sincronizar física.
   */
  lancar(faces, x, y, impulso, semente, valorDeFora) {
    // Sorteia aqui SÓ quando ninguém sorteou antes. Ver o parâmetro.
    const valor = valorDeFora ?? sortearValor(faces);
    const agora = Date.now();

    const dado: Dado = {
      id: novoId(),
      faces,
      x,
      y,
      raio: RAIO_DADO * tipoDado(faces).escala,
      valor,
      impulso,
      // A semente decide o EIXO da tombada, não o destino. Vem de fora quando o
      // dado estava na mão, para o eixo em que ele girava entre os dedos
      // continuar sendo o mesmo depois de solto; do gerador do sistema quando é
      // uma jogada nova, para duas seguidas não caírem igual.
      semente: semente ?? crypto.getRandomValues(new Uint32Array(1))[0],
      lancadoEm: agora,
    };

    set((state) => ({
      dados: [...state.dados, dado],
      historico: [
        { id: dado.id, faces, valor, quando: agora },
        ...state.historico,
      ].slice(0, HISTORICO),
    }));

    return dado;
  },

  recolher: () => set({ dados: [] }),
  guardar: (id) => set((state) => ({ dados: state.dados.filter((dado) => dado.id !== id) })),

  mover: (posicao) => set({ posicao: { x: limitar(posicao.x), y: limitar(posicao.y) } }),

  restaurar() {
    if (get().restaurado) return;

    const guardado = ler();
    set(guardado ? { posicao: guardado, restaurado: true } : { restaurado: true });
  },
}));

// Grava fora do React: é preferência de máquina, não estado de render. Mesmo
// desenho do `usePanelsStore`.
useDadosStore.subscribe((state, anterior) => {
  if (!state.restaurado) return;
  if (state.posicao.x === anterior.posicao.x && state.posicao.y === anterior.posicao.y) return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.posicao));
  } catch {
    // Sem espaço ou sem permissão: perder a preferência é aceitável.
  }
});
