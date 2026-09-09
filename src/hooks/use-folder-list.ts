"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
} from "@/lib/vault/folders";
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
 *
 * O espelho para a nuvem saiu inteiro, e com ele o `mirror` de melhor esforço
 * que existia porque a pasta podia valer localmente e falhar no servidor. Uma
 * pasta agora é uma linha em `pastas.json`, e gravar ou não gravar é a única
 * coisa que pode acontecer.
 */
export function useFolderList(onChanged?: () => void): FolderListApi {
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void listFolders().then(
      (next) => {
        if (active) setFolders(next);
      },
      () => {
        if (active) setFolders([]);
      },
    );

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
      await createFolder(name);
      refresh();
    },
    [refresh],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      await renameFolder(id, name);
      refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteFolder(id);
      refresh();
    },
    [refresh],
  );

  return { folders, create, rename, remove };
}
