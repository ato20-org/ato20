"use client";

import { create } from "zustand";

import { collectUsedAssetIds } from "@/lib/operator/asset-usage";
import { deleteAsset, listAssets, putRemoteAsset, setAssetFolder } from "@/lib/storage/assets";
import { deleteFolder, listFolders, putFolder } from "@/lib/storage/folders";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { deleteRemoteAsset, downloadRemoteAsset } from "@/lib/supabase/asset-sync";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  listRemoteAssets,
  listRemoteFolders,
  markMirror,
  setInBucket,
  upsertAssets,
  upsertFolders,
} from "@/lib/supabase/library";

export type LibraryStatus = "idle" | "syncing" | "ready" | "error";

type LibraryStore = {
  status: LibraryStatus;
  /** Quantos arquivos ainda faltam baixar nesta máquina. */
  pending: number;
  /** Quantos já desceram nesta rodada. Serve para "3 de 12". */
  done: number;
  error: string | null;
  /** Sala já reconciliada, para não repetir a varredura a cada montagem. */
  syncedRoomId: string | null;
  /**
   * Arquivos cujo binário já saiu do bucket.
   *
   * Eles continuam listados — a linha ficou —, mas um terceiro aparelho não
   * tem de onde baixá-los. A tela usa isto para oferecer "subir para a mesa"
   * em quem tem a cópia local.
   */
  outOfBucket: string[];

  sync: (roomId: string) => Promise<void>;
};

/**
 * Reconciliação do acervo entre as máquinas do mestre.
 *
 * O binário já viajava — a cena aparece completa em qualquer máquina porque o
 * `resolve` cai na URL pública. O que não viajava era o metadado: nome, tipo,
 * medidas e pasta. Sem ele o painel de imagens abre vazio do outro lado, e as
 * pastas não existem.
 *
 * Quatro fases, em série e nesta ordem por dependência: subir o que só existe
 * aqui **antes** de concluir exclusão, senão o acervo de quem já usava a
 * ferramenta (que não tem linha nenhuma) seria lido como "apagado noutra
 * máquina" e destruído.
 */
export const useLibraryStore = create<LibraryStore>((set, get) => ({
  status: "idle",
  pending: 0,
  done: 0,
  error: null,
  syncedRoomId: null,
  outOfBucket: [],

  async sync(roomId) {
    if (!isSupabaseConfigured()) return;
    if (get().status === "syncing" || get().syncedRoomId === roomId) return;

    set({ status: "syncing", error: null, pending: 0, done: 0 });

    try {
      const [remoteAssets, remoteFolders, localAssets, localFolders] = await Promise.all([
        listRemoteAssets(roomId),
        listRemoteFolders(roomId),
        listAssets(),
        listFolders(),
      ]);

      const remoteById = new Map(remoteAssets.map((asset) => [asset.id, asset]));
      const localById = new Map(localAssets.map((asset) => [asset.id, asset]));
      const remoteFolderIds = new Set(remoteFolders.map((folder) => folder.id));
      const localFolderIds = new Set(localFolders.map((folder) => folder.id));

      // 1. Subir o que só existe aqui. Cobre o acervo de antes desta feature e
      //    tudo que foi criado offline.
      await upsertFolders(
        roomId,
        localFolders.filter((folder) => !remoteFolderIds.has(folder.id)),
      );
      await upsertAssets(
        roomId,
        localAssets.filter((asset) => !remoteById.has(asset.id)),
      );

      // 2. Trazer o que falta aqui. Pasta primeiro: o arquivo aponta para ela.
      for (const folder of remoteFolders) {
        if (!localFolderIds.has(folder.id)) await putFolder(folder);
      }

      const missing = remoteAssets.filter((asset) => !localById.has(asset.id) && asset.inBucket);
      set({ pending: missing.length });

      // Em série, pelo mesmo motivo do upload: baixar cinco mapas em paralelo
      // divide a banda e faz todos chegarem tarde.
      for (const asset of missing) {
        try {
          const blob = await downloadRemoteAsset(roomId, asset.id);
          await putRemoteAsset(asset, blob, roomId);
          await markMirror(roomId, asset.id);
        } catch {
          // Um arquivo que falhou não interrompe o resto: a próxima abertura
          // da mesa tenta de novo, porque ele continua faltando aqui.
        }

        set((state) => ({ pending: state.pending - 1, done: state.done + 1 }));
      }

      // A pasta pode ter mudado na outra máquina; o arquivo local segue a linha.
      for (const asset of remoteAssets) {
        const local = localById.get(asset.id);
        if (local && local.folderId !== asset.folderId) {
          await setAssetFolder(asset.id, asset.folderId);
        }
      }

      // 3. Exclusão feita na outra máquina. Só vale para o que esta máquina já
      //    havia sincronizado com ESTA sala: sem essa condição, um arquivo
      //    recém-criado offline seria apagado por não ter linha ainda.
      for (const asset of localAssets) {
        if (asset.remoteRoomId === roomId && !remoteById.has(asset.id)) {
          await deleteAsset(asset.id);
        }
      }

      for (const folder of localFolders) {
        if (!remoteFolderIds.has(folder.id) && remoteFolders.length > 0) {
          // Pasta que sumiu do servidor: o conteúdo volta para a raiz, nunca
          // é apagado junto.
          await deleteFolder(folder.id);
        }
      }

      // 4. Faxina do bucket: o que não está em uso e já tem dois espelhos sai
      //    do Storage. O que está em uso nunca sai — é a fonte da TV e do
      //    celular do jogador.
      const swept = await sweepBucket(roomId, remoteAssets);

      set({
        status: "ready",
        syncedRoomId: roomId,
        pending: 0,
        outOfBucket: [
          ...remoteAssets.filter((asset) => !asset.inBucket).map((asset) => asset.id),
          ...swept,
        ],
      });
    } catch (cause) {
      set({
        status: "error",
        error: cause instanceof Error ? cause.message : "Falha ao sincronizar o acervo",
      });
    }
  },
}));

/**
 * Tira do bucket tudo que não está em uso na mesa.
 *
 * O Storage guarda o material das cenas vivas, e nada além: é assim que o teto
 * dele passa a ser previsível, em vez de crescer com a biblioteca. A linha
 * continua na tabela com `in_bucket = false`, então o arquivo continua listado
 * — o que muda é onde o binário mora.
 *
 * Não espera espelho em duas máquinas. Esperava, quando o bucket também servia
 * de transporte do acervo inteiro; agora quem sobe é o que entra em cena, e
 * quem não entrou nunca esteve lá. Uma cópia local sempre existe: apagar o
 * arquivo apaga o objeto junto, então não há caminho em que a última cópia
 * saia daqui.
 */
async function sweepBucket(
  roomId: string,
  remoteAssets: Array<{ id: string; mirrors: string[]; inBucket: boolean }>,
): Promise<string[]> {
  const board = useSceneStore.getState().board;
  const used = collectUsedAssetIds(
    board?.scenes ?? [],
    usePortraitStore.getState().portraits,
    useTrackStore.getState().track,
  );

  // Sem board carregado a conta de "em uso" seria vazia, e a faxina apagaria
  // justamente o material das cenas. Melhor não varrer nesta rodada.
  if (!board) return [];

  const doomed = remoteAssets.filter((asset) => asset.inBucket && !used.has(asset.id));

  if (doomed.length === 0) return [];

  const ids = doomed.map((asset) => asset.id);

  for (const id of ids) await deleteRemoteAsset(roomId, id);
  await setInBucket(roomId, ids, false);

  return ids;
}
