"use client";

import { createContext, useContext } from "react";

/**
 * Onde os portais desta árvore se desenham: menu, popover, dica, diálogo.
 *
 * Fora de uma janela solta é `undefined`, e o portal vai ao `body` do
 * documento, como sempre. Dentro de uma, é o `body` DELA: a janela solta é
 * outro documento desenhado pelo mesmo React (ver `janela-solta.tsx`), e o
 * portal sem isto abriria o menu na janela do Mestre, no outro monitor.
 */
const Contexto = createContext<HTMLElement | null>(null);

export const ProvedorDoContainerDosPortais = Contexto.Provider;

export function useContainerDosPortais(): HTMLElement | undefined {
  return useContext(Contexto) ?? undefined;
}
