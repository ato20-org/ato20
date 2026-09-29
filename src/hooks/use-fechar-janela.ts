"use client";

import { useCallback } from "react";

import { fecharJanela } from "@/lib/extensoes/janelas";

/**
 * Fecha uma janela sem saber onde ela está.
 *
 * Uma janela tem dois endereços possíveis — flutuando na pilha do
 * `useWindowStore`, ou atracada como aba de um grupo do `useLayoutStore` — e
 * quem pede para fechar em geral não sabe qual dos dois: a ficha que se fecha
 * porque o personagem foi apagado é o mesmo componente nos dois casos.
 *
 * A lógica mora em `fecharJanela`, pela mesma razão do `useAbrirJanela`: a
 * API de extensão a chama de fora de um render.
 */
export function useFecharJanela(): (chave: string) => void {
  return useCallback((chave: string) => fecharJanela(chave), []);
}
