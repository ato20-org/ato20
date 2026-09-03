import type { ChannelMessage, SceneChannel } from "@/lib/sync/channel";

/**
 * Um canal que fala em vários meios ao mesmo tempo.
 *
 * O Operador usa isto para alimentar `BroadcastChannel` e Supabase Realtime
 * na mesma chamada: a visão Assistir na própria máquina continua instantânea
 * e de graça, e os celulares recebem pela rede — sem o playground saber que
 * existem dois transportes.
 */
export function createCompositeSceneChannel(parts: SceneChannel[]): SceneChannel {
  return {
    send(message: ChannelMessage) {
      for (const part of parts) part.send(message);
    },

    subscribe(handler) {
      const unsubscribes = parts.map((part) => part.subscribe(handler));

      return () => {
        for (const unsubscribe of unsubscribes) unsubscribe();
      };
    },

    close() {
      for (const part of parts) part.close();
    },
  };
}
