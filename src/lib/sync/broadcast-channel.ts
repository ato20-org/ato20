import type { ChannelMessage, SceneChannel } from "@/lib/sync/channel";

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

  return {
    send(message) {
      channel.postMessage(message);
    },
    subscribe(handler) {
      const listener = (event: MessageEvent<ChannelMessage>) => handler(event.data);
      channel.addEventListener("message", listener);

      return () => channel.removeEventListener("message", listener);
    },
    close() {
      channel.close();
    },
  };
}
