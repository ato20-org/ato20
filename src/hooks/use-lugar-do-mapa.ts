"use client";

import { useEffect, useMemo, useState } from "react";

import { caberEm } from "@/lib/geometry/caber";
import type { ItemBox } from "@/lib/geometry/transform";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

export type LugarDoMapa = Pick<ItemBox, "x" | "y" | "width" | "height">;

/**
 * Onde o mapa cai no plano: a mesma conta de `FundoDaCena`, para quem pinta
 * pedaço do mapa FORA dele.
 *
 * É a laje do 2.5D. Ela mostra o pedaço de mapa que estava sob a parede, e
 * mostrava esticado no plano inteiro enquanto o chão o encaixa sem deformar: num
 * mapa 4:3 o teto saía com a grama do lado em vez das telhas, tanto mais
 * deslocado quanto mais longe do meio.
 *
 * `null` até o arquivo decodificar. Antes disso não há proporção, e chutar o
 * plano inteiro é exatamente o teto errado por um quadro. O arquivo é o mesmo
 * que o chão acabou de baixar, então a espera é um acerto de cache.
 */
export function useLugarDoMapa(url: string | undefined): LugarDoMapa | null {
  const [natural, setNatural] = useState<{
    url: string;
    largura: number;
    altura: number;
  } | null>(null);

  useEffect(() => {
    if (!url) return;

    let vivo = true;
    const carga = new Image();
    carga.src = url;

    const entregar = () => {
      if (vivo)
        setNatural({
          url,
          largura: carga.naturalWidth,
          altura: carga.naturalHeight,
        });
    };

    void carga.decode().then(entregar, entregar);

    return () => {
      vivo = false;
    };
  }, [url]);

  // A url é conferida na saída, como no `useCoresDasParedes`: trocar de mapa
  // mostraria o encaixe do anterior por um quadro.
  const valido = natural && natural.url === url ? natural : null;
  const largura = valido?.largura ?? 0;
  const altura = valido?.altura ?? 0;

  return useMemo(
    () =>
      largura > 0 && altura > 0
        ? caberEm({ largura, altura }, { width: SCENE_WIDTH, height: SCENE_HEIGHT })
        : null,
    [altura, largura],
  );
}
