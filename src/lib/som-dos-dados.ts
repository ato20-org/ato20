import { CHAVE_DO_SOM_DOS_DADOS } from "@/lib/configuracoes/som-dos-dados";
import { valorDe } from "@/lib/configuracoes/registro";
import { duracaoDaQueda, primeiraBatida } from "@/lib/geometry/dado";
import { outputVolume } from "@/lib/store/use-audio-store";
import { usePreferenciasStore } from "@/lib/store/use-preferencias-store";

/**
 * As jogadas gravadas, uma em cada vaga de `VAGA` segundos, com o primeiro
 * impacto em `ATAQUE`. Saem de `scripts/cortar-jogadas-de-dado.mjs`, que usa os
 * mesmos dois números: mudar um lado sem o outro desalinha o som do dado na
 * tela. Quantas jogadas há sai da duração do arquivo.
 */
const ARQUIVO = "/sons/jogadas-de-dado.ogg";
const VAGA = 0.9;
const ATAQUE = 0.06;

/** Volume da jogada e do plim, antes do fader Sistema. */
const NIVEL_DA_JOGADA = 0.7;
const NIVEL_DO_PLIM = 0.18;

/**
 * Quanto atraso ainda vale tocar, em segundos.
 *
 * O arquivo é lido na primeira vez, e um dado lançado antes de ele chegar
 * perderia a batida. Tocar meio segundo depois do impacto soa como outro dado;
 * cem milissegundos ainda soam como este.
 */
const ATRASO_ACEITO = 0.1;

/** Dois plins mais perto que isto viram um: três dados pousando juntos são um pouso. */
const PLINS_JUNTOS = 0.12;

/**
 * Depois de quanto silêncio o contexto dorme, em milissegundos.
 *
 * Um `AudioContext` acordado mantém a thread de áudio rodando, e no WebKitGTK
 * isso é um pipeline do GStreamer aberto. A mesa rola dado de vez em quando, e
 * acordar custa poucos milissegundos, menos que o tempo até a primeira batida.
 */
const SONO_MS = 10_000;

let contexto: AudioContext | null = null;
let jogadas: Promise<AudioBuffer | null> | null = null;
let ultimaJogada = -1;
let ultimoPlim = -Infinity;
let sono: ReturnType<typeof setTimeout> | undefined;

/**
 * Lê e decodifica as jogadas uma vez. Chamar cedo poupa a primeira rolagem de
 * esperar o arquivo.
 *
 * Num `OfflineAudioContext`, que não abre saída de som: o buffer serve para o
 * contexto de verdade, que só nasce no primeiro dado.
 */
export function prepararSomDosDados(): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === "undefined") return Promise.resolve(null);

  jogadas ??= fetch(ARQUIVO)
    .then((resposta) => {
      if (!resposta.ok) throw new Error(String(resposta.status));
      return resposta.arrayBuffer();
    })
    .then((bytes) => new OfflineAudioContext(1, 1, 48_000).decodeAudioData(bytes))
    .catch(() => {
      // Sem arquivo o dado cai calado. Esquecer a promessa deixa a próxima
      // rolagem tentar de novo.
      jogadas = null;
      return null;
    });

  return jogadas;
}

/**
 * O som de um dado caindo: uma jogada gravada no primeiro impacto e um plim
 * quando ele pousa.
 *
 * `inicio` é quando a queda começou, em `Date.now()`, e o dado diz quanto ela
 * dura pelo impulso: os instantes saem da mesma física que desenha. Uma
 * jogada sorteada por dado, nunca a mesma duas vezes seguidas, e com a
 * velocidade variando um pouco, para dez dados não soarem como um repetido.
 */
export function tocarQueda(
  inicio: number,
  dado: { impulso: { x: number; y: number } },
): void {
  if (valorDe(CHAVE_DO_SOM_DOS_DADOS) === false) return;

  const volume = outputVolume(usePreferenciasStore.getState().volumeSistema);
  if (volume === 0) return;

  const ctx = acordar();
  if (!ctx) return;

  const batida = inicio + primeiraBatida(dado) * 1000;
  const pouso = inicio + duracaoDaQueda(dado) * 1000;

  void prepararSomDosDados().then((buffer) => {
    if (!buffer) {
      adormecerDepois(0);
      return;
    }

    const agora = Date.now();
    const quantas = Math.max(1, Math.round(buffer.duration / VAGA));

    let vaga = Math.floor(Math.random() * quantas);
    if (quantas > 1 && vaga === ultimaJogada) vaga = (vaga + 1) % quantas;
    ultimaJogada = vaga;

    const ritmo = 0.94 + Math.random() * 0.12;
    // Quando a vaga tem de começar para o impacto dela cair na batida.
    const comeco = (batida - agora) / 1000 - ATAQUE / ritmo;

    if (comeco > -ATRASO_ACEITO) {
      const pulo = Math.max(0, -comeco) * ritmo;
      const fonte = ctx.createBufferSource();
      fonte.buffer = buffer;
      fonte.playbackRate.value = ritmo;

      const ganho = ctx.createGain();
      ganho.gain.value = volume * NIVEL_DA_JOGADA * (0.85 + Math.random() * 0.15);

      fonte.connect(ganho).connect(ctx.destination);
      fonte.start(ctx.currentTime + Math.max(0, comeco), vaga * VAGA + pulo, VAGA - pulo);
    }

    const quandoPousa = (pouso - agora) / 1000;
    if (quandoPousa > -ATRASO_ACEITO) {
      const instante = ctx.currentTime + Math.max(0, quandoPousa);
      if (Math.abs(instante - ultimoPlim) >= PLINS_JUNTOS) {
        ultimoPlim = instante;
        plim(ctx, instante, volume);
      }
    }

    adormecerDepois(Math.max(0, pouso - agora));
  });
}

/**
 * Um plim curto: dois senos, o segundo uma quinta acima e um pouco depois,
 * cada um sumindo sozinho. Sintetizado, sem arquivo.
 */
function plim(ctx: AudioContext, quando: number, volume: number): void {
  for (const [frequencia, atraso] of [
    [1318.5, 0],
    [1975.5, 0.05],
  ]) {
    const inicio = quando + atraso;
    const tom = ctx.createOscillator();
    tom.type = "sine";
    tom.frequency.value = frequencia;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, inicio);
    envelope.gain.linearRampToValueAtTime(volume * NIVEL_DO_PLIM, inicio + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.3);

    tom.connect(envelope).connect(ctx.destination);
    tom.start(inicio);
    tom.stop(inicio + 0.32);
  }
}

/** O contexto, criado no primeiro dado e acordado se estava dormindo. */
function acordar(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;

  contexto ??= new AudioContext();
  clearTimeout(sono);
  if (contexto.state === "suspended") void contexto.resume().catch(() => {});

  return contexto;
}

function adormecerDepois(ms: number): void {
  clearTimeout(sono);
  sono = setTimeout(() => {
    void contexto?.suspend().catch(() => {});
  }, ms + SONO_MS);
}
