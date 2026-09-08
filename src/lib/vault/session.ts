"use client";

import { call } from "@/lib/vault/bridge";
import type { Portrait, SessionTrack } from "@/types/scene";

/**
 * Retratos e trilha: o estado que pertence à sessão, e não a nenhuma cena.
 *
 * Arquivos separados no vault (`retratos.json`, `trilha.json`) pelo mesmo
 * motivo que já valia quando eram dois stores do IndexedDB: dois escritores no
 * mesmo registro se sobrescrevem, e a trilha grava a cada ajuste de volume
 * enquanto o retrato grava a cada frame de arrasto.
 */

export function loadPortraits(): Promise<Portrait[]> {
  return call<Portrait[]>("portraits_load");
}

export function savePortraits(portraits: Portrait[]): Promise<void> {
  return call("portraits_save", { portraits });
}

/** `null` = nenhuma trilha escolhida. */
export function loadTrack(): Promise<SessionTrack | null> {
  return call<SessionTrack | null>("track_load");
}

export function saveTrack(track: SessionTrack | null): Promise<void> {
  return call("track_save", { track });
}
