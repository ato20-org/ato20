"use client";

import { useEffect, useState } from "react";

import { campaignCapaUrl } from "@/lib/vault/campaign";

/**
 * Uma promessa por campanha, por sessão. Mesmo desenho de `useCapaDoLivro`:
 * a porta é reaberta a cada volta ao início, e pedir a capa ao disco de novo a
 * cada montagem faria a lista piscar.
 *
 * As blob URLs não são revogadas: são doze miniaturas de 160px no máximo, e
 * viver a sessão inteira custa menos que o código de contar quem ainda as usa.
 *
 * `null` guardado = já tentou e não há capa; o cartão fica sem fundo e não
 * pergunta de novo.
 */
const capas = new Map<string, Promise<string | null>>();

/** A capa de uma campanha: `undefined` enquanto busca, `null` se não há. */
export function useCapaDaCampanha(
  path: string,
  /** Falso poupa a ida ao disco: pasta fora de alcance não tem capa. */
  ativa = true,
): string | null | undefined {
  const [capa, setCapa] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!ativa) return;

    let vivo = true;

    let promessa = capas.get(path);
    if (!promessa) {
      promessa = campaignCapaUrl(path).catch(() => null);
      capas.set(path, promessa);
    }

    void promessa.then((pronta) => {
      if (vivo) setCapa(pronta);
    });

    return () => {
      vivo = false;
    };
  }, [path, ativa]);

  return ativa ? capa : null;
}
