"use client";

import { call } from "@/lib/vault/bridge";
import { DEFAULT_SESSION_VOLUME, type Portrait, type SessionTrack } from "@/types/scene";

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

/**
 * O som da sessão: a faixa escolhida e o volume.
 *
 * Os dois no mesmo arquivo porque são gravados no mesmo gesto, mas o volume
 * fica FORA da faixa: ele é da sessão, sobrevive a trocar de música e a tirar a
 * trilha. Guardado dentro da faixa, cada troca trazia o ganho de quando aquela
 * música foi escolhida e o som saltava.
 *
 * `trilha.json` continua opaco para o Rust — ele só grava e lê —, então mudar a
 * forma aqui não pede mudança lá.
 */
export type SessionAudio = { track: SessionTrack | null; volume: number };

/** Formato antigo: o arquivo era a faixa, com o volume dentro dela. */
type TrilhaGravada =
  | (SessionTrack & { volume?: number })
  | SessionAudio
  | null;

export async function loadAudio(): Promise<SessionAudio> {
  const gravado = await call<TrilhaGravada>("track_load");

  if (!gravado) return { track: null, volume: DEFAULT_SESSION_VOLUME };

  // Forma nova: um envelope com os dois campos.
  if ("track" in gravado) {
    return {
      track: gravado.track,
      volume: gravado.volume ?? DEFAULT_SESSION_VOLUME,
    };
  }

  // Forma antiga, de antes de o volume sair da faixa. Lida uma vez e regravada
  // no formato novo na primeira alteração — sem passo de migração, porque um
  // arquivo que se converte ao ser tocado não precisa de um.
  const { volume, ...track } = gravado;

  return { track, volume: volume ?? DEFAULT_SESSION_VOLUME };
}

export function saveAudio(track: SessionTrack | null, volume: number): Promise<void> {
  return call("track_save", { track: { track, volume } });
}
