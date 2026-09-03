"use client";

import { getSupabase } from "@/lib/supabase/client";
import type { ChannelMessage, SceneChannel } from "@/lib/sync/channel";
import { createTrailingThrottle } from "@/lib/sync/throttle";

const BROADCAST_EVENT = "scene";

/**
 * 10 Hz. Arrastar um item gera ~60 mudanças de estado por segundo, e o plano
 * gratuito do Supabase conta mensagens de realtime por mês — publicar cada
 * frame estouraria a cota numa única sessão. 10 Hz é suave para quem assiste
 * e cabe com folga.
 */
export const SCENE_BROADCAST_INTERVAL_MS = 100;

/**
 * Transporte de rede da cena: broadcast do Supabase Realtime, um canal por
 * sala.
 *
 * Broadcast e não Postgres Changes de propósito — a cena é estado efêmero de
 * sessão. Gravá-la numa tabela a cada movimento pagaria escrita em disco por
 * pixel arrastado, sem ninguém precisar do histórico.
 */
export function createSupabaseSceneChannel(roomId: string): SceneChannel {
  const supabase = getSupabase();
  const handlers = new Set<(message: ChannelMessage) => void>();

  const channel = supabase.channel(`scene:${roomId}`, {
    // Sem isto o emissor recebe o próprio eco, e o Operador reagiria à cena
    // que ele mesmo acabou de publicar. `BroadcastChannel` já se comporta
    // assim nativamente; aqui é preciso pedir.
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: BROADCAST_EVENT }, ({ payload }) => {
    for (const handler of handlers) handler(payload as ChannelMessage);
  });

  function push(message: ChannelMessage) {
    void channel.send({ type: "broadcast", event: BROADCAST_EVENT, payload: message });
  }

  const throttled = createTrailingThrottle<ChannelMessage>(SCENE_BROADCAST_INTERVAL_MS, push);

  // `subscribe()` é assíncrono. O que for enviado antes de o socket estar
  // pronto se perderia, e o primeiro `live:update` do Operador é exatamente
  // um desses.
  let subscribed = false;
  const queue: ChannelMessage[] = [];

  channel.subscribe((status) => {
    subscribed = status === "SUBSCRIBED";
    if (!subscribed) return;

    while (queue.length > 0) push(queue.shift()!);
  });

  return {
    send(message) {
      if (!subscribed) {
        queue.push(message);
        return;
      }

      // `live:request` é o aperto de mão de quem acabou de abrir a tela.
      // Passar pelo throttle atrasaria a primeira imagem em até 100 ms sem
      // motivo, e ele acontece uma vez só.
      if (message.type === "live:request") {
        push(message);
        return;
      }

      throttled.run(message);
    },

    subscribe(handler) {
      handlers.add(handler);

      return () => {
        handlers.delete(handler);
      };
    },

    close() {
      throttled.cancel();
      handlers.clear();
      void supabase.removeChannel(channel);
    },
  };
}
