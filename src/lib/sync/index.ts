"use client";

import type { SceneChannel } from "@/lib/sync/channel";
import {
  createPublisherChannel,
  createSubscriberChannel,
} from "@/lib/sync/server-channel";
import { daemonAddr } from "@/lib/vault/bridge";

/**
 * Monta o transporte da cena.
 *
 * Um só, e é o daemon. O `BroadcastChannel` saiu: ele alcançava apenas abas da
 * mesma máquina, e o daemon cobre esse caso pelo loopback com latência que não
 * se mede — manter os dois significaria dois caminhos para depurar em troca de
 * nada.
 *
 * O que ele resolve, e o broadcast não resolvia, é a razão de o Jogador
 * existir: o celular do jogador é outro aparelho.
 */
export function createPublisher(): SceneChannel {
  // O endereço vem por IPC e chega depois do primeiro render. O canal cuida
  // disso guardando o último estado pendente — ver `createPublisherChannel`.
  return createPublisherChannel(
    daemonAddr().then(({ url, token }) => ({ base: url, token })),
  );
}

/**
 * Espectador. `base` vazio é mesma origem, e é sempre o caso: quem serviu esta
 * página foi o próprio daemon.
 */
export function createSubscriber(codigo: string): SceneChannel {
  return createSubscriberChannel("", codigo);
}

export type { LiveState, SceneChannel } from "@/lib/sync/channel";
