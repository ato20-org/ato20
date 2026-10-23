"use client";

import { t } from "@/lib/i18n/jogador";
import {
  SCENE_BROADCAST_INTERVAL_MS,
  type EstadoDaConexao,
  type LiveState,
  type SceneChannel,
} from "@/lib/sync/channel";
import { createTrailingThrottle } from "@/lib/sync/throttle";
import { DEFAULT_SESSION_VOLUME } from "@/types/scene";

/**
 * Onde o daemon está, e com que segredo se escreve nele.
 *
 * `base` vazio significa mesma origem — é o caso do espectador, que recebeu
 * esta página do próprio daemon. O Mestre roda noutra origem (a webview) e
 * precisa do endereço absoluto.
 */
export type DaemonEndpoint = { base: string; token: string | null };

/**
 * Lado do Mestre: publica o estado no daemon.
 *
 * O endpoint chega como promessa porque a porta é efêmera e vem por IPC, e o
 * palco começa a publicar antes de essa resposta chegar. Em vez de o hook
 * esperar, o canal guarda **só o último** estado pendente e o solta quando o
 * endereço resolve — é a mesma regra do throttle, e pelo mesmo motivo: numa
 * publicação de cena o que importa é o estado atual, nunca a fila.
 */
export function createPublisherChannel(
  endpoint: Promise<DaemonEndpoint>,
): SceneChannel {
  let resolved: DaemonEndpoint | null = null;
  let pending: LiveState | null = null;
  let closed = false;

  void endpoint.then(
    (value) => {
      resolved = value;

      if (pending && !closed) {
        const state = pending;
        pending = null;
        void push(state);
      }
    },
    () => {
      // Sem daemon não há mesa. O Mestre continua editando e gravando no
      // disco; quem não vê nada é a TV, e é a TV que mostra isso.
    },
  );

  async function push(state: LiveState): Promise<void> {
    if (!resolved || closed) {
      pending = state;
      return;
    }

    try {
      await fetch(`${resolved.base}/sala/publicar`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(resolved.token ? { "x-ato20-token": resolved.token } : {}),
        },
        body: JSON.stringify(state),
        // A publicação é fogo-e-esquece a 10 Hz: uma que falhou não vale
        // retentativa, porque a próxima já traz um estado mais novo.
        keepalive: false,
      });
    } catch {
      // Ver acima.
    }
  }

  const throttled = createTrailingThrottle<LiveState>(
    SCENE_BROADCAST_INTERVAL_MS,
    (state) => void push(state),
  );

  return {
    publish(state) {
      throttled.run(state);
    },

    subscribe() {
      // O Mestre é a fonte: ele não escuta o próprio eco. Devolver um
      // cancelamento inerte deixa o hook de assinatura funcionar sem saber
      // disso.
      return () => {};
    },

    close() {
      closed = true;
      throttled.cancel();
    },
  };
}

/**
 * O quadro como chegou do daemon, com o padrão de cada campo que falta.
 *
 * ESPALHA o quadro inteiro, e só depois põe os padrões por cima do que veio
 * vazio. Era uma lista fixa de campos, remontada à mão, e todo campo novo do
 * `LiveState` precisava lembrar de entrar nela -- três esqueceram, e a TV e o
 * celular os perdiam em silêncio: as `fichas` (nome e medidores sobre os
 * tokens), os barramentos de volume e os `efeitos` das condições. O Mestre
 * publicava certo, o daemon repassava certo, e o campo morria aqui. Com o
 * espalhamento, campo novo atravessa sem ninguém lembrar dele; o que esta
 * função guarda são só os padrões, que continuam sendo decisão de cada campo.
 *
 * Função à parte, e não dentro do `onmessage`, para ser conferida sem
 * `EventSource` nenhum.
 */
export function quadroRecebido(state: Partial<LiveState>): LiveState {
  return {
    ...state,
    scene: state.scene ?? null,
    track: state.track ?? null,
    // As camadas de som, pela mesma razão dos retratos abaixo: quadro de um
    // Mestre anterior a elas é quadro válido, e não motivo para a TV cair no
    // meio da sessão.
    ambientes: state.ambientes ?? [],
    disparos: state.disparos ?? [],
    // Estado gravado por uma versão anterior pode não trazer o campo: lista
    // vazia é o certo, e não uma tela quebrada.
    portraits: state.portraits ?? [],
    // Quadro sem volume é de um Mestre anterior a ele sair de dentro da faixa:
    // o padrão é o estado certo, e não silêncio.
    volume: state.volume ?? DEFAULT_SESSION_VOLUME,
    spotlight: state.spotlight ?? null,
    // Mesma razão dos retratos: quadro de uma versão sem dados de jogador é
    // quadro válido, e não motivo para a tela cair.
    rolagens: state.rolagens ?? [],
    pings: state.pings ?? [],
  };
}

/**
 * O silêncio que o vigia tolera antes de dar o fluxo por morto.
 *
 * Com o daemon dizendo `vivo` a cada 5 s (ver `live` em `serve.rs`), doze
 * segundos são dois batimentos perdidos e folga. Sem o `vivo` -- daemon de uma
 * versão anterior, ou o binário velho no dev --, o único sinal periódico é o
 * reanúncio do Mestre, de 20 s (`HEARTBEAT_MS`), e o prazo tem de passar de dois
 * deles: senão o vigia derrubaria um fluxo saudável a cada cena parada.
 */
const SILENCIO_COM_BATIMENTO_MS = 12_000;
const SILENCIO_SEM_BATIMENTO_MS = 45_000;

/** De quanto em quanto o vigia olha o relógio. */
const VIGIA_MS = 2_000;

/** A espera antes de reabrir: dobra a cada tentativa, até o teto. A do fio do jogador. */
const ESPERA_INICIAL_MS = 1_000;
const ESPERA_MAXIMA_MS = 15_000;

/** Quanto a pergunta à sala espera. Com a rede meio morta, um `fetch` sem prazo não volta nunca. */
const PERGUNTA_MS = 5_000;

/**
 * Lado do espectador: recebe a cena por SSE.
 *
 * SSE e não WebSocket porque o fluxo é de mão única e o pouco que o espectador
 * manda para cima é HTTP normal.
 *
 * ## O vigia
 *
 * O `EventSource` reconecta sozinho, mas só quando a conexão fecha de verdade.
 * Ficam de fora os dois casos que a mesa vive:
 *
 * - **O fluxo que emudece sem fechar.** O Wi-Fi da TV cai e volta, o notebook
 *   dorme, o Tailscale troca de rota: o socket do lado de cá continua "aberto" e
 *   nunca mais recebe nada. Quem assiste só escuta, então não há escrita que
 *   falhe e denuncie -- a TV congela na última cena sem dizer nada. O vigia mede
 *   o silêncio: passou do prazo sem quadro nem `vivo`, fecha e abre de novo, e o
 *   daemon reidrata a tela com o estado atual na conexão.
 * - **A resposta que não é o fluxo.** O Mestre reabriu o app e ainda não abriu a
 *   campanha: o daemon responde 503. Para o `EventSource` toda resposta que não
 *   é o fluxo é definitiva, e ele desiste para sempre. Aqui a desistência vira
 *   pergunta (`situacaoDaSala`), e a resposta decide entre esperar e parar.
 *
 * E acorda na hora quando a tela volta a ser vista ou a rede volta: o relógio de
 * uma aba escondida anda a passos de minuto, e o celular que acende não pode
 * esperar o próximo passo para perceber que dormiu.
 */
export function createSubscriberChannel(
  base: string,
  codigo: string,
): SceneChannel {
  let desligar: (() => void) | null = null;

  return {
    publish() {
      // Espectador não publica. A tela dele não tem controle nenhum, e um
      // caminho de escrita aqui seria superfície sem uso.
    },

    subscribe(handler, aoMudarConexao) {
      const url = `${base}/sala/live?codigo=${encodeURIComponent(codigo)}`;
      let fonte: EventSource | null = null;
      let ultimoSinal = Date.now();
      // Do canal, e não da conexão: o daemon que mandou `vivo` uma vez manda
      // sempre, e esquecer isso a cada reconexão daria ao fluxo novo o prazo
      // longo justo quando ele acabou de cair.
      let comBatimento = false;
      let espera = ESPERA_INICIAL_MS;
      let religar: ReturnType<typeof setTimeout> | undefined;
      let estado: EstadoDaConexao | null = null;
      let desligado = false;

      const avisar = (novo: EstadoDaConexao) => {
        if (novo === estado) return;
        estado = novo;
        aoMudarConexao?.(novo);
      };

      const mudo = () =>
        Date.now() - ultimoSinal >
        (comBatimento ? SILENCIO_COM_BATIMENTO_MS : SILENCIO_SEM_BATIMENTO_MS);

      const abrir = () => {
        clearTimeout(religar);
        religar = undefined;
        fonte?.close();
        ultimoSinal = Date.now();

        const atual = new EventSource(url);
        fonte = atual;

        atual.onopen = () => {
          ultimoSinal = Date.now();
          espera = ESPERA_INICIAL_MS;
          avisar("no-ar");
        };

        atual.onmessage = (event) => {
          ultimoSinal = Date.now();
          try {
            handler(quadroRecebido(JSON.parse(event.data) as Partial<LiveState>));
          } catch {
            // O daemon valida que é JSON antes de repassar, então isto só
            // acontece com quadro truncado. O próximo chega em 100ms.
          }
        };

        // O batimento do daemon, num evento com nome: não passa pelo
        // `onmessage`, onde seria lido como quadro.
        atual.addEventListener("vivo", () => {
          ultimoSinal = Date.now();
          comBatimento = true;
        });

        atual.onerror = () => {
          if (atual !== fonte) return;

          // Ainda conectando: a conexão caiu depois de aberta, e o próprio
          // `EventSource` já está tentando de novo.
          if (atual.readyState !== EventSource.CLOSED) {
            avisar("reconectando");
            return;
          }

          // Fechado: o daemon respondeu, e não com o fluxo. O `EventSource`
          // desistiu; quem decide agora é a sala.
          atual.close();
          fonte = null;
          void perguntar();
        };
      };

      const perguntar = async () => {
        const situacao = await situacaoDaSala(base, codigo);
        if (desligado) return;

        if (situacao === "recusada") {
          avisar("recusado");
          return;
        }

        avisar(situacao === "fechada" ? "mesa-fechada" : "reconectando");
        religar = setTimeout(abrir, espera);
        espera = Math.min(espera * 2, ESPERA_MAXIMA_MS);
      };

      const vigia = setInterval(() => {
        // Sem fonte é a espera entre duas tentativas, ou a desistência: o
        // relógio da vez é o `religar`.
        if (fonte && mudo()) {
          avisar("reconectando");
          abrir();
        }
      }, VIGIA_MS);

      const acordar = () => {
        if (document.visibilityState === "hidden") return;

        if (religar !== undefined) {
          // A rede ou a tela acabaram de voltar: esperar o fim do recuo seria
          // perder justamente o momento em que a mesa voltou.
          espera = ESPERA_INICIAL_MS;
          abrir();
        } else if (fonte && (mudo() || estado === "reconectando")) {
          // Mudo, ou já caído e nas mãos do `EventSource` -- que tentaria de
          // novo no relógio dele, e não agora que a rede voltou.
          avisar("reconectando");
          abrir();
        }
      };

      window.addEventListener("online", acordar);
      document.addEventListener("visibilitychange", acordar);

      abrir();

      const parar = () => {
        desligado = true;
        clearInterval(vigia);
        clearTimeout(religar);
        window.removeEventListener("online", acordar);
        document.removeEventListener("visibilitychange", acordar);
        fonte?.close();
        fonte = null;
      };

      desligar?.();
      desligar = parar;

      return () => {
        parar();
        if (desligar === parar) desligar = null;
      };
    },

    close() {
      desligar?.();
      desligar = null;
    },
  };
}

/**
 * O que a sala responde agora, para quem já estava dentro e caiu.
 *
 * Irmã do `checkRoom`, que fala com quem está chegando: aquela devolve o texto
 * da porta, esta devolve a decisão do vigia. `fora` é a rede, não a mesa.
 */
async function situacaoDaSala(
  base: string,
  codigo: string,
): Promise<"aberta" | "fechada" | "recusada" | "fora"> {
  // À mão, e não `AbortSignal.timeout`: a TV da casa pode ser um navegador de
  // televisão de anos atrás, e esta é a página que ele abre.
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), PERGUNTA_MS);

  try {
    const response = await fetch(
      `${base}/sala?codigo=${encodeURIComponent(codigo)}`,
      { signal: controle.signal },
    );

    if (response.status === 403) return "recusada";
    if (response.status === 503) return "fechada";
    return response.ok ? "aberta" : "fora";
  } catch {
    return "fora";
  } finally {
    clearTimeout(prazo);
  }
}

/**
 * Confere o código da mesa antes de abrir o fluxo.
 *
 * Existe porque o `EventSource` não entrega o status da resposta ao
 * JavaScript: um 403 chegaria como `onerror` indistinguível de queda de rede, e
 * o próprio `EventSource` reconectaria em loop contra um código que nunca vai
 * passar. Aqui o `fetch` lê o status, e o nome que volta deixa o jogador
 * confirmar que entrou na mesa certa antes de a primeira cena chegar.
 */
export async function checkRoom(
  base: string,
  codigo: string,
): Promise<{ nome: string } | { erro: string }> {
  try {
    const response = await fetch(
      `${base}/sala?codigo=${encodeURIComponent(codigo)}`,
    );

    if (response.status === 403) return { erro: t.sala.codigoNaoConfere };
    if (response.status === 503) {
      return { erro: t.sala.semCampanha };
    }
    if (!response.ok) return { erro: t.sala.respostaInesperada };

    return (await response.json()) as { nome: string };
  } catch {
    return { erro: t.sala.inalcancavel };
  }
}
