"use client";

import { useEffect, useRef, useState } from "react";

import { createSceneChannel, type SceneChannel, type SceneChannelOptions } from "@/lib/sync";
import type { Scene } from "@/types/scene";

/**
 * Reenvio do pedido inicial.
 *
 * Broadcast não é persistido: um `scene:request` que chega antes de o Operador
 * terminar de se inscrever no canal simplesmente não existe para ele. Basta o
 * celular abrir primeiro, ou o socket do Operador ter reconectado. Sem reenvio,
 * o jogador espera para sempre por uma resposta que ninguém ouviu pedir.
 */
const REQUEST_RETRY_MS = 2500;

/**
 * Reanúncio periódico da cena.
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
 * Lado do Operador: anuncia a cena atual e responde a quem chega depois.
 * Sem responder ao `scene:request`, uma aba de Assistir aberta no meio da
 * sessão ficaria em branco até a próxima mudança de cena.
 */
export function useScenePublisher(
  scene: Scene | null,
  { local = false, roomId = null }: SceneChannelOptions,
): void {
  const channelRef = useRef<SceneChannel | null>(null);
  const sceneRef = useRef(scene);

  useEffect(() => {
    const channel = createSceneChannel({ local, roomId });
    channelRef.current = channel;

    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "scene:request") {
        channel.send({ type: "scene:update", scene: sceneRef.current });
      }
    });

    // A sala aparece depois da montagem (login anônimo é assíncrono), então
    // este efeito roda de novo com `roomId` preenchido. Republicar aqui
    // garante que o celular não espere a próxima mudança de cena.
    channel.send({ type: "scene:update", scene: sceneRef.current });

    return () => {
      unsubscribe();
      channel.close();
      channelRef.current = null;
    };
  }, [local, roomId]);

  useEffect(() => {
    sceneRef.current = scene;
    channelRef.current?.send({ type: "scene:update", scene });
  }, [scene]);

  useEffect(() => {
    const beat = setInterval(() => {
      channelRef.current?.send({ type: "scene:update", scene: sceneRef.current });
    }, HEARTBEAT_MS);

    return () => clearInterval(beat);
  }, []);
}

export type SceneSubscription = {
  scene: Scene | null;
  /** Já chegou alguma resposta do Operador. */
  synced: boolean;
  /** Passou tempo demais sem nenhuma resposta. */
  stalled: boolean;
};

/** Lado do espectador (Assistir e Plateia): só recebe. */
export function useSceneSubscription({
  local = false,
  roomId = null,
}: SceneChannelOptions): SceneSubscription {
  const [scene, setScene] = useState<Scene | null>(null);
  const [synced, setSynced] = useState(false);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const channel = createSceneChannel({ local, roomId });

    let answered = false;

    const unsubscribe = channel.subscribe((message) => {
      if (message.type !== "scene:update") return;

      answered = true;
      setScene(message.scene);
      setSynced(true);
      setStalled(false);
    });

    const ask = () => channel.send({ type: "scene:request" });
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

  return { scene, synced, stalled };
}
