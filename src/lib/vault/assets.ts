"use client";

import { open } from "@tauri-apps/plugin-dialog";

import { call, daemonAddr, isDesktop } from "@/lib/vault/bridge";
import type { AssetKind, AssetMeta } from "@/types/scene";

/**
 * Endereço de um arquivo do acervo.
 *
 * Um caminho só, para as três telas. No Operador é o loopback do próprio
 * daemon; no celular do jogador é o mesmo daemon pela rede, e aí a página já
 * foi servida por ele — relativo resolve para o lugar certo sozinho.
 *
 * Isto substituiu o par blob-URL-ou-Storage de antes, e com ele foram embora o
 * cache de object URLs, o `revokeAssetUrl` e a classe de vazamento de memória
 * que os dois existiam para conter: quem guarda cópia agora é o cache HTTP do
 * browser, por ETag.
 */
export async function assetUrl(assetId: string): Promise<string> {
  if (!isDesktop()) return `/asset/${assetId}`;

  const { url } = await daemonAddr();

  return `${url}/asset/${assetId}`;
}

export function listAssets(kind?: AssetKind): Promise<AssetMeta[]> {
  return call<AssetMeta[]>("asset_list", { kind: kind ?? null });
}

export function deleteAsset(id: string): Promise<void> {
  return call("asset_delete", { id });
}

/** Move para uma pasta. `undefined` devolve à raiz. */
export function setAssetFolder(id: string, folderId: string | undefined): Promise<void> {
  return call("asset_set_folder", { id, folderId: folderId ?? null });
}

/**
 * O que a importação devolve.
 *
 * Recusados vem como um motivo por arquivo, e não uma contagem: quem escolheu
 * doze mapas e teve um recusado quer os onze e quer saber qual.
 */
export type ImportResult = { aceitos: AssetMeta[]; recusados: string[] };

/**
 * Traz arquivos de fora para o acervo.
 *
 * Abre o seletor nativo e manda os CAMINHOS ao Rust, que copia do disco para
 * `assets/`. O arquivo não passa pela webview nem por HTTP — era o contrário
 * antes, e além de três travessias para o que o sistema de arquivos faz numa, o
 * limite de corpo do axum (2 MB por padrão) cortava o envio de um mapa grande
 * no meio: o cliente via "load failed" e o log dizia "Error parsing
 * multipart/form-data", nenhum dos dois apontando para o limite.
 *
 * `null` = o mestre fechou o diálogo, que não é erro.
 */
export async function importAssets(kind: AssetKind): Promise<ImportResult | null> {
  const escolhidos = await open({
    multiple: true,
    title: kind === "image" ? "Escolha as imagens" : "Escolha os sons",
    filters: [
      kind === "image"
        ? { name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"] }
        : { name: "Sons", extensions: ["mp3", "ogg", "oga", "opus", "wav", "flac", "m4a", "aac"] },
    ],
  });

  if (!escolhidos) return null;

  const paths = Array.isArray(escolhidos) ? escolhidos : [escolhidos];
  if (paths.length === 0) return null;

  return call<ImportResult>("asset_import", { paths });
}
