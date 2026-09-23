"use client";

import {
  SCENE_BROADCAST_INTERVAL_MS,
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
 * Lado do espectador: recebe a cena por SSE.
 *
 * SSE e não WebSocket porque o fluxo é de mão única, o `EventSource` reconecta
 * sozinho quando o Wi-Fi oscila, e o pouco que o espectador manda para cima é
 * HTTP normal.
 */
export function createSubscriberChannel(
  base: string,
  codigo: string,
): SceneChannel {
  let source: EventSource | null = null;

  return {
    publish() {
      // Espectador não publica. A tela dele não tem controle nenhum, e um
      // caminho de escrita aqui seria superfície sem uso.
    },

    subscribe(handler) {
      const url = `${base}/sala/live?codigo=${encodeURIComponent(codigo)}`;
      source = new EventSource(url);

      source.onmessage = (event) => {
        try {
          const state = JSON.parse(event.data) as LiveState;
          handler({
            scene: state.scene ?? null,
            track: state.track ?? null,
            // As camadas de som, pela mesma razão dos retratos abaixo: quadro
            // de um Mestre anterior a elas é quadro válido, e não motivo para
            // a TV cair no meio da sessão.
            ambientes: state.ambientes ?? [],
            disparos: state.disparos ?? [],
            // Estado gravado por uma versão anterior pode não trazer o campo:
            // lista vazia é o certo, e não uma tela quebrada.
            portraits: state.portraits ?? [],
            // Quadro sem volume é de um Mestre anterior a ele sair de dentro
            // da faixa: o padrão é o estado certo, e não silêncio.
            volume: state.volume ?? DEFAULT_SESSION_VOLUME,
            spotlight: state.spotlight ?? null,
            // Mesma razão dos retratos: quadro de uma versão sem dados de
            // jogador é quadro válido, e não motivo para a tela cair.
            rolagens: state.rolagens ?? [],
          });
        } catch {
          // O daemon valida que é JSON antes de repassar, então isto só
          // acontece com quadro truncado. O próximo chega em 100ms.
        }
      };

      return () => {
        source?.close();
        source = null;
      };
    },

    close() {
      source?.close();
      source = null;
    },
  };
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

    if (response.status === 403)
      return { erro: "Código não confere com esta mesa." };
    if (response.status === 503) {
      return { erro: "O mestre ainda não abriu uma campanha." };
    }
    if (!response.ok)
      return { erro: "A mesa respondeu de um jeito inesperado." };

    return (await response.json()) as { nome: string };
  } catch {
    return {
      erro: "Não foi possível alcançar a mesa. Confira o Wi-Fi e o endereço.",
    };
  }
}
