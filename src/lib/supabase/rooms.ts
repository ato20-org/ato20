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
 * A sala que este navegador já comanda, se houver.
 *
 * A identidade do mestre é a sessão anônima do navegador. Ela some quando os
 * dados do site são limpos — é justamente esse buraco que o código de operação
 * fecha, permitindo reassumir a mesa em `unlockRoom`.
 */
export async function findMasterRoom(): Promise<Room | null> {
  const supabase = getSupabase();
  const userId = await ensureAnonSession();

  const { data, error } = await supabase
    .from("rooms")
    .select("id, code")
    .eq("master_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data ?? null;
}

/** A sala recém-criada, com a senha que só aparece neste momento. */
export type NewRoom = Room & { operatorCode: string };

/**
 * Cria a mesa.
 *
 * Vai por RPC porque `operator_code` não é mais legível pela tabela — nem para
 * o mestre. O único jeito de vê-lo na criação é o servidor devolvê-lo aqui.
 */
export async function createRoom(): Promise<NewRoom> {
  const supabase = getSupabase();
  await ensureAnonSession();

  const { data, error } = await supabase.rpc("create_room");
  if (error) throw error;

  const room = data as { id: string; code: string; operator_code: string };

  return { id: room.id, code: room.code, operatorCode: room.operator_code };
}

/**
 * Assume a mesa com o código de operação.
 *
 * A conferência é do servidor, não da tela: comparar o código em JavaScript
 * seria enfeite, já que quem decide o que o mestre pode fazer é a RLS, que
 * olha `master_id`. O código certo é o que move `master_id` para esta sessão —
 * e é por isso que ele vale alguma coisa.
 */
export async function unlockRoom(operatorCode: string): Promise<Room> {
  const supabase = getSupabase();
  await ensureAnonSession();

  const { data, error } = await supabase.rpc("unlock_room", {
    p_operator_code: operatorCode,
  });

  if (error) throw error;
  if (!data) throw new Error("Código de operação inválido");

  return data as Room;
}

/** Relê a própria senha, para abrir o Operador em outra máquina. */
export async function fetchOperatorCode(roomId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("my_operator_code", {
    p_room_id: roomId,
  });

  if (error) throw error;

  return data as string;
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
