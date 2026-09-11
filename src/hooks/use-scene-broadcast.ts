"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { createPublisher, createSubscriber, type SceneChannel } from "@/lib/sync";
import type { LiveState } from "@/lib/sync/channel";
import { sceneForTable } from "@/lib/sync/for-table";
import type { RolagemDaMesa } from "@/types/dado";
import {
  DEFAULT_SESSION_VOLUME,
  type Medida,
  type Portrait,
  type Scene,
  type SessionTrack,
  type Spotlight,
} from "@/types/scene";

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

  /**
   * A cena sem os pontos de anotação do mestre.
   *
   * A remoção acontece AQUI, dentro do publicador, e não em quem o chama. A
   * diferença é o que separa uma decisão de um lembrete: no chamador, qualquer
   * caminho de publicação que alguém escreva depois vaza a preparação por
   * esquecimento; aqui, todo caminho passa por esta linha por construção.
   *
   * O `useMemo` não é otimização — é correção. O efeito abaixo compara a cena
   * por identidade para decidir se publica, e uma cópia nova a cada render
   * faria o Operador publicar 60 vezes por segundo com a mesa parada.
   */
  const scene = useMemo(() => sceneForTable(state.scene), [state.scene]);

  const stateRef = useRef({ ...state, scene });

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
    const paraMesa: LiveState = {
      scene,
      track: state.track,
      volume: state.volume,
      portraits: state.portraits,
      spotlight: state.spotlight,
      medida: state.medida,
      rolagens: state.rolagens,
    };

    stateRef.current = paraMesa;
    channelRef.current?.publish(paraMesa);
    // Dependências nos campos, não no objeto `state`: quem chama monta
    // `{ scene, track, volume, portraits, spotlight, medida }` a cada render, e
    // comparar essa embalagem fazia o Operador publicar enquanto montava a
    // PRÓXIMA cena — uma publicação por uma mudança que a mesa não vê.
  }, [
    scene,
    state.track,
    state.volume,
    state.portraits,
    state.spotlight,
    state.medida,
    state.rolagens,
  ]);

  useEffect(() => {
    const beat = setInterval(() => {
      channelRef.current?.publish(stateRef.current);
    }, HEARTBEAT_MS);

    return () => clearInterval(beat);
  }, []);
}

export type Subscription = {
  /** A cena como a mesa pode vê-la: sem os pontos de anotação do mestre. */
  scene: Scene | null;
  track: SessionTrack | null;
  /** Volume do som para esta tela, de 0 a 1. Quem regula é a mesa. */
  volume: number;
  portraits: Portrait[];
  /** Imagem em evidência sobre tudo. `null` = nenhuma. */
  spotlight: Spotlight | null;
  /** A medida em curso da régua, que a mesa acompanha. */
  medida: Medida | null;
  /** Os dados que os jogadores jogaram na mesa há pouco. Ver `LiveState`. */
  rolagens: RolagemDaMesa[];
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
  const [live, setLive] = useState<LiveState>({
    scene: null,
    track: null,
    volume: DEFAULT_SESSION_VOLUME,
    portraits: [],
    spotlight: null,
    medida: null,
    rolagens: [],
  });
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
    volume: live.volume,
    portraits: live.portraits,
    spotlight: live.spotlight,
    medida: live.medida,
    // O quadro de uma versão anterior não tem o campo: a lista vazia evita que
    // a tela caia enquanto o daemon ainda serve um bundle velho.
    rolagens: live.rolagens ?? [],
    synced,
    stalled,
  };
}
