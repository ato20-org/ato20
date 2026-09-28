"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  createPublisher,
  createSubscriber,
  type SceneChannel,
} from "@/lib/sync";
import type { LiveState } from "@/lib/sync/channel";
import { sceneForTable } from "@/lib/sync/for-table";
import type { RolagemDaMesa } from "@/types/dado";
import {
  type Ambiente,
  DEFAULT_SESSION_VOLUME,
  type Disparo,
  type FichaNaCena,
  type Portrait,
  type Scene,
  type SessionTrack,
  type Spotlight,
  VOLUME_DE_CATEGORIA_PADRAO,
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
 * Lado do Mestre: publica cena, trilha e retratos.
 *
 * O `live:request` saiu, e com ele a resposta a quem chega depois: o daemon
 * guarda o último estado publicado e o entrega na conexão. Uma aba de Espectador
 * aberta no meio da sessão já nasce sincronizada, sem o Mestre saber que ela
 * existe.
 *
 * `pronto` falso CALA o Mestre: nada é publicado e o daemon segue entregando o
 * último quadro que recebeu. Existe porque este canal não tem como dizer
 * "estou carregando" -- todo campo tem um valor de vazio que a mesa lê como
 * ausência, e publicar meio estado apaga da TV o que ela estava mostrando. Quem
 * chama decide quando sabe o suficiente para falar.
 */
export function usePublisher(state: LiveState, pronto = true): void {
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
   * faria o Mestre publicar 60 vezes por segundo com a mesa parada.
   */
  const scene = useMemo(() => sceneForTable(state.scene), [state.scene]);

  const stateRef = useRef({ ...state, scene });

  useEffect(() => {
    const channel = createPublisher();
    channelRef.current = channel;

    // Sem publicar aqui. O efeito abaixo roda no MESMO commit, logo depois
    // deste, e manda o quadro montado na hora -- este mandava o mesmo estado
    // uma vez a mais. Tirá-lo é o que deixa a criação do canal sem depender do
    // `pronto`: o canal nasce uma vez, e quem decide se há o que dizer é quem
    // publica.
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const paraMesa: LiveState = {
      scene,
      track: state.track,
      ambientes: state.ambientes,
      disparos: state.disparos,
      volume: state.volume,
      volumeTrilha: state.volumeTrilha,
      volumeAmbiente: state.volumeAmbiente,
      volumeDisparo: state.volumeDisparo,
      portraits: state.portraits,
      fichas: state.fichas,
      spotlight: state.spotlight,
      rolagens: state.rolagens,
    };

    stateRef.current = paraMesa;

    // Calado enquanto `pronto` é falso. Não é atraso: é a diferença entre "a
    // mesa não tem nada" e "eu ainda não sei o que a mesa tem", e o quadro só
    // sabe dizer a primeira. O daemon guarda o último que recebeu e continua
    // entregando ele a quem conectar. Ver quem passa o sinalizador.
    if (pronto) channelRef.current?.publish(paraMesa);
    // Dependências nos campos, não no objeto `state`: quem chama monta a
    // embalagem a cada render, e compará-la fazia o Mestre publicar enquanto
    // montava a PRÓXIMA cena — uma publicação por uma mudança que a mesa não
    // vê.
  }, [
    pronto,
    scene,
    state.track,
    state.ambientes,
    state.disparos,
    state.volume,
    state.volumeTrilha,
    state.volumeAmbiente,
    state.volumeDisparo,
    state.portraits,
    state.fichas,
    state.spotlight,
    state.rolagens,
  ]);

  useEffect(() => {
    const beat = setInterval(() => {
      if (pronto) channelRef.current?.publish(stateRef.current);
    }, HEARTBEAT_MS);

    return () => clearInterval(beat);
  }, [pronto]);
}

export type Subscription = {
  /** A cena como a mesa pode vê-la: sem os pontos de anotação do mestre. */
  scene: Scene | null;
  track: SessionTrack | null;
  /** Os ambientes acesos. Ver `Ambiente`. */
  ambientes: Ambiente[];
  /** Os efeitos que soaram há pouco. Ver `Disparo`. */
  disparos: Disparo[];
  /** Volume do som para esta tela, de 0 a 1. Quem regula é a mesa. */
  volume: number;
  /** Os barramentos de trilha, ambiente e disparo. Ver `LiveState`. */
  volumeTrilha: number;
  volumeAmbiente: number;
  volumeDisparo: number;
  portraits: Portrait[];
  /** Nome e medidores sobre a cabeça dos tokens. Ver `LiveState.fichas`. */
  fichas: FichaNaCena[];
  /** Imagem em evidência sobre tudo. `null` = nenhuma. */
  spotlight: Spotlight | null;
  /** Os dados que os jogadores jogaram na mesa há pouco. Ver `LiveState`. */
  rolagens: RolagemDaMesa[];
  /** Já chegou alguma coisa do daemon. */
  synced: boolean;
  /** Passou tempo demais sem nada. */
  stalled: boolean;
};

/**
 * Lado do espectador (Espectador e Jogador): só recebe.
 *
 * O código da mesa vem da porta, já conferido — ver `checkRoom`. Ele entra na
 * URL do SSE porque é o daemon que decide quem pode ouvir.
 */
export function useSubscription(codigo: string, base = ""): Subscription {
  const [live, setLive] = useState<LiveState>({
    scene: null,
    track: null,
    ambientes: [],
    disparos: [],
    volume: DEFAULT_SESSION_VOLUME,
    volumeTrilha: VOLUME_DE_CATEGORIA_PADRAO,
    volumeAmbiente: VOLUME_DE_CATEGORIA_PADRAO,
    volumeDisparo: VOLUME_DE_CATEGORIA_PADRAO,
    portraits: [],
    spotlight: null,
    rolagens: [],
  });
  const [synced, setSynced] = useState(false);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const channel = createSubscriber(codigo, base);

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
  }, [codigo, base]);

  return {
    scene: live.scene,
    track: live.track,
    // Mesmo `?? []` de `rolagens`, e pela mesma razão: o quadro de uma versão
    // anterior não traz estes campos, e a TV não pode cair porque o daemon
    // ainda serve um bundle velho.
    ambientes: live.ambientes ?? [],
    disparos: live.disparos ?? [],
    volume: live.volume,
    // Mesmo `??` dos ambientes: o quadro de uma versão anterior não traz os
    // barramentos, e lê-los como 0 deixaria a TV muda por causa do bundle.
    volumeTrilha: live.volumeTrilha ?? VOLUME_DE_CATEGORIA_PADRAO,
    volumeAmbiente: live.volumeAmbiente ?? VOLUME_DE_CATEGORIA_PADRAO,
    volumeDisparo: live.volumeDisparo ?? VOLUME_DE_CATEGORIA_PADRAO,
    portraits: live.portraits,
    // Mesmo `?? []` dos ambientes: quadro de versão anterior não traz o campo.
    fichas: live.fichas ?? [],
    spotlight: live.spotlight,
    rolagens: live.rolagens ?? [],
    synced,
    stalled,
  };
}
