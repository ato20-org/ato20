"use client";

import { useCallback } from "react";

import { useLayoutStore } from "@/lib/store/use-layout-store";
import { usePanelsStore } from "@/lib/store/use-panels-store";
import { chaveDe, useWindowStore, type ConteudoJanela } from "@/lib/store/use-window-store";

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
 */
export function useAbrirJanela(): (conteudo: ConteudoJanela) => void {
  const layout = useLayoutStore((state) => state.layout);
  const ativarAba = useLayoutStore((state) => state.ativarAba);

  const mostrarColuna = usePanelsStore((state) => state.show);

  const abrirFlutuante = useWindowStore((state) => state.abrir);

  return useCallback(
    (conteudo: ConteudoJanela) => {
      const chave = chaveDe(conteudo);

      for (const lado of ["esquerda", "direita"] as const) {
        const grupo = layout[lado].grupos.find((atual) =>
          atual.abas.some((aba) => chaveDe(aba) === chave),
        );

        if (!grupo) continue;

        // A coluna primeiro: ativar uma aba dentro de uma coluna recolhida
        // mudaria algo que ninguém vê.
        mostrarColuna(lado === "esquerda" ? "left" : "right");

        ativarAba(lado, grupo.id, chave);
        return;
      }

      // `abrir` já traz para a frente quando a janela existe na pilha, e a
      // janela nova entra com fade e zoom por conta própria.
      abrirFlutuante(conteudo);
    },
    [layout, ativarAba, mostrarColuna, abrirFlutuante],
  );
}
