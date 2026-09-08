"use client";

import { call, daemonAddr, isDesktop, VaultError } from "@/lib/vault/bridge";
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
 * Mede a imagem antes de enviar.
 *
 * Aqui e não no Rust: o browser já vai decodificar a imagem para exibi-la, e
 * refazer isso do outro lado custaria um crate de imagem no binário para
 * chegar ao mesmo número. Falha em medir não impede o envio — o arquivo vale,
 * e sem medida a cena só perde a proporção sugerida ao arrastar.
 */
async function measure(file: File): Promise<{ largura?: number; altura?: number }> {
  if (!file.type.startsWith("image/")) return {};

  try {
    const bitmap = await createImageBitmap(file);

    try {
      return { largura: bitmap.width, altura: bitmap.height };
    } finally {
      bitmap.close();
    }
  } catch {
    return {};
  }
}

/**
 * Envia um arquivo para o acervo.
 *
 * Por HTTP e não pelo IPC: o corpo vai em streaming direto para o disco, e o
 * pico de memória fica no tamanho do buffer em vez do tamanho do mapa.
 */
export async function putAsset(file: File): Promise<AssetMeta> {
  const { url, token } = await daemonAddr();
  const { largura, altura } = await measure(file);

  const body = new FormData();
  // O nome do arquivo acompanha o campo, e o daemon o guarda só como rótulo:
  // o caminho no disco é `{id}.{ext}`, então nome vindo de fora não escolhe
  // onde nada é gravado.
  body.append("file", file, file.name);
  if (largura !== undefined) body.append("largura", String(largura));
  if (altura !== undefined) body.append("altura", String(altura));

  const response = await fetch(`${url}/asset`, {
    method: "POST",
    headers: { "x-ato20-token": token },
    body,
  });

  if (!response.ok) {
    // A mensagem do daemon é curta e em português; repassá-la diz mais que
    // "erro 415" para quem acabou de arrastar um `.docx` para o acervo.
    throw new VaultError(
      response.status === 415 ? "tipo-nao-suportado" : "envio",
      (await response.text().catch(() => "")) || `Falha ao enviar ${file.name}`,
    );
  }

  return (await response.json()) as AssetMeta;
}
