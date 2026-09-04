"use client";

import { useEffect } from "react";

import { listPendingUploads } from "@/lib/storage/assets";
import { useUploadStore } from "@/lib/store/use-upload-store";

/**
 * Garante que o material EM USO está no Storage.
 *
 * "Em uso" é o que a mesa precisa alcançar de fora desta máquina: item de
 * cena, fundo, retrato e trilha. O resto do acervo não sobe sozinho — subia
 * antes, e era isso que fazia o teto do bucket ser o tamanho da biblioteca em
 * vez do tamanho das cenas.
 *
 * Roda uma varredura em vez de confiar num gancho no envio: cobre o arquivo
 * que entrou em cena antes de a sala existir, o de sessões em que o Supabase
 * estava fora do ar, e o que subiu para uma sala anterior -- esse está no
 * Storage, mas num endereço que ninguém consulta.
 */
export function useAssetSync(roomId: string | null, usedAssetIds: Set<string>): void {
  const enqueue = useUploadStore((state) => state.enqueue);
  // Chave estável do conteúdo: o `Set` nasce novo a cada render do Operador, e
  // usá-lo como dependência dispararia a varredura a cada frame de arrasto.
  const key = [...usedAssetIds].sort().join(",");

  useEffect(() => {
    if (!roomId) return;

    const used = key ? key.split(",") : [];
    if (used.length === 0) return;

    let active = true;
    void listPendingUploads(roomId, used).then((pending) => {
      if (active && pending.length > 0) enqueue(pending.map((asset) => asset.id));
    });

    return () => {
      active = false;
    };
  }, [roomId, key, enqueue]);
}
