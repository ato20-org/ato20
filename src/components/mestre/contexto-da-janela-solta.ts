"use client";

import { createContext, useContext } from "react";

import type { ConteudoJanela } from "@/lib/store/use-window-store";

/**
 * A janela solta em que este pedaço da árvore está desenhado, ou `null` quando
 * é o Mestre. Ver `janela-solta.tsx`.
 *
 * Num módulo à parte, e não junto de quem monta a janela: quem lê é o
 * `useAbrirJanela`, que todo corpo de janela importa, e o módulo que monta
 * importa todos os corpos -- os dois juntos seriam um laço de imports.
 */
export type JanelaSoltaAqui = {
  id: string;
  /** O documento da janela solta, que não é o `document` do Mestre. */
  documento: Document;
  /**
   * Abre uma janela A PARTIR desta: o editor do efeito clicado no Compêndio
   * solto abre solto também, ao lado, e não no monitor do Mestre.
   */
  abrir: (conteudo: ConteudoJanela) => void;
};

const Contexto = createContext<JanelaSoltaAqui | null>(null);

export const ProvedorDaJanelaSolta = Contexto.Provider;

export function useJanelaSolta(): JanelaSoltaAqui | null {
  return useContext(Contexto);
}
