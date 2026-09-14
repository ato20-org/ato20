"use client";

import { useMemo } from "react";

import { useDadosStore } from "@/lib/store/use-dados-store";
import type { Dado } from "@/types/dado";

/**
 * Os dados que ainda CONTAM como mesa: fora os que estão sendo engolidos.
 *
 * Existe porque o dado recolhido continua em `dados` enquanto a sucção o leva
 * até a boca do saquinho — é o que permite animá-lo, ver `succao`. Para quem
 * DESENHA isso é exatamente o certo; para quem CONTA, não: sem este filtro, o
 * saquinho seguiria oferecendo "Recolher os 3 dados" e somando na mesa três
 * dados que já estão a meio caminho de dentro dele.
 *
 * O contador da bolinha usa o mesmo: ele existe para dizer que há o que
 * recolher, e um número que só zera meio segundo depois do clique parece
 * um botão que não funcionou.
 */
export function useDadosNaMesa(): Dado[] {
  const dados = useDadosStore((state) => state.dados);
  const succao = useDadosStore((state) => state.succao);

  return useMemo(() => {
    if (!succao) return dados;

    const engolidos = new Set(succao.ids);

    return dados.filter((dado) => !engolidos.has(dado.id));
  }, [dados, succao]);
}
