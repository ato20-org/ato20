"use client";

import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { useAssetsStore } from "@/lib/store/use-assets-store";
import { deleteAsset, importAssets, setAssetFolder } from "@/lib/vault/assets";
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
 * A mesma referência sempre, enquanto o acervo não foi lido.
 *
 * Um `[]` novo a cada render faria todo `useMemo` que depende da lista
 * recalcular — e há tela que deriva dela a cada linha.
 */
const LENDO: AssetMeta[] = [];

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
 *
 * A lista em si mora no `useAssetsStore`, e não aqui: eram oito cópias
 * envelhecendo em separado, e a que a lista de personagens guardava nunca via a
 * miniatura recém-anexada na ficha. Este hook ficou sendo a janela para o store
 * — mesma forma do `useCharacters`.
 */
export function useAssetList(kind: AssetKind): AssetListApi {
  const assets = useAssetsStore((state) => state[kind].assets);
  const garantir = useAssetsStore((state) => state.garantir);
  const recarregar = useAssetsStore((state) => state.recarregar);

  // Na montagem de cada tela, e não na criação do store: ler o disco na criação
  // aconteceria durante a pré-renderização, onde não há IPC nenhum.
  useEffect(() => {
    garantir(kind);
  }, [garantir, kind]);

  const refresh = useCallback(() => recarregar(kind), [recarregar, kind]);

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

  return { assets: assets ?? LENDO, importar, remove, move, refresh };
}
