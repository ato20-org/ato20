"use client";

import { call } from "@/lib/vault/bridge";
import type { AssetFolder } from "@/types/scene";

/** Em ordem alfabética: a lista é navegada com o olho, não por recência. */
export function listFolders(): Promise<AssetFolder[]> {
  return call<AssetFolder[]>("folder_list");
}

export function createFolder(name: string): Promise<AssetFolder> {
  return call<AssetFolder>("folder_create", { name });
}

export function renameFolder(id: string, name: string): Promise<void> {
  return call("folder_rename", { id, name });
}

/**
 * Apaga a pasta e devolve o conteúdo à raiz.
 *
 * Nunca apaga arquivo: perder um mapa por causa de um clique em "apagar pasta"
 * seria dano desproporcional ao gesto, e o arquivo é o que custou trabalho.
 */
export function deleteFolder(id: string): Promise<void> {
  return call("folder_delete", { id });
}
