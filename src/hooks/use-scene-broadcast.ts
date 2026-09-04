"use client";

import { useEffect, useRef, useState } from "react";

import { createSceneChannel, type SceneChannel, type SceneChannelOptions } from "@/lib/sync";
import type { LiveState } from "@/lib/sync/channel";
import type { Portrait, Scene, SessionTrack } from "@/types/scene";

/**
 * Reenvio do pedido inicial.
 *
 * Broadcast não é persistido: um `live:request` que chega antes de o Operador
 * terminar de se inscrever no canal simplesmente não existe para ele. Basta o
 * celular abrir primeiro, ou o socket do Operador ter reconectado. Sem reenvio,
 * o jogador espera para sempre por uma resposta que ninguém ouviu pedir.
 */
const REQUEST_RETRY_MS = 2500;

/**
 * Reanúncio periódico do estado.
 *
 * Cobre o caso em que o espectador já recebeu algo e depois perdeu o socket: o
 * Supabase reconecta sozinho, mas ninguém pede de novo, e a tela ficaria
 * parada numa cena velha sem dar sinal. A 20s são ~3 mensagens por minuto,
 * desprezível contra a cota mensal.
 */
const HEARTBEAT_MS = 20_000;

/** Depois disso, o silêncio deixa de ser espera normal e passa a ser problema. */
const STALLED_AFTER_MS = 12_000;

/**
 * Lado do Operador: anuncia cena e trilha, e responde a quem chega depois.
 * Sem responder ao `live:request`, uma aba de Assistir aberta no meio da
 * sessão ficaria em branco até a próxima mudança.
 */
export function usePublisher(
  state: LiveState,
  { local = false, roomId = null }: SceneChannelOptions,
): void {
  const channelRef = useRef<SceneChannel | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    const channel = createSceneChannel({ local, roomId });
    channelRef.current = channel;

    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "live:request") {
        channel.send({ type: "live:update", ...stateRef.current });
      }
    });

    // A sala aparece depois da montagem (login anônimo é assíncrono), então
    // este efeito roda de novo com `roomId` preenchido. Republicar aqui
    // garante que o celular não espere a próxima mudança.
    channel.send({ type: "live:update", ...stateRef.current });

    return () => {
      unsubscribe();
      channel.close();
      channelRef.current = null;
    };
  }, [local, roomId]);

  useEffect(() => {
    stateRef.current = state;
    channelRef.current?.send({ type: "live:update", ...state });
    // Dependências no conteúdo, não no objeto: quem chama monta `{ scene,
    // track }` a cada render, e comparar essa embalagem fazia o Operador
    // publicar enquanto montava a PRÓXIMA cena — mensagem de rede, e cota, por
    // uma mudança que a mesa não vê.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scene, state.track, state.portraits]);

  useEffect(() => {
    const beat = setInterval(() => {
      channelRef.current?.send({ type: "live:update", ...stateRef.current });
    }, HEARTBEAT_MS);

    return () => clearInterval(beat);
  }, []);
}

export type Subscription = {
  scene: Scene | null;
  track: SessionTrack | null;
  portraits: Portrait[];
  /** Já chegou alguma resposta do Operador. */
  synced: boolean;
  /** Passou tempo demais sem nenhuma resposta. */
  stalled: boolean;
};

/** Lado do espectador (Assistir e Plateia): só recebe. */
export function useSubscription({
  local = false,
  roomId = null,
}: SceneChannelOptions): Subscription {
  const [live, setLive] = useState<LiveState>({ scene: null, track: null, portraits: [] });
  const [synced, setSynced] = useState(false);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const channel = createSceneChannel({ local, roomId });

    let answered = false;

    const unsubscribe = channel.subscribe((message) => {
      if (message.type !== "live:update") return;

      answered = true;
      setLive({
        scene: message.scene,
        track: message.track,
        // Mensagem de uma versão anterior não traz o campo: lista vazia é o
        // estado certo, e não uma tela quebrada.
        portraits: message.portraits ?? [],
      });
      setSynced(true);
      setStalled(false);
    });

    const ask = () => channel.send({ type: "live:request" });
    ask();

    const retry = setInterval(() => {
      if (answered) {
        clearInterval(retry);
        return;
      }

      ask();
    }, REQUEST_RETRY_MS);

    const stall = setTimeout(() => {
      if (!answered) setStalled(true);
    }, STALLED_AFTER_MS);

    return () => {
      clearInterval(retry);
      clearTimeout(stall);
      unsubscribe();
      channel.close();
    };
  }, [local, roomId]);

  return {
    scene: live.scene,
    track: live.track,
    portraits: live.portraits,
    synced,
    stalled,
  };
}
