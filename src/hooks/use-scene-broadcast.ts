"use client";

import { useEffect, useRef, useState } from "react";

import { createPublisher, createSubscriber, type SceneChannel } from "@/lib/sync";
import type { LiveState } from "@/lib/sync/channel";
import type { Portrait, Scene, SessionTrack } from "@/types/scene";

/**
 * Reanúncio periódico do estado.
 *
 * Cobre o espectador que perdeu a conexão e voltou: o `EventSource` reconecta
 * sozinho e o daemon o reidrata com o último estado, então este batimento é
 * cinto de segurança para o caso de o próprio daemon ter reiniciado e estar com
 * a memória vazia.
 */
const HEARTBEAT_MS = 20_000;

/** Depois disso, o silêncio deixa de ser espera normal e passa a ser problema. */
const STALLED_AFTER_MS = 12_000;

/**
 * Lado do Operador: publica cena, trilha e retratos.
 *
 * O `live:request` saiu, e com ele a resposta a quem chega depois: o daemon
 * guarda o último estado publicado e o entrega na conexão. Uma aba de Assistir
 * aberta no meio da sessão já nasce sincronizada, sem o Operador saber que ela
 * existe.
 */
export function usePublisher(state: LiveState): void {
  const channelRef = useRef<SceneChannel | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    const channel = createPublisher();
    channelRef.current = channel;

    channel.publish(stateRef.current);

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    stateRef.current = state;
    channelRef.current?.publish(state);
    // Dependências no conteúdo, não no objeto: quem chama monta `{ scene,
    // track, portraits }` a cada render, e comparar essa embalagem fazia o
    // Operador publicar enquanto montava a PRÓXIMA cena — uma publicação por
    // uma mudança que a mesa não vê.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scene, state.track, state.portraits]);

  useEffect(() => {
    const beat = setInterval(() => {
      channelRef.current?.publish(stateRef.current);
    }, HEARTBEAT_MS);

    return () => clearInterval(beat);
  }, []);
}

export type Subscription = {
  scene: Scene | null;
  track: SessionTrack | null;
  portraits: Portrait[];
  /** Já chegou alguma coisa do daemon. */
  synced: boolean;
  /** Passou tempo demais sem nada. */
  stalled: boolean;
};

/**
 * Lado do espectador (Assistir e Plateia): só recebe.
 *
 * O código da mesa vem da porta, já conferido — ver `checkRoom`. Ele entra na
 * URL do SSE porque é o daemon que decide quem pode ouvir.
 */
export function useSubscription(codigo: string): Subscription {
  const [live, setLive] = useState<LiveState>({ scene: null, track: null, portraits: [] });
  const [synced, setSynced] = useState(false);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const channel = createSubscriber(codigo);

    let answered = false;

    const unsubscribe = channel.subscribe((state) => {
      answered = true;
      setLive(state);
      setSynced(true);
      setStalled(false);
    });

    // Sem pedido nem reenvio: o daemon manda o estado atual na conexão. O que
    // resta é o relógio que distingue "esperando" de "algo está errado".
    const stall = setTimeout(() => {
      if (!answered) setStalled(true);
    }, STALLED_AFTER_MS);

    return () => {
      clearTimeout(stall);
      unsubscribe();
      channel.close();
    };
  }, [codigo]);

  return {
    scene: live.scene,
    track: live.track,
    portraits: live.portraits,
    synced,
    stalled,
  };
}
