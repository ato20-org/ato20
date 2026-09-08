"use client";

import { getSupabase } from "@/lib/supabase/client";
import { DEFAULT_SESSION_VOLUME, type Portrait, type SessionTrack } from "@/types/scene";

/** O que atravessa a troca de cena: elenco no ar, trilha escolhida e volume. */
export type RoomSession = {
  portraits: Portrait[];
  track: SessionTrack | null;
  /** Volume do som da mesa, de 0 a 1. Ver a 0009. */
  volume: number;
  updatedAt: number;
};

/** `null` quando esta mesa nunca gravou estado de sessão. */
export async function loadRoomSession(roomId: string): Promise<RoomSession | null> {
  const { data, error } = await getSupabase()
    .from("room_session")
    .select("portraits, track, volume, updated_at")
    .eq("room_id", roomId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const track = (data.track as SessionTrack | null) ?? null;

  return {
    portraits: (data.portraits as Portrait[] | null) ?? [],
    track,
    // Linha gravada antes da 0009 guardava o ganho dentro da faixa. Ler de lá
    // evita que a outra máquina do mestre veja o som saltar para o padrão.
    volume: (data.volume as number | null) ?? legacyVolume(track) ?? DEFAULT_SESSION_VOLUME,
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
  volume: number,
): Promise<void> {
  const { error } = await getSupabase().from("room_session").upsert(
    {
      room_id: roomId,
      portraits,
      track,
      volume,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "room_id" },
  );

  if (error) throw error;
}

/** Linha gravada antes da 0009, com o ganho dentro do jsonb da faixa. */
function legacyVolume(track: SessionTrack | null): number | null {
  const volume = (track as (SessionTrack & { volume?: unknown }) | null)?.volume;

  return typeof volume === "number" ? volume : null;
}
