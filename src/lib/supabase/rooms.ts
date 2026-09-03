"use client";

import { ensureAnonSession } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";

export type Room = { id: string; code: string };

/**
 * Uma entrada de material de regras.
 *
 * Ou aponta para um arquivo que o mestre subiu (`assetId`, resolvido no bucket
 * público), ou para um link externo (`url`). Os dois casos existem porque o
 * livro pode estar num PDF que ele tem ou numa página que ele só quer indicar.
 */
export type RuleLink = { id: string; label: string; url?: string; assetId?: string };

/**
 * Sala do mestre neste navegador, criada na primeira vez.
 *
 * A sala é permanente e amarrada ao usuário anônimo: o jogador salva o link
 * uma vez e nunca digita código de novo, e os anexos de personagem
 * sobrevivem entre sessões.
 */
export async function ensureMasterRoom(): Promise<Room> {
  const supabase = getSupabase();
  const userId = await ensureAnonSession();

  const { data: existing, error: selectError } = await supabase
    .from("rooms")
    .select("id, code")
    .eq("master_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  // `code` tem default no banco (`generate_room_code`), então não é enviado.
  const { data: created, error: insertError } = await supabase
    .from("rooms")
    .insert({ master_id: userId })
    .select("id, code")
    .single();

  if (insertError) throw insertError;

  return created;
}

export async function loadRules(roomId: string): Promise<RuleLink[]> {
  const { data, error } = await getSupabase()
    .from("rooms")
    .select("rules")
    .eq("id", roomId)
    .maybeSingle();

  if (error) throw error;

  return (data?.rules as RuleLink[] | null) ?? [];
}

/** Só o mestre passa pela policy de update de `rooms`. */
export async function saveRules(roomId: string, rules: RuleLink[]): Promise<void> {
  const { error } = await getSupabase().from("rooms").update({ rules }).eq("id", roomId);
  if (error) throw error;
}

/**
 * Entra numa sala pelo código.
 *
 * Vai por RPC em vez de `select` direto: procurar a sala pelo código exigiria
 * permissão de leitura em todas as salas, expondo código e mestre de mesas
 * alheias.
 */
export async function joinRoomByCode(code: string): Promise<Room> {
  const supabase = getSupabase();
  await ensureAnonSession();

  const normalized = code.trim().toUpperCase();

  const { data: roomId, error } = await supabase.rpc("join_room", { p_code: normalized });
  if (error) throw error;
  if (!roomId) throw new Error("Sala não encontrada");

  return { id: roomId as string, code: normalized };
}
