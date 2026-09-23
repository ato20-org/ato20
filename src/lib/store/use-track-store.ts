"use client";

import { create } from "zustand";

import { novoId } from "@/lib/id";
import { useAssetsStore } from "@/lib/store/use-assets-store";
import { loadAudio, padsVazios, saveAudio, type SessionAudio } from "@/lib/vault/session";
import {
  type Ambiente,
  type Disparo,
  GANHO_PADRAO,
  MAX_AMBIENTES,
  type Pad,
} from "@/types/scene";

/**
 * Quanto tempo fica na bandeja um disparo que não se consegue medir.
 *
 * Só esse caso. Havia aqui um prazo fixo de quinze segundos para TODO disparo,
 * e ele estava errado por uma razão simples: quinze segundos é o que dura um
 * trovão, não o que dura a entrada de um inimigo. O arquivo passava dos quinze
 * e era cortado no meio, porque vencer na bandeja é o elemento sair da árvore.
 *
 * Agora o prazo de cada disparo é a duração do próprio arquivo, lida do
 * `<audio>` desta tela — ver `useSomDaMesa`. Este número é o que resta para
 * quando não há duração nenhuma a ler: o arquivo sumiu do acervo, ou o
 * elemento nunca montou. Sem ele o registro ficaria eterno, republicando no
 * batimento do canal para sempre.
 *
 * O prazo mora aqui pela mesma razão que o do dado mora no store dele: quem
 * guarda a bandeja é quem a publica, e um relógio em Rust só para apagar um
 * registro seria o mesmo estado em dois lugares.
 */
export const PRAZO_SEM_MEDIDA_MS = 15_000;

/**
 * O som da sessão: a trilha, os ambientes acesos, os disparos e os pads.
 *
 * Store próprio, separado do board, por dois motivos que continuam valendo
 * agora que ele guarda mais do que uma faixa. O histórico de desfazer tira
 * retratos do board, e som não deve voltar junto de um Ctrl+Z num item. E nada
 * disto pertence a uma cena: trocar de mapa não pode cortar a música.
 *
 * O AMBIENTE é o caso interessante: ele até depende da cena — a taverna acende
 * a lareira, o bosque acende o vento —, mas o que a cena guarda é uma MEMÓRIA,
 * não o estado. Ela mora em `ambientesPorCena`, aqui fora, e é por isso que
 * desfazer um arrasto de token não religa a chuva. O preço é `copiarCena` e
 * `esquecerCena`, que o `use-scene-store` precisa chamar à mão.
 */
type TrackStore = SessionAudio & {
  /**
   * Os disparos ainda quentes, o mais novo na frente.
   *
   * Efêmera e não persistida, como a bandeja de dados. É ela que viaja no
   * `LiveState`, e o espectador guarda os ids que já tocou: o batimento do
   * canal republica o quadro dez vezes por segundo, e sem essa memória o tiro
   * tocaria dez vezes por segundo.
   */
  disparos: Disparo[];
  /**
   * Em que cena o som está, para saber o que lembrar.
   *
   * Segue a cena NO AR, e não a que o mestre edita: abrir outro mapa para
   * preparar a cena seguinte não pode trocar o som que a mesa está ouvindo.
   * Quem escreve aqui é `entrarNaCena`. Ver `useAmbienteDaCena`.
   */
  cenaAtual: string | null;
  /** Qual campanha este som pertence. Ver `use-scene-store`. */
  hydratedPath: string | null;

  hydrate: (campaignPath: string) => Promise<void>;

  // --- a trilha -------------------------------------------------------------

  /** Escolhe a faixa e começa a tocar. O instante é estampado aqui. */
  start: (assetId: string) => void;
  /** Pausa ou retoma, reiniciando a contagem de posição. */
  setPlaying: (playing: boolean) => void;
  /**
   * Regula só a trilha, por baixo do volume da mesa.
   *
   * Separado do fader da camada porque são perguntas diferentes: "a música
   * está por cima da fala" e "esta faixa em especial está alta". Este morre
   * com a faixa; aquele atravessa as trocas. Ver `SessionTrack.ganho`.
   */
  setGanhoDaTrilha: (ganho: number) => void;
  /**
   * Move a faixa para um instante.
   *
   * Reescreve `startedAt` em vez de mandar um comando de "buscar": é assim que
   * a posição já viajava, e por isso a TV e os celulares seguem sozinhos —
   * cada um recalcula a própria posição a partir dele. Um comando novo exigiria
   * que todos estivessem ouvindo no instante exato do clique.
   */
  seek: (seconds: number) => void;
  setLoop: (loop: boolean) => void;
  /**
   * Põe esta faixa como trilha; se já for ela, tira.
   *
   * O irmão de `alternar` uma camada acima, e existe pela mesma razão: é o que
   * a tecla do pad faz. Tirar e não pausar, como no ambiente — o pad é o gesto
   * de "corta a música", e pausá-la deixaria a faixa escolhida em silêncio,
   * que é um terceiro estado que a tecla não sabe mostrar.
   */
  alternarTrilha: (assetId: string) => void;
  clear: () => void;

  // --- os ambientes ---------------------------------------------------------

  /** Acende um ambiente novo. Ver o teto em `MAX_AMBIENTES`. */
  acender: (assetId: string, ganho?: number) => void;
  apagar: (id: string) => void;
  /** Acende se apagado, apaga se aceso. É o que a tecla do pad faz. */
  alternar: (assetId: string) => void;
  setGanho: (id: string, ganho: number) => void;
  setTocando: (id: string, tocando: boolean) => void;

  // --- os disparos ----------------------------------------------------------

  disparar: (assetId: string, ganho?: number) => void;
  /**
   * Tira estes disparos da bandeja.
   *
   * Quem decide QUAIS é de fora: o relógio do `useSomDaMesa`, que roda só no
   * Mestre e é o único que vê quanto o arquivo dura, e o X do painel, que é o
   * mestre cortando um efeito longo antes do fim. A bandeja só obedece.
   *
   * Um relógio para todos e não um `setTimeout` por disparo: N disparos dariam
   * N temporizadores para uma varredura que custa um `filter`, e um
   * temporizador por disparo é um vazamento esperando a janela fechar no meio.
   * Mesma escolha da bandeja de dados.
   */
  tirarDisparos: (ids: readonly string[]) => void;

  // --- os pads --------------------------------------------------------------

  /**
   * Põe um som na tecla, ou a esvazia com `null`.
   *
   * Recusa um som que já está noutra tecla. Ver a razão no corpo.
   */
  definirPad: (indice: number, pad: Pad) => void;

  // --- as macros ------------------------------------------------------------

  /**
   * Põe um som na lista solta. Recusa o que já está nela.
   *
   * Mesmo motivo do pad repetido: duas linhas do mesmo ambiente seriam uma que
   * acende e outra que parece quebrada, porque `acender` recusa o que já está
   * aceso.
   */
  adicionarMacro: (assetId: string) => void;
  removerMacro: (id: string) => void;
  /** O mesmo que a tecla faz, sem tecla. Ver `acionarPad`. */
  acionarMacro: (id: string) => void;

  /**
   * O que a tecla do numpad faz, segundo o TIPO do arquivo que está nela.
   *
   * Trilha e ambiente alternam, efeito dispara — a mesma tabela do botão do
   * acervo, e é o ponto: a tecla e a linha têm de fazer a mesma coisa com o
   * mesmo som. Arquivo sem tipo não faz nada, e o pad mostra isso.
   */
  acionarPad: (indice: number) => void;

  // --- a cena ---------------------------------------------------------------

  /** A mesa entrou noutra cena: acende o que ela lembra. */
  entrarNaCena: (cenaId: string | null) => void;
  /** Cena duplicada leva a memória de ambiente junto. */
  copiarCena: (deId: string, paraId: string) => void;
  /** Cena apagada não deixa memória órfã no mapa. */
  esquecerCena: (cenaId: string) => void;

  // --- geral ----------------------------------------------------------------

  /**
   * Silêncio, menos a trilha.
   *
   * Apaga ambiente e disparo e deixa a música: é o gesto de "corta o cenário"
   * do meio de uma cena, e tirar a trilha junto faria o mestre remontá-la do
   * acervo por causa de um susto.
   */
  cortarSons: () => void;
};

export const useTrackStore = create<TrackStore>((set, get) => ({
  track: null,
  ambientes: [],
  ambientesPorCena: {},
  pads: padsVazios(),
  macros: [],
  disparos: [],
  cenaAtual: null,
  hydratedPath: null,

  async hydrate(campaignPath) {
    if (get().hydratedPath === campaignPath) return;

    // Zera antes de ler: a música da campanha anterior continuaria tocando
    // sobre a nova enquanto o disco respondesse.
    set({
      track: null,
      ambientes: [],
      ambientesPorCena: {},
      pads: padsVazios(),
      macros: [],
      disparos: [],
      cenaAtual: null,
      hydratedPath: campaignPath,
    });

    try {
      set(await loadAudio());
    } catch {
      // Sem som guardado é estado válido; não vale derrubar a tela por isso.
    }
  },

  start(assetId) {
    // Sem volume no argumento: a faixa nova entra no volume em que a mesa já
    // está. Passar um padrão aqui era o que fazia o som saltar a cada troca.
    //
    // O GANHO é outra coisa e nasce cheio: ele é o fader deste canal, e herdar
    // o da faixa anterior faria a música nova entrar abafada porque a de antes
    // estava baixa durante uma conversa que já acabou.
    gravar(set, get, {
      track: {
        assetId,
        loop: true,
        playing: true,
        ganho: GANHO_PADRAO,
        startedAt: Date.now(),
      },
    });
  },

  setPlaying(playing) {
    const { track } = get();
    if (!track) return;

    // Reinicia a contagem: sem isso, quem chega depois calcularia a posição da
    // faixa incluindo o tempo em que ela ficou pausada.
    gravar(set, get, { track: { ...track, playing, startedAt: Date.now() } });
  },

  setGanhoDaTrilha(ganho) {
    const { track } = get();
    if (!track) return;

    // Sem mexer em `startedAt`: mudar o ganho não é recomeçar a faixa, e
    // reescrevê-lo mandaria a TV e os celulares buscarem a posição de novo a
    // cada passo do slider.
    gravar(set, get, { track: { ...track, ganho: limitar(ganho) } });
  },

  seek(seconds) {
    const { track } = get();
    if (!track) return;

    gravar(set, get, {
      track: { ...track, startedAt: Date.now() - Math.max(0, seconds) * 1000 },
    });
  },

  setLoop(loop) {
    const { track } = get();
    if (track) gravar(set, get, { track: { ...track, loop } });
  },

  alternarTrilha(assetId) {
    if (get().track?.assetId === assetId) get().clear();
    else get().start(assetId);
  },

  clear() {
    // Os ambientes ficam: trocar de trilha no meio da chuva não para a chuva.
    gravar(set, get, { track: null });
  },

  acender(assetId, ganho = GANHO_PADRAO) {
    const { ambientes } = get();

    // Já aceso não vira dois. Dois elementos do mesmo arquivo em pontos
    // diferentes do loop soam como eco, não como "mais chuva".
    if (ambientes.some((atual) => atual.assetId === assetId)) return;

    const novo: Ambiente = {
      id: novoId(),
      assetId,
      ganho: limitar(ganho),
      tocando: true,
      startedAt: Date.now(),
    };

    // No teto, o mais VELHO sai. Recusar em silêncio deixaria a tecla do pad
    // sem efeito nenhum, e o mestre apertando-a de novo no meio da sessão sem
    // entender por quê; empurrar a fila ao menos faz alguma coisa audível.
    const cabem = ambientes.slice(-(MAX_AMBIENTES - 1));

    trocarAmbientes(set, get, [...cabem, novo]);
  },

  apagar(id) {
    trocarAmbientes(
      set,
      get,
      get().ambientes.filter((ambiente) => ambiente.id !== id),
    );
  },

  alternar(assetId) {
    const aceso = get().ambientes.find((atual) => atual.assetId === assetId);

    if (aceso) get().apagar(aceso.id);
    else get().acender(assetId);
  },

  setGanho(id, ganho) {
    trocarAmbientes(
      set,
      get,
      get().ambientes.map((ambiente) =>
        ambiente.id === id ? { ...ambiente, ganho: limitar(ganho) } : ambiente,
      ),
    );
  },

  setTocando(id, tocando) {
    trocarAmbientes(
      set,
      get,
      get().ambientes.map((ambiente) =>
        // `startedAt` refeito pela mesma razão da trilha: sem isso quem chega
        // depois calcularia a posição incluindo o tempo parado.
        ambiente.id === id
          ? { ...ambiente, tocando, startedAt: Date.now() }
          : ambiente,
      ),
    );
  },

  disparar(assetId, ganho = GANHO_PADRAO) {
    // Não passa por `gravar`: disparo não vai para o disco. Ver `SessionAudio`.
    set((state) => ({
      disparos: [
        { id: novoId(), assetId, ganho: limitar(ganho), firedAt: Date.now() },
        ...state.disparos,
      ],
    }));
  },

  tirarDisparos(ids) {
    if (ids.length === 0) return;

    set((state) => {
      const fora = new Set(ids);
      const viva = state.disparos.filter((disparo) => !fora.has(disparo.id));

      // Mesma referência quando nada saiu: o relógio bate de segundo em
      // segundo, e devolver um array novo a cada batida republicaria o quadro
      // inteiro para nada.
      return viva.length === state.disparos.length ? state : { disparos: viva };
    });
  },

  definirPad(indice, pad) {
    const atuais = get().pads;
    if (indice < 0 || indice >= atuais.length) return;

    // Um som, uma tecla. A mão decora "a chuva é o 7", e o mesmo arquivo em
    // duas teclas quebra isso de um jeito pior do que parece: sendo ambiente,
    // apertar o 7 acende e apertar o 5 NÃO acende um segundo — `acender` recusa
    // o que já está aceso —, então o 5 parece uma tecla quebrada. Sendo trilha,
    // o 5 tira a música que o 7 acabou de pôr.
    //
    // Recusa em vez de mover: mover esvaziaria uma tecla que o mestre não está
    // olhando. Quem quiser trocar de lugar esvazia a antiga, que é um gesto no
    // próprio pad. Quem chama já mostra o repetido desligado — ver
    // `SeletorDeSom` —, então isto é a guarda, e não a mensagem.
    const repetido =
      pad !== null &&
      atuais.some((outro, i) => i !== indice && outro?.assetId === pad.assetId);

    if (repetido) return;

    const pads = [...atuais];
    pads[indice] = pad;

    gravar(set, get, { pads });
  },

  acionarPad(indice) {
    const pad = get().pads[indice];
    if (pad) acionar(get(), pad.assetId, pad.ganho);
  },

  adicionarMacro(assetId) {
    const { macros } = get();
    if (macros.some((macro) => macro.assetId === assetId)) return;

    gravar(set, get, { macros: [...macros, { id: novoId(), assetId }] });
  },

  removerMacro(id) {
    gravar(set, get, {
      macros: get().macros.filter((macro) => macro.id !== id),
    });
  },

  acionarMacro(id) {
    const macro = get().macros.find((atual) => atual.id === id);
    if (macro) acionar(get(), macro.assetId, GANHO_PADRAO);
  },

  entrarNaCena(cenaId) {
    const { cenaAtual, ambientesPorCena } = get();
    if (cenaId === cenaAtual) return;

    // Nada no ar não é uma cena: tirar a câmera do ar não pode apagar a chuva.
    // Só para de LEMBRAR, até a mesa entrar noutro mapa.
    if (cenaId === null) {
      set({ cenaAtual: null });
      return;
    }

    // `?? []` de propósito: cena sem memória de ambiente é cena em silêncio.
    // A taverna lembra a lareira, o bosque não lembra nada, e entrar no bosque
    // apaga a lareira — que é o comportamento pedido.
    const lembrado = ambientesPorCena[cenaId] ?? [];

    set({
      cenaAtual: cenaId,
      // `startedAt` refeito: o instante gravado é de outra sessão, e um
      // ambiente que entra "atrasado dez horas" buscaria uma posição que não
      // existe. Ver o seek em `AmbienteAudio`.
      ambientes: lembrado.map((ambiente) => ({
        ...ambiente,
        startedAt: Date.now(),
      })),
    });
  },

  copiarCena(deId, paraId) {
    const lembrado = get().ambientesPorCena[deId];
    if (!lembrado || lembrado.length === 0) return;

    gravar(set, get, {
      ambientesPorCena: {
        ...get().ambientesPorCena,
        // Ids novos: os do original ficariam repetidos entre as duas cenas, e
        // apagar um pela lista apagaria o da outra junto.
        [paraId]: lembrado.map((ambiente) => ({ ...ambiente, id: novoId() })),
      },
    });
  },

  esquecerCena(cenaId) {
    const { [cenaId]: saiu, ...resto } = get().ambientesPorCena;
    if (!saiu) return;

    gravar(set, get, { ambientesPorCena: resto });
  },

  cortarSons() {
    set({ disparos: [] });
    trocarAmbientes(set, get, []);
  },
}));

/**
 * Aciona um som pelo TIPO do arquivo dele.
 *
 * Uma função para o pad e para a macro, e é o ponto: as duas são a mesma coisa
 * — um som guardado à mão — e a única diferença entre elas é ter tecla. Duas
 * cópias divergiriam no dia em que a trilha deixasse de alternar.
 *
 * O acervo é lido do store de assets, e não guardado no pad: ele tem o id, e o
 * tipo é do ARQUIVO. Copiá-lo para dentro do pad é o que havia antes, e era o
 * que deixava os dois discordarem — a mesma chuva sendo ambiente no acervo e
 * disparo no 7.
 *
 * Arquivo sem tipo não faz nada, e quem o guardou já sabe: o acervo e o seletor
 * mostram o som sem tipo desligado.
 */
function acionar(store: TrackStore, assetId: string, ganho: number): void {
  const tipo = useAssetsStore
    .getState()
    .audio.assets?.find((asset) => asset.id === assetId)?.tipoDeSom;

  if (tipo === "trilha") store.alternarTrilha(assetId);
  else if (tipo === "ambiente") store.alternar(assetId);
  else if (tipo === "disparo") store.disparar(assetId, ganho);
}

/** 0 a 1, sempre. */
function limitar(valor: number): number {
  return Math.max(0, Math.min(1, valor));
}

/**
 * Aplica uma mudança e grava o som inteiro.
 *
 * Grava tudo e não o campo que mudou porque o arquivo é um só: o Rust guarda
 * `trilha.json` opaco, então não existe gravação parcial para pedir a ele.
 */
function gravar(
  set: (partial: Partial<TrackStore>) => void,
  get: () => TrackStore,
  mudanca: Partial<SessionAudio>,
): void {
  set(mudanca);

  const { track, ambientes, ambientesPorCena, pads, macros } = get();

  void saveAudio({ track, ambientes, ambientesPorCena, pads, macros });
}

/**
 * Troca os ambientes acesos E o que a cena atual lembra deles.
 *
 * Os dois no mesmo lugar porque são o mesmo gesto: acender a lareira na taverna
 * É ensinar à taverna que ela tem lareira. Separar em "acender" e "salvar"
 * criaria a pergunta "salvou?" no meio da sessão, que é exatamente o tipo de
 * coisa que o mestre não deve ter de lembrar com a mesa esperando.
 */
function trocarAmbientes(
  set: (partial: Partial<TrackStore>) => void,
  get: () => TrackStore,
  ambientes: Ambiente[],
): void {
  const { cenaAtual, ambientesPorCena } = get();

  gravar(set, get, {
    ambientes,
    // Sem cena no ar não há o que lembrar, e gravar sob a chave `null` criaria
    // uma memória que nenhuma cena reclamaria depois.
    ambientesPorCena:
      cenaAtual === null
        ? ambientesPorCena
        : { ...ambientesPorCena, [cenaAtual]: ambientes },
  });
}
