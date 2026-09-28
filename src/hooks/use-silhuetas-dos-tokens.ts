"use client";

import { useEffect, useState } from "react";

import { silhuetaDaImagem, type Silhueta } from "@/lib/silhueta";
import { assetUrl, type Variante } from "@/lib/vault/assets";

/** A silhueta de uma imagem, já decodificada para o canvas desenhar. */
export type SilhuetaPronta = { silhueta: Silhueta; imagem: HTMLImageElement };

/**
 * Uma imagem decodificada por silhueta, para sempre. Guarda a promessa pela
 * razão do forno: quarenta tokens do mesmo inimigo pedem a mesma no mesmo
 * quadro. Ver `silhuetaDaImagem`.
 */
const decodificadas = new Map<string, Promise<HTMLImageElement | null>>();

function imagemDaSilhueta(desenho: string): Promise<HTMLImageElement | null> {
  const feita = decodificadas.get(desenho);
  if (feita) return feita;

  const imagem = new Image();
  imagem.src = desenho;
  const decodificando = imagem.decode().then(
    () => imagem,
    () => null,
  );
  decodificadas.set(desenho, decodificando);

  return decodificando;
}

/**
 * As silhuetas dos tokens que a luz precisa deitar, por `assetId`.
 *
 * A MESMA url que o token e a sombra do sol já pedem -- a mesma `variante` --,
 * e por isso o mesmo forno: com o sol ligado a silhueta já está assada, e a
 * luz só a reaproveita. Ver `SombraDaFigura`.
 *
 * O mapa muda quando uma silhueta fica pronta, e é essa mudança que faz o
 * canvas repintar: até lá, o token deita a sombra curta do pé, como o sol deita
 * a mancha oval enquanto o forno trabalha. Uma que falhou -- arquivo ilegível,
 * canvas negado -- nunca entra, e o token fica com a do pé para sempre.
 */
export function useSilhuetasDosTokens(
  assetIds: ReadonlyArray<string>,
  variante?: Variante,
): ReadonlyMap<string, SilhuetaPronta> {
  const [prontas, setProntas] = useState<Map<string, SilhuetaPronta>>(
    () => new Map(),
  );

  // Uma string, e não a lista: a lista chega nova a cada quadro de um arrasto,
  // e as mesmas imagens não podem pedir as mesmas silhuetas de novo.
  const pedidas = [...new Set(assetIds.filter(Boolean))].sort().join("|");

  useEffect(() => {
    if (!pedidas) return;

    let ativo = true;

    for (const assetId of pedidas.split("|")) {
      void (async () => {
        const silhueta = await silhuetaDaImagem(
          await assetUrl(assetId, variante),
        );
        if (!silhueta) return;

        const imagem = await imagemDaSilhueta(silhueta.desenho);
        if (!imagem || !ativo) return;

        setProntas((antes) =>
          antes.get(assetId)?.silhueta === silhueta
            ? antes
            : new Map(antes).set(assetId, { silhueta, imagem }),
        );
      })().catch(() => {
        // Sem silhueta o token fica com a sombra do pé: nada a avisar.
      });
    }

    return () => {
      ativo = false;
    };
  }, [pedidas, variante]);

  return prontas;
}
