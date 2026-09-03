import { createBroadcastSceneChannel } from "@/lib/sync/broadcast-channel";
import type { SceneChannel } from "@/lib/sync/channel";
import { createCompositeSceneChannel } from "@/lib/sync/composite-channel";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createSupabaseSceneChannel } from "@/lib/sync/supabase-channel";

export type SceneChannelOptions = {
  /** Abas da mesma máquina, via `BroadcastChannel`. Grátis e instantâneo. */
  local?: boolean;
  /** Sala do Supabase, para os celulares. `null` enquanto não há sala. */
  roomId?: string | null;
};

/**
 * Monta o transporte da cena.
 *
 * - Operador: `local` + `roomId` — alimenta a TV e os celulares de uma vez.
 * - Assistir: só `local` — está na mesma máquina, não precisa de rede.
 * - Plateia: só `roomId` — está noutro aparelho.
 */
export function createSceneChannel({
  local = false,
  roomId = null,
}: SceneChannelOptions): SceneChannel {
  const parts: SceneChannel[] = [];

  if (local) parts.push(createBroadcastSceneChannel());
  if (roomId && isSupabaseConfigured()) parts.push(createSupabaseSceneChannel(roomId));

  // Um só transporte dispensa a indireção; zero devolve um canal inerte, que
  // é o comportamento certo antes de a sala existir.
  return parts.length === 1 ? parts[0] : createCompositeSceneChannel(parts);
}

export type { ChannelMessage, SceneChannel } from "@/lib/sync/channel";
