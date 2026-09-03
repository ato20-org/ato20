"use client";

import { getSupabase } from "@/lib/supabase/client";

/**
 * Garante uma sessão anônima e devolve o id do usuário.
 *
 * Login anônimo em vez de e-mail: numa mesa de RPG, pedir cadastro para o
 * jogador abrir um mapa no celular mataria o uso. O id vive no localStorage
 * do aparelho, o que é exatamente a granularidade que queremos — um jogador
 * por aparelho.
 */
/** Id do usuário da sessão atual, sem criar sessão nova. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();

  return data.session?.user.id ?? null;
}

export async function ensureAnonSession(): Promise<string> {
  const supabase = getSupabase();

  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user) return existing.session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("Sessão anônima não retornou usuário");

  return data.user.id;
}
