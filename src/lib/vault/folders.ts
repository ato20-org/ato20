"use client";

import { call } from "@/lib/vault/bridge";
import type { AssetFolder } from "@/types/scene";

/** Em ordem alfabética: a lista é navegada com o olho, não por recência. */
export function listFolders(): Promise<AssetFolder[]> {
  return call<AssetFolder[]>("folder_list");
}

/** `parentId` presente = nasce dentro de outra pasta. */
export function createFolder(
  name: string,
  parentId?: string,
): Promise<AssetFolder> {
  return call<AssetFolder>("folder_create", {
    name,
    parentId: parentId ?? null,
  });
}

/**
 * Põe a pasta dentro de outra, ou na raiz. O Rust recusa ciclo em silêncio:
 * uma pasta não entra em si mesma nem numa descendente sua.
 */
export function moveFolder(id: string, parentId?: string): Promise<void> {
  return call("folder_move", { id, parentId: parentId ?? null });
}

export function renameFolder(id: string, name: string): Promise<void> {
  return call("folder_rename", { id, name });
}

/**
 * Apaga a pasta, as de dentro dela, e devolve o conteúdo de todas à raiz.
 *
 * Nunca apaga arquivo: perder um mapa por causa de um clique em "apagar pasta"
 * seria dano desproporcional ao gesto, e o arquivo é o que custou trabalho.
 */
export function deleteFolder(id: string): Promise<void> {
  return call("folder_delete", { id });
}
