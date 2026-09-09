"use client";

import { useCallback } from "react";

import { useLayoutStore } from "@/lib/store/use-layout-store";
import { useWindowStore } from "@/lib/store/use-window-store";

/**
 * Fecha uma janela sem saber onde ela está.
 *
 * Uma janela tem dois endereços possíveis — flutuando na pilha do
 * `useWindowStore`, ou atracada como aba de um grupo do `useLayoutStore` — e
 * quem pede para fechar em geral não sabe qual dos dois: a ficha que se fecha
 * porque o personagem foi apagado é o mesmo componente nos dois casos.
 *
 * Chama os dois, e é de propósito: cada store tira de casa o que era seu e
 * ignora o que não conhece. Uma consulta antes ("onde está esta chave?") seria
 * uma pergunta a mais para chegar na mesma remoção.
 */
export function useFecharJanela(): (chave: string) => void {
  const fecharFlutuante = useWindowStore((state) => state.fechar);
  const removerAba = useLayoutStore((state) => state.removerAba);

  return useCallback(
    (chave: string) => {
      fecharFlutuante(chave);
      removerAba(chave);
    },
    [fecharFlutuante, removerAba],
  );
}
