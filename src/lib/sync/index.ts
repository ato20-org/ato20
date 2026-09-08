import { createBroadcastSceneChannel } from "@/lib/sync/broadcast-channel";
import type { SceneChannel } from "@/lib/sync/channel";

/**
 * Monta o transporte da cena.
 *
 * Um transporte só, agora: `BroadcastChannel`, que alcança abas da MESMA
 * máquina. É o que o Operador e o Assistir usam quando a TV é uma aba do
 * próprio computador do mestre.
 *
 * O composto de dois transportes saiu junto com o Supabase, e com ele a
 * indireção que existia para o playground não saber quantos havia. O que
 * substitui o alcance de rede é o SSE do daemon, que entra no passo seguinte —
 * até lá, a Plateia num outro aparelho não recebe cena.
 */
export function createSceneChannel(): SceneChannel {
  return createBroadcastSceneChannel();
}

export type { ChannelMessage, SceneChannel } from "@/lib/sync/channel";
