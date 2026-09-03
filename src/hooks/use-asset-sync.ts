"use client";

import { useEffect } from "react";

import { listPendingUploads } from "@/lib/storage/assets";
import { useUploadStore } from "@/lib/store/use-upload-store";

/**
 * Reconcilia a biblioteca local com o Storage quando a sala abre.
 *
 * Roda uma varredura em vez de confiar só no gancho do upload: cobre arquivos
 * enviados antes de a sala existir, os de sessões em que o Supabase estava
 * indisponível, e os que subiram para uma sala anterior — esses estão no
 * Storage, mas num endereço que ninguém mais consulta.
 */
export function useAssetSync(roomId: string | null): void {
  const enqueue = useUploadStore((state) => state.enqueue);

  useEffect(() => {
    if (!roomId) return;

    let active = true;
    void listPendingUploads(roomId).then((pending) => {
      if (active && pending.length > 0) enqueue(pending.map((asset) => asset.id));
    });

    return () => {
      active = false;
    };
  }, [roomId, enqueue]);
}
