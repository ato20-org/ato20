"use client";

import { getSupabase } from "@/lib/supabase/client";
import type { Portrait, SessionTrack } from "@/types/scene";

/** O que atravessa a troca de cena: elenco no ar e trilha escolhida. */
export type RoomSession = {
  portraits: Portrait[];
  track: SessionTrack | null;
  updatedAt: number;
};

/** `null` quando esta mesa nunca gravou estado de sessão. */
export async function loadRoomSession(roomId: string): Promise<RoomSession | null> {
  const { data, error } = await getSupabase()
    .from("room_session")
    .select("portraits, track, updated_at")
    .eq("room_id", roomId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    portraits: (data.portraits as Portrait[] | null) ?? [],
    track: (data.track as SessionTrack | null) ?? null,
    updatedAt: new Date(data.updated_at as string).getTime(),
  };
}

/**
 * Grava o estado de sessão.
 *
 * `upsert` simples, sem checagem de versão: a regra aqui é a última escrita
 * vencer. É a decisão registrada na 0008 — conflito de retrato custa um
 * arrasto para refazer, e uma tela de escolha cobraria mais que o dano.
 */
export async function saveRoomSession(
  roomId: string,
  portraits: Portrait[],
  track: SessionTrack | null,
): Promise<void> {
  const { error } = await getSupabase().from("room_session").upsert(
    {
      room_id: roomId,
      portraits,
      track,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "room_id" },
  );

  if (error) throw error;
}
