"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { deleteAsset, listAssets, putAsset } from "@/lib/storage/assets";
import { useRoomStore } from "@/lib/store/use-room-store";
import { useUploadStore } from "@/lib/store/use-upload-store";
import { deleteRemoteAsset } from "@/lib/supabase/asset-sync";
import { SYNCED_KINDS, type AssetKind, type AssetMeta } from "@/types/scene";

type AssetListApi = {
  assets: AssetMeta[];
  upload: (files: FileList | null) => Promise<void>;
  remove: (assetId: string) => Promise<void>;
};

/**
 * Biblioteca de arquivos de um tipo. Compartilhada pelos painéis de imagem e
 * de som — os dois fazem o mesmo upload, listagem e exclusão, só a linha da
 * lista é diferente.
 */
export function useAssetList(kind: AssetKind): AssetListApi {
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [version, setVersion] = useState(0);
  const enqueue = useUploadStore((state) => state.enqueue);

  useEffect(() => {
    let active = true;
    void listAssets(kind).then((next) => {
      if (active) setAssets(next);
    });

    return () => {
      active = false;
    };
  }, [kind, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  const upload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;

      const results = await Promise.allSettled([...files].map(putAsset));
      const failed = results.filter((result) => result.status === "rejected").length;

      if (failed > 0) toast.error(`${failed} arquivo(s) não puderam ser enviados.`);

      // Sobe no momento do upload, não na troca de cena: um mapa de 5 MB
      // subindo enquanto a mesa espera a cena mudar travaria o jogo.
      if (SYNCED_KINDS.includes(kind)) {
        enqueue(
          results.flatMap((result) => (result.status === "fulfilled" ? [result.value.id] : [])),
        );
      }

      refresh();
    },
    [enqueue, kind, refresh],
  );

  const remove = useCallback(
    async (assetId: string) => {
      const roomId = useRoomStore.getState().room?.id;
      // Remoto primeiro, local depois: se o remoto falhar, o arquivo continua
      // listado e o mestre pode tentar de novo. Na ordem inversa ficaria um
      // órfão pagando cota de Storage sem aparecer em lugar nenhum.
      if (roomId) await deleteRemoteAsset(roomId, assetId);

      await deleteAsset(assetId);
      refresh();
    },
    [refresh],
  );

  return { assets, upload, remove };
}
