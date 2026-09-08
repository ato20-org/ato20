"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { deleteAsset, listAssets, putAsset, setAssetFolder } from "@/lib/vault/assets";
import type { AssetKind, AssetMeta } from "@/types/scene";

type AssetListApi = {
  assets: AssetMeta[];
  upload: (files: FileList | null) => Promise<void>;
  remove: (assetId: string) => Promise<void>;
  /** Move para uma pasta. `undefined` devolve à raiz. */
  move: (assetId: string, folderId: string | undefined) => Promise<void>;
  /** Recarrega a lista. Usado por quem mexe em pasta, que muda os arquivos. */
  refresh: () => void;
};

/**
 * Biblioteca de arquivos de um tipo. Compartilhada pelos painéis de imagem e
 * de som — os dois fazem o mesmo upload, listagem e exclusão, só a linha da
 * lista é diferente.
 *
 * Cada ação era duas antes: uma no IndexedDB e outra no Supabase, com a ordem
 * entre elas importando (remoto primeiro na exclusão, para não deixar órfão
 * pagando cota). Com o arquivo no disco de quem opera sobrou uma chamada por
 * ação, e a pergunta "e se a segunda falhar" deixou de existir.
 */
export function useAssetList(kind: AssetKind): AssetListApi {
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void listAssets(kind).then(
      (next) => {
        if (active) setAssets(next);
      },
      () => {
        // Sem campanha aberta a lista é vazia, não quebrada: a porta de
        // escolher pasta está na frente desta tela.
        if (active) setAssets([]);
      },
    );

    return () => {
      active = false;
    };
  }, [kind, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  const upload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;

      // Em série, e não em paralelo: são arquivos grandes indo para o mesmo
      // disco, e cinco de uma vez só faz todos terminarem mais tarde.
      let failed = 0;
      for (const file of files) {
        try {
          await putAsset(file);
        } catch (cause) {
          failed += 1;
          // O motivo importa: tipo não suportado e disco cheio pedem coisas
          // diferentes de quem acabou de arrastar a pasta errada.
          toast.error(cause instanceof Error ? cause.message : `Falha ao enviar ${file.name}`);
        }
      }

      if (failed > 1) toast.error(`${failed} arquivos não puderam ser enviados.`);

      refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (assetId: string) => {
      await deleteAsset(assetId);
      refresh();
    },
    [refresh],
  );

  const move = useCallback(
    async (assetId: string, folderId: string | undefined) => {
      await setAssetFolder(assetId, folderId);
      refresh();
    },
    [refresh],
  );

  return { assets, upload, remove, move, refresh };
}
