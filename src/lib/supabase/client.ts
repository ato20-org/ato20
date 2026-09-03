"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Sem as variáveis de ambiente o app roda em modo local — Operador e Assistir
 * por `BroadcastChannel`, exatamente como na Fase 1. Nada quebra, só a Plateia
 * no celular fica indisponível.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

let client: SupabaseClient | null = null;

/** `null` quando não configurado. Quem chama decide o que fazer sem rede. */
export function maybeSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;

  client ??= createClient(url, anonKey, {
    auth: {
      // Sessão anônima persistida: o mesmo navegador volta como o mesmo
      // usuário, então o mestre reencontra a sala dele e o jogador reencontra
      // os anexos dele sem digitar nada.
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      // Arrastar um item emite dezenas de eventos por segundo. O throttle real
      // é feito no canal (ver `supabase-channel.ts`); isto é só o teto do
      // socket.
      params: { eventsPerSecond: 20 },
    },
  });

  return client;
}

/** Para os caminhos que já checaram `isSupabaseConfigured()`. */
export function getSupabase(): SupabaseClient {
  const instance = maybeSupabase();
  if (!instance) throw new Error("Supabase não configurado: falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY");

  return instance;
}
