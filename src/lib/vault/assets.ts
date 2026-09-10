"use client";

import { open } from "@tauri-apps/plugin-dialog";

import { call, daemonAddr, isDesktop } from "@/lib/vault/bridge";
import type { AssetKind, AssetMeta, EscopoAsset } from "@/types/scene";

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
/**
 * Qual tamanho do arquivo se pede.
 *
 * O acervo guarda o ORIGINAL, e ele é quem vai para o palco do mestre, para a
 * TV e para o zip. As duas reduções existem para quem não precisa dele:
 *
 * - `mini` (160px) para LISTA. Apontar um quadrado de 40px para um mapa de
 *   treze megapixels fazia a webview decodificar 51 MB de bitmap por linha.
 * - `tela` (1920px, JPEG) para o CELULAR do jogador. Ele recebe a mesma cena
 *   que a TV numa tela de 400px, e baixava os 8 MB do arquivo. Medido no mapa
 *   real: 0,44 MB e 13 MB decodificado.
 *
 * Quando a redução não é possível — som, arquivo ilegível, recorte com
 * transparência na variante JPEG, disco cheio — o daemon responde o ORIGINAL
 * nesta mesma rota. Quem chama nunca precisa de plano B.
 *
 * Ver `vault/variantes.rs` no Rust, que gera e guarda em `.ato20/{variante}/`.
 */
export type Variante = "mini" | "tela";

export async function assetUrl(
  assetId: string,
  variante?: Variante,
): Promise<string> {
  const caminho = variante ? `/asset/${assetId}/${variante}` : `/asset/${assetId}`;

  if (!isDesktop()) return caminho;

  const { url } = await daemonAddr();

  return `${url}${caminho}`;
}

export function listAssets(kind?: AssetKind): Promise<AssetMeta[]> {
  return call<AssetMeta[]>("asset_list", { kind: kind ?? null });
}

export function deleteAsset(id: string): Promise<void> {
  return call("asset_delete", { id });
}

/**
 * Guarda a forma da onda de um som.
 *
 * Chamada uma vez por arquivo, depois de a tela decodificar o áudio. O Rust
 * recusa em silêncio um id que não existe ou que não é som — é otimização de
 * desenho, e falhar aqui não pode custar a sessão.
 */
export function setAssetPeaks(id: string, peaks: number[]): Promise<void> {
  return call("asset_set_peaks", { id, peaks });
}

/** Move para uma pasta. `undefined` devolve à raiz. */
export function setAssetFolder(id: string, folderId: string | undefined): Promise<void> {
  return call("asset_set_folder", { id, folderId: folderId ?? null });
}

/**
 * Marca ou desmarca o dono de um arquivo.
 *
 * Serve a dois casos: um campo passar a apontar para arquivo que entrou solto,
 * e o acerto dos arquivos que já existiam antes de o escopo existir — ver
 * `useEscopoDosAssets`.
 */
export function setAssetEscopo(id: string, escopo: EscopoAsset | undefined): Promise<void> {
  return call("asset_set_escopo", { id, escopo: escopo ?? null });
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
 * `escopo` marca o dono do arquivo, e com ele a biblioteca deixa de listá-lo:
 * fundo de cena e os dois arquivos de personagem entram por aqui com dono. Sem
 * escopo, o arquivo entra solto e aparece na lista.
 *
 * `null` = o mestre fechou o diálogo, que não é erro.
 */
export async function importAssets(
  kind: AssetKind,
  escopo?: EscopoAsset,
): Promise<ImportResult | null> {
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

  return call<ImportResult>("asset_import", { paths, escopo: escopo ?? null });
}
