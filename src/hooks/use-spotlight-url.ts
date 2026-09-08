"use client";

import { useEffect, useState } from "react";

import { assetUrl } from "@/lib/vault/assets";
import { evidenceUrl } from "@/lib/vault/evidence";
import type { Spotlight } from "@/types/scene";

type Resolved = { chave: string; url: string | null };

/**
 * Resolve a evidência para um endereço exibível, venha ela de onde vier.
 *
 * Duas origens, um endereço: imagem do acervo sai por `/asset/{id}` e anexo de
 * jogador por `/evidencia/{id}`. Quem desenha — a TV, o celular, o aviso do
 * mestre — não deveria saber a diferença, e antes disto existir cada um deles
 * chamava `useAssetUrl` direto e simplesmente não teria como mostrar a segunda.
 *
 * A chave resolvida é conferida na saída, para trocar de imagem não mostrar a
 * anterior por um frame.
 */
export function useSpotlightUrl(spotlight: Spotlight | null): string | null {
  const chave = spotlight?.assetId ?? spotlight?.sharedId;

  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!spotlight || !chave) return;

    let ativo = true;

    const pedido = spotlight.assetId
      ? assetUrl(spotlight.assetId)
      : evidenceUrl(spotlight.sharedId ?? "");

    void pedido.then(
      (url) => {
        if (ativo) setResolved({ chave, url });
      },
      () => {
        // Sem daemon alcançável a tela fica sem a imagem, em vez de cair.
        if (ativo) setResolved({ chave, url: null });
      },
    );

    return () => {
      ativo = false;
    };
  }, [spotlight, chave]);

  if (!chave || resolved?.chave !== chave) return null;

  return resolved.url;
}
