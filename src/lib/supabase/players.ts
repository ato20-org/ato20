"use client";

import { currentUserId, ensureAnonSession } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";

export type PlayerRow = {
  room_id: string;
  user_id: string;
  /** Nome que o próprio jogador escolheu. */
  name: string;
  /** Apelido que o mestre deu a esse jogador. Só o mestre escreve. */
  master_label: string;
  notes: string;
  updated_at: string;
};

const COLUMNS = "room_id, user_id, name, master_label, notes, updated_at";

/**
 * Jogadores da sala.
 *
 * O mestre recebe todos; um jogador recebe só a própria linha. Não é filtro
 * de cliente, é a RLS — a ficha de um jogador não vaza para o outro.
 */
export async function listPlayers(roomId: string): Promise<PlayerRow[]> {
  const { data, error } = await getSupabase()
    .from("players")
    .select(COLUMNS)
    .eq("room_id", roomId)
    .order("updated_at", { ascending: true });

  if (error) throw error;

  return data ?? [];
}

export async function getMyPlayer(roomId: string): Promise<PlayerRow | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  const { data, error } = await getSupabase()
    .from("players")
    .select(COLUMNS)
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

/** Anotações livres do jogador. Nenhuma estrutura imposta. */
export async function saveMyNotes(roomId: string, notes: string): Promise<void> {
  const userId = await ensureAnonSession();

  const { error } = await getSupabase()
    .from("players")
    .update({ notes })
    .eq("room_id", roomId)
    .eq("user_id", userId);

  if (error) throw error;
}

/** O jogador nomeia a si mesmo. `master_label` não é alcançável por aqui. */
export async function saveMyName(roomId: string, name: string): Promise<void> {
  const userId = await ensureAnonSession();

  const { error } = await getSupabase()
    .from("players")
    .update({ name: name.trim() })
    .eq("room_id", roomId)
    .eq("user_id", userId);

  if (error) throw error;
}

/**
 * Apelido dado pelo mestre.
 *
 * Vai por RPC porque `master_label` está fora do privilégio de coluna do
 * cliente: nem o dono da linha escreve nela. A função checa `is_room_master`
 * antes de gravar.
 */
export async function setPlayerLabel(
  roomId: string,
  userId: string,
  label: string,
): Promise<void> {
  const { error } = await getSupabase().rpc("set_player_label", {
    p_room_id: roomId,
    p_user_id: userId,
    p_label: label,
  });

  if (error) throw error;
}

/** Avisa quando alguém entra na sala ou muda o próprio nome. */
export function subscribeToPlayers(roomId: string, onChange: () => void): () => void {
  const supabase = getSupabase();

  const channel = supabase
    .channel(`players:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
