"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  deleteAsset,
  getAssetMeta,
  listAssets,
  putAsset,
  setAssetFolder,
} from "@/lib/storage/assets";
import { useRoomStore } from "@/lib/store/use-room-store";
import { deleteRemoteAsset } from "@/lib/supabase/asset-sync";
import { deleteAssetRow, upsertAssets } from "@/lib/supabase/library";
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
 */
export function useAssetList(kind: AssetKind): AssetListApi {
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [version, setVersion] = useState(0);

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

      // NÃO sobe para o Storage aqui. Enviar tudo no momento do upload fazia o
      // teto do bucket ser o tamanho da biblioteca, não o das cenas vivas — e
      // o plano gratuito aperta primeiro nele. Quem sobe é o `useAssetSync`,
      // quando o arquivo entra numa cena, num fundo, num retrato ou na trilha;
      // o resto vai a pedido, pelo "Subir para a mesa" da linha.
      refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (assetId: string) => {
      const roomId = useRoomStore.getState().room?.id;
      // Remoto primeiro, local depois: se o remoto falhar, o arquivo continua
      // listado e o mestre pode tentar de novo. Na ordem inversa ficaria um
      // órfão pagando cota de Storage sem aparecer em lugar nenhum.
      if (roomId) {
        await deleteRemoteAsset(roomId, assetId);
        // A linha sai junto: sem isso a outra máquina continuaria listando um
        // arquivo cujo binário não existe mais, e tentaria baixá-lo a cada
        // abertura da mesa.
        await deleteAssetRow(roomId, assetId);
      }

      await deleteAsset(assetId);
      refresh();
    },
    [refresh],
  );

  const move = useCallback(
    async (assetId: string, folderId: string | undefined) => {
      await setAssetFolder(assetId, folderId);

      // Pasta é organização, e organização é o que mais dói perder ao trocar
      // de máquina: a linha acompanha na hora.
      const roomId = useRoomStore.getState().room?.id;
      const meta = roomId ? await getAssetMeta(assetId) : undefined;
      if (roomId && meta) await upsertAssets(roomId, [meta]);

      refresh();
    },
    [refresh],
  );

  return { assets, upload, remove, move, refresh };
}
