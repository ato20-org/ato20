"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { deleteAsset, importAssets, listAssets, setAssetFolder } from "@/lib/vault/assets";
import type { AssetKind, AssetMeta } from "@/types/scene";

type AssetListApi = {
  assets: AssetMeta[];
  /** Abre o seletor nativo e copia o que for escolhido para a campanha. */
  importar: () => Promise<void>;
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
 *
 * Importar é seletor nativo e cópia no disco, e não `<input type="file">` com
 * envio: o arquivo nunca entra na webview.
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

  const importar = useCallback(async () => {
    try {
      const resultado = await importAssets(kind);

      // `null` é o diálogo fechado sem escolher: não muda nada, e não avisa.
      if (!resultado) return;

      // Um motivo por arquivo. "1 arquivo não pôde ser enviado" obriga quem
      // escolheu doze a adivinhar qual e por quê.
      for (const motivo of resultado.recusados) toast.error(motivo);

      if (resultado.aceitos.length > 0) refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao importar.");
    }
  }, [kind, refresh]);

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

  return { assets, importar, remove, move, refresh };
}
