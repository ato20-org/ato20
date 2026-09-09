"use client";

import { useEffect, useState } from "react";

import { assetUrl } from "@/lib/vault/assets";

type Resolved = { assetId: string; url: string | null };

/**
 * Resolve um `assetId` para um endereço utilizável.
 *
 * O id resolvido é guardado junto e conferido na saída, para trocar de asset
 * não mostrar a imagem anterior por um frame.
 *
 * Não revoga nada no unmount porque não há mais nada a revogar: antes isto
 * devolvia uma blob URL do IndexedDB, e o cache global por aba existia para o
 * mesmo arquivo em várias cenas não vazar memória. Agora é uma URL do daemon,
 * e quem guarda cópia é o cache HTTP do browser.
 */
export function useAssetUrl(
  assetId: string | undefined,
  /** Pede a miniatura. Para lista -- ver `assetUrl`. */
  mini = false,
): string | null {
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!assetId) return;

    let active = true;
    void assetUrl(assetId, mini).then(
      (url) => {
        if (active) setResolved({ assetId, url });
      },
      () => {
        // Sem daemon alcançável a cena desenha sem a imagem, em vez de a tela
        // inteira cair.
        if (active) setResolved({ assetId, url: null });
      },
    );

    return () => {
      active = false;
    };
  }, [assetId, mini]);

  if (!assetId || resolved?.assetId !== assetId) return null;

  return resolved.url;
}
