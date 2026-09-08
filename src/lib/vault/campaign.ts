"use client";

import { open } from "@tauri-apps/plugin-dialog";

import { call } from "@/lib/vault/bridge";

/** A campanha aberta. */
export type CampaignInfo = {
  /** Caminho da pasta no disco. É a identidade: não há id além dele. */
  path: string;
  nome: string;
  /** O código que a Plateia e o Assistir digitam. Viaja no zip. */
  codigo: string;
  /** Versão do formato do vault. */
  versao: number;
};

export type RecentEntry = {
  path: string;
  nome: string;
  abertaEm: number;
  /** A pasta ainda está no disco. Falso = volume desconectado ou pasta movida. */
  existe: boolean;
};

export function currentCampaign(): Promise<CampaignInfo | null> {
  return call<CampaignInfo | null>("campaign_current");
}

/**
 * Reabre a campanha da sessão anterior.
 *
 * `null` cobre três casos que a porta trata igual: primeira execução, pasta
 * movida, e pasta num volume desconectado. Nos três o que falta é escolher uma,
 * e distinguir só daria uma mensagem a mais para ler.
 */
export function reopenLastCampaign(): Promise<CampaignInfo | null> {
  return call<CampaignInfo | null>("campaign_reopen_last");
}

export function recentCampaigns(): Promise<RecentEntry[]> {
  return call<RecentEntry[]>("campaign_recents");
}

export function forgetCampaign(path: string): Promise<void> {
  return call("campaign_forget", { path });
}

export function openCampaign(path: string): Promise<CampaignInfo> {
  return call<CampaignInfo>("campaign_open", { path });
}

export function createCampaign(parent: string, nome: string): Promise<CampaignInfo> {
  return call<CampaignInfo>("campaign_create", { parent, nome });
}

/**
 * Abre o seletor nativo de pasta.
 *
 * Nativo e não desenhado na tela: uma lista de arquivos feita em HTML não
 * alcança o disco, e digitar caminho à mão é justamente o que o Obsidian
 * acertou em não pedir. `null` = o mestre fechou o diálogo, que não é erro.
 */
export async function pickFolder(title: string): Promise<string | null> {
  const chosen = await open({ directory: true, multiple: false, title });

  return typeof chosen === "string" ? chosen : null;
}
