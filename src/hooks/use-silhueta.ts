"use client";

import { useEffect, useState } from "react";

import { silhuetaDaImagem, type Silhueta } from "@/lib/silhueta";

type Assada = { url: string; silhueta: Silhueta | null };

/**
 * A silhueta preta de uma imagem, assada uma vez e guardada para sempre.
 *
 * `null` enquanto o forno trabalha e `null` para sempre se ele falhar — nos
 * dois casos quem chamou desenha o que desenhava antes. Ver `silhuetaDaImagem`.
 *
 * A url assada é guardada junto e conferida na saída, como faz o `useAssetUrl`:
 * trocar o arquivo de um item mostraria a silhueta do anterior por um quadro,
 * e sombra de outra figura é pior que sombra nenhuma.
 */
export function useSilhueta(url: string | null): Silhueta | null {
  const [assada, setAssada] = useState<Assada | null>(null);

  useEffect(() => {
    if (!url) return;

    let ativo = true;

    void silhuetaDaImagem(url).then((silhueta) => {
      if (ativo) setAssada({ url, silhueta });
    });

    return () => {
      ativo = false;
    };
  }, [url]);

  if (!url || assada?.url !== url) return null;

  return assada.silhueta;
}
