"use client";

import { open, save } from "@tauri-apps/plugin-dialog";

import { call } from "@/lib/vault/bridge";

/** A campanha aberta. */
export type CampaignInfo = {
  /** Caminho da pasta no disco. É a identidade: não há id além dele. */
  path: string;
  nome: string;
  /** O código que o Jogador e o Espectador digitam. Viaja no zip. */
  codigo: string;
  /** Versão do formato do vault. */
  versao: number;
};

export type RecentEntry = {
  path: string;
  nome: string;
  abertaEm: number;
  /**
   * Quanto tempo esta campanha já passou ABERTA, somado, em milissegundos.
   *
   * É o relógio da janela, e não horas de jogo: quem deixa o aplicativo aberto
   * a noite toda soma a noite toda. O rótulo da tela diz "aberta por" por isso.
   * Ver `AppDb::acumular_tempo` no Rust.
   */
  tempoMs: number;
  /** Quando ela nasceu. `null` = pasta fora de alcance, e aí não há o que ler. */
  criadaEm: number | null;
  /** A pasta ainda está no disco. Falso = volume desconectado ou pasta movida. */
  existe: boolean;
};

export function recentCampaigns(): Promise<RecentEntry[]> {
  return call<RecentEntry[]>("campaign_recents");
}

export function forgetCampaign(path: string): Promise<void> {
  return call("campaign_forget", { path });
}

export function openCampaign(path: string): Promise<CampaignInfo> {
  return call<CampaignInfo>("campaign_open", { path });
}

export function createCampaign(
  parent: string,
  nome: string,
): Promise<CampaignInfo> {
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

// --- zip --------------------------------------------------------------------

/**
 * Exporta a campanha inteira para um zip.
 *
 * Tudo, sem escolha. Havia duas opções — com e sem as fichas dos jogadores —,
 * pensadas para quem manda a campanha a outro mestre; saíram porque cobravam
 * uma decisão em todo export por um caso raro. Quem exporta está quase sempre
 * levando a campanha para outra máquina ou guardando cópia.
 *
 * `null` = o mestre fechou o diálogo, que não é erro.
 */
export async function exportCampaign(): Promise<string | null> {
  const sugerido = await call<string>("campaign_export_name");

  const dest = await save({
    title: "Exportar campanha",
    defaultPath: sugerido,
    filters: [{ name: "Campanha do ATO20", extensions: ["zip"] }],
  });

  if (!dest) return null;

  await call("campaign_export", { dest });

  return dest;
}

/**
 * Importa um zip como campanha nova e a abre.
 *
 * Dois diálogos: o zip, e onde criar. `null` em qualquer um dos dois desiste
 * sem erro.
 */
export async function importCampaign(): Promise<CampaignInfo | null> {
  const escolhido = await open({
    multiple: false,
    title: "Escolha o zip da campanha",
    filters: [{ name: "Campanha do ATO20", extensions: ["zip"] }],
  });

  if (typeof escolhido !== "string") return null;

  const parent = await pickFolder("Onde criar a campanha importada");
  if (!parent) return null;

  return call<CampaignInfo>("campaign_import", { zipPath: escolhido, parent });
}
