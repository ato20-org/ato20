"use client";

import { getSupabase } from "@/lib/supabase/client";
import type { Board } from "@/types/scene";

/** O board de uma mesa, com a versão que o servidor tem dele. */
export type RemoteBoard = { board: Board; version: number };

/**
 * Gravação recusada porque outro aparelho gravou antes.
 *
 * Tipo próprio, e não string de mensagem: a tela precisa oferecer puxar ou
 * sobrescrever, e distinguir isso de "caiu a rede" por texto seria frágil.
 */
export class BoardConflictError extends Error {
  constructor() {
    super("Esta mesa foi alterada em outro aparelho.");
    this.name = "BoardConflictError";
  }
}

/** `null` quando esta mesa nunca teve board gravado. */
export async function loadRemoteBoard(roomId: string): Promise<RemoteBoard | null> {
  const { data, error } = await getSupabase()
    .from("boards")
    .select("data, version")
    .eq("room_id", roomId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return { board: data.data as Board, version: data.version as number };
}

/**
 * Grava o board e devolve a versão nova.
 *
 * `version` é a que este cliente carregou; `0` significa "nunca vi este
 * board". Quem manda uma versão velha leva `BoardConflictError` — é o RPC que
 * decide, porque comparar no cliente perderia a corrida entre duas máquinas.
 */
export async function saveRemoteBoard(
  roomId: string,
  board: Board,
  version: number,
): Promise<number> {
  const { data, error } = await getSupabase().rpc("save_board", {
    p_room_id: roomId,
    p_data: board,
    p_version: version,
  });

  if (error) {
    if (error.message.includes("board_conflict")) throw new BoardConflictError();

    throw error;
  }

  return data as number;
}
