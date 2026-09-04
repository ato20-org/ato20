import {
  SCENE_BROADCAST_INTERVAL_MS,
  type ChannelMessage,
  type SceneChannel,
} from "@/lib/sync/channel";
import { createTrailingThrottle } from "@/lib/sync/throttle";

// Identificador do canal, não nome de produto. Mantido junto de `DB_NAME`
// para as duas chaves de armazenamento local não divergirem.
const CHANNEL_NAME = "rpg-show:scene";

/** Canal inerte para quando não há `BroadcastChannel` (SSR, browser antigo). */
const noopChannel: SceneChannel = {
  send: () => {},
  subscribe: () => () => {},
  close: () => {},
};

/**
 * Transporte da Fase 1: mesma máquina, abas diferentes. Cobre o Operador
 * dirigindo a visão Assistir num segundo monitor ou saída HDMI, sem backend.
 *
 * `BroadcastChannel` não entrega a mensagem para quem a enviou, então o
 * Operador não escuta o próprio eco.
 */
export function createBroadcastSceneChannel(): SceneChannel {
  if (typeof BroadcastChannel === "undefined") return noopChannel;

  const channel = new BroadcastChannel(CHANNEL_NAME);

  function push(message: ChannelMessage) {
    channel.postMessage(message);
  }

  /**
   * Mesma cadência da rede, e pelo mesmo motivo do lado de quem assiste: a TV
   * interpola entre as amostras, então publicar 60 por segundo só pagaria uma
   * cópia estruturada do board inteiro por frame para produzir a mesma imagem.
   *
   * Vira também uma garantia de comportamento: a TV na máquina do mestre e o
   * celular do jogador passam a receber no mesmo ritmo, em vez de a primeira
   * ter um movimento que o segundo nunca vê.
   */
  const throttled = createTrailingThrottle<ChannelMessage>(SCENE_BROADCAST_INTERVAL_MS, push);

  return {
    send(message) {
      // O aperto de mão de quem acabou de abrir a tela não passa pelo
      // throttle: ele acontece uma vez e atrasá-lo seria atrasar a primeira
      // imagem.
      if (message.type === "live:request") {
        push(message);
        return;
      }

      throttled.run(message);
    },
    subscribe(handler) {
      const listener = (event: MessageEvent<ChannelMessage>) => handler(event.data);
      channel.addEventListener("message", listener);

      return () => channel.removeEventListener("message", listener);
    },
    close() {
      throttled.cancel();
      channel.close();
    },
  };
}
