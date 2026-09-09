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
 * - atracada: abre a coluna se ela estiver recolhida, ativa a aba dela no grupo
 *   e pisca -- a janela pedida podia estar atrás de outra aba, ou dentro de uma
 *   coluna escondida, e nos dois casos apontar sem revelar leria como nada;
 * - flutuando: vem para a frente da pilha e pisca, pela mesma razão;
 * - em lugar nenhum: nasce flutuante.
 *
 * A piscada é o que responde ao clique quando não há nada para abrir. Sem ela o
 * gesto parecia falhar, e a reação natural era clicar de novo.
 */
export function useAbrirJanela(): (conteudo: ConteudoJanela) => void {
  const layout = useLayoutStore((state) => state.layout);
  const ativarAba = useLayoutStore((state) => state.ativarAba);

  const mostrarColuna = usePanelsStore((state) => state.show);

  const abrirFlutuante = useWindowStore((state) => state.abrir);
  const piscar = useWindowStore((state) => state.piscar);

  return useCallback(
    (conteudo: ConteudoJanela) => {
      const chave = chaveDe(conteudo);

      for (const lado of ["esquerda", "direita"] as const) {
        const grupo = layout[lado].grupos.find((atual) =>
          atual.abas.some((aba) => chaveDe(aba) === chave),
        );

        if (!grupo) continue;

        // A coluna primeiro: piscar uma aba dentro de uma coluna recolhida
        // acenderia algo que ninguém vê. A piscada entra 20ms depois — ver
        // `piscar` —, então a coluna já montou quando ela chega.
        mostrarColuna(lado === "esquerda" ? "left" : "right");

        ativarAba(lado, grupo.id, chave);
        piscar(chave);
        return;
      }

      // `abrir` já traz para a frente quando a janela existe na pilha. A
      // piscada acompanha nos dois casos: quem clica não sabe se ela estava
      // atrás de outra ou se acabou de nascer, e piscar no nascimento não
      // atrapalha — a janela já entra com fade e zoom.
      abrirFlutuante(conteudo);
      piscar(chave);
    },
    [layout, ativarAba, mostrarColuna, abrirFlutuante, piscar],
  );
}
