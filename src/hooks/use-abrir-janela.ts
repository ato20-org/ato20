"use client";

import { useCallback } from "react";

import { abrirJanela } from "@/lib/extensoes/janelas";
import type { ConteudoJanela } from "@/lib/store/use-window-store";

/**
 * Traz uma janela à vista, onde ela já estiver.
 *
 * O par do `useFecharJanela`, e existe pelo mesmo motivo: uma janela tem duas
 * casas possíveis, e quem pede para abrir não sabe qual. Sem isto, o
 * `useWindowStore.abrir` consultava só a pilha flutuante — pedir Personagens
 * com a lista JÁ ATRACADA na coluna abria uma segunda cópia da mesma tela, cada
 * uma com sua rolagem e sua busca.
 *
 * Três desfechos, e nenhum deles duplica:
 *
 * - atracada: abre a coluna se ela estiver recolhida e ativa a aba dela no
 *   grupo -- a janela pedida podia estar atrás de outra aba, ou dentro de uma
 *   coluna escondida, e nos dois casos apontar sem revelar leria como nada;
 * - flutuando: vem para a frente da pilha;
 * - em lugar nenhum: nasce flutuante.
 *
 * Houve uma PISCADA aqui, nos dois primeiros casos, para responder ao clique
 * quando não havia nada a abrir. Saiu: os dois já respondem sozinhos -- a
 * coluna abre, a aba troca, a janela sobe --, e a batida por cima disso pegava
 * justamente o caso comum, o de clicar num nome e ver a ficha que já estava à
 * vista tremer. O que se perde é o aviso quando a janela já está na frente e
 * inteira à mostra, onde clicar de novo de fato não muda nada.
 *
 * A lógica mora em `abrirJanela`, que lê os stores por `getState`: a API de
 * extensão precisa dela fora de um componente, e dois caminhos para "onde esta
 * janela está?" divergiriam na primeira mudança. O hook é só a referência
 * estável para quem está num render.
 */
export function useAbrirJanela(): (conteudo: ConteudoJanela) => void {
  return useCallback((conteudo: ConteudoJanela) => abrirJanela(conteudo), []);
}
