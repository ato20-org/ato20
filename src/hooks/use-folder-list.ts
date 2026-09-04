"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
} from "@/lib/storage/folders";
import { useRoomStore } from "@/lib/store/use-room-store";
import { deleteFolderRow, upsertFolders } from "@/lib/supabase/library";
import type { AssetFolder } from "@/types/scene";

type FolderListApi = {
  folders: AssetFolder[];
  create: (name: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

/**
 * As pastas do acervo.
 *
 * Mesmo formato do `useAssetList`: lista mais ações que recarregam. Os dois
 * vivem no mesmo painel, e um `onChanged` liga a atualização de um à do outro
 * — apagar pasta muda arquivo, e mover arquivo muda o que cada pasta contém.
 */
/**
 * Manda a pasta para a mesa.
 *
 * Melhor esforço: sem mesa, ou com a rede fora, a pasta continua valendo
 * localmente — a próxima abertura da mesa sobe o que faltou.
 */
async function mirror(folders: AssetFolder[]): Promise<void> {
  const roomId = useRoomStore.getState().room?.id;
  if (!roomId) return;

  try {
    await upsertFolders(roomId, folders);
  } catch {
    // Ver a nota acima.
  }
}

export function useFolderList(onChanged?: () => void): FolderListApi {
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void listFolders().then((next) => {
      if (active) setFolders(next);
    });

    return () => {
      active = false;
    };
  }, [version]);

  const refresh = useCallback(() => {
    setVersion((current) => current + 1);
    onChanged?.();
  }, [onChanged]);

  const create = useCallback(
    async (name: string) => {
      const folder = await createFolder(name);
      await mirror([folder]);
      refresh();
    },
    [refresh],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      await renameFolder(id, name);

      const folder = (await listFolders()).find((candidate) => candidate.id === id);
      if (folder) await mirror([folder]);

      refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteFolder(id);

      const roomId = useRoomStore.getState().room?.id;
      if (roomId) await deleteFolderRow(roomId, id);

      refresh();
    },
    [refresh],
  );

  return { folders, create, rename, remove };
}
