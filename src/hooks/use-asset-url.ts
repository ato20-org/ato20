"use client";

import { useEffect, useState } from "react";

import { resolveAssetUrl } from "@/lib/assets/resolve";
import { useRoomStore } from "@/lib/store/use-room-store";

type Resolved = { assetId: string; url: string | null };

/**
 * Resolve um `assetId` para um endereço utilizável: blob local no Operador,
 * URL do Storage no celular do jogador.
 *
 * O id resolvido é guardado junto e conferido na saída, para trocar de asset
 * não mostrar a imagem anterior por um frame. `roomId` entra nas dependências
 * mas não no portão: a sala aparece depois do primeiro render, e uma imagem
 * local já resolvida não deve piscar em branco quando isso acontece.
 *
 * Não revoga no unmount de propósito: o cache de blob URLs é global por aba e
 * o mesmo asset pode estar em várias cenas e na biblioteca ao mesmo tempo.
 * Quem apaga o asset revoga.
 */
export function useAssetUrl(assetId: string | undefined): string | null {
  const roomId = useRoomStore((state) => state.room?.id ?? null);
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!assetId) return;

    let active = true;
    void resolveAssetUrl(assetId, roomId).then((url) => {
      if (active) setResolved({ assetId, url });
    });

    return () => {
      active = false;
    };
  }, [assetId, roomId]);

  if (!assetId || resolved?.assetId !== assetId) return null;

  return resolved.url;
}
