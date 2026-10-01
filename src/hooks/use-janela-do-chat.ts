"use client";

import { useJanelaQueAparece } from "@/hooks/use-janela-que-aparece";
import { useFioStore } from "@/lib/store/use-fio-store";
import type { ConteudoJanela } from "@/lib/store/use-window-store";

const CHAT: ConteudoJanela = { tipo: "chat" };

/**
 * A janela de Chat aparece sozinha quando um jogador escreve.
 *
 * Pelo mesmo motivo da de Rolagens (ver `useJanelaDeRolagens`): o recado nasce
 * do outro lado da mesa, e o Mestre pode estar de olho no mapa. Só a MENSAGEM
 * — o dado do jogador também entra no fio, mas quem aparece por ele é a janela
 * de Rolagens, e abrir as duas a cada dado seria a bancada mudando sozinha no
 * meio da cena. Ver `ultimaMensagemDeFora`.
 */
export function useJanelaDoChat() {
  const ultima = useFioStore((state) => state.ultimaMensagemDeFora);

  useJanelaQueAparece(CHAT, ultima);
}
