"use client";

import { useMemo } from "react";

import { fontesDeRetrato, type FonteRetrato } from "@/lib/extensoes/fontes";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";

/**
 * As fontes de retrato ao vivo que as extensões habilitadas oferecem.
 *
 * Hook, e não leitura direta do store em cada lugar, por causa da identidade do
 * array: `fontesDeRetrato` constrói um novo a cada chamada, e um seletor de
 * zustand que devolve objeto novo faz o componente renderizar em toda mudança
 * do store. O `useMemo` sobre a lista de extensões — que só troca quando ela
 * troca de verdade — é o que prende isso.
 *
 * Só o Operador chama. O Assistir e a Plateia não têm extensão nenhuma: o que
 * chega a eles é o retrato já resolvido, com a URL e o canvas dentro.
 */
export function useFontesDeRetrato(): FonteRetrato[] {
  const extensoes = useExtensoesStore((state) => state.extensoes);

  return useMemo(() => fontesDeRetrato(extensoes), [extensoes]);
}
