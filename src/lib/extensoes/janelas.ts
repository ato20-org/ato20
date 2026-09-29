"use client";

import { useLayoutStore } from "@/lib/store/use-layout-store";
import { usePanelsStore } from "@/lib/store/use-panels-store";
import {
  chaveDe,
  useWindowStore,
  type ConteudoJanela,
} from "@/lib/store/use-window-store";

/**
 * Abrir e fechar uma janela de onde não há React.
 *
 * `useAbrirJanela` e `useFecharJanela` são hooks, e o `ativar` de um plugin
 * não é um componente: ele roda uma vez, fora de qualquer render, e um comando
 * de plugin roda de dentro de um `keydown`. As duas funções aqui são a mesma
 * lógica dos hooks lendo os stores por `getState`, e os hooks passaram a
 * chamá-las -- um caminho só, para "onde esta janela está?" não ter duas
 * respostas.
 *
 * Uma janela tem duas casas possíveis, e quem pede não sabe qual: atracada
 * como aba de um grupo (`useLayoutStore`) ou flutuando na pilha
 * (`useWindowStore`). Sem esta pergunta, pedir uma tela JÁ ATRACADA abria uma
 * segunda cópia flutuante da mesma tela.
 */
export function abrirJanela(conteudo: ConteudoJanela): void {
  const chave = chaveDe(conteudo);
  const { layout, ativarAba } = useLayoutStore.getState();

  for (const lado of ["esquerda", "direita"] as const) {
    const grupo = layout[lado].grupos.find((atual) =>
      atual.abas.some((aba) => chaveDe(aba) === chave),
    );

    if (!grupo) continue;

    // A coluna primeiro: ativar uma aba dentro de uma coluna recolhida mudaria
    // algo que ninguém vê.
    usePanelsStore.getState().show(lado === "esquerda" ? "left" : "right");
    ativarAba(lado, grupo.id, chave);
    return;
  }

  // `abrir` já traz para a frente quando a janela existe na pilha.
  useWindowStore.getState().abrir(conteudo);
}

/**
 * Fecha uma janela sem saber onde ela está.
 *
 * Chama os dois stores, de propósito: cada um tira de casa o que era seu e
 * ignora o que não conhece. Uma consulta antes ("onde está esta chave?") seria
 * uma pergunta a mais para chegar na mesma remoção.
 */
export function fecharJanela(chave: string): void {
  useWindowStore.getState().fechar(chave);
  useLayoutStore.getState().removerAba(chave);
}
