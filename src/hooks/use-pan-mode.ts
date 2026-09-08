"use client";

import { useToolStore } from "@/lib/store/use-tool-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";

/**
 * O modo de deslocar a cena está ativo — por ferramenta ou por tecla.
 *
 * As duas origens existem porque são gestos diferentes para a mesma coisa. O
 * espaço é momentâneo: segura, arrasta, solta, e volta ao que se estava
 * fazendo. A mãozinha é escolha: fica ativa até o mestre trocar de ferramenta,
 * que é o que serve para percorrer um mapa grande sem manter a mão esquerda
 * presa no teclado — e é o único caminho para quem opera com uma mão só, ou num
 * trackpad, sem terceiro botão de mouse.
 *
 * Existe como hook, e não como um `||` repetido, porque duas telas precisam da
 * MESMA resposta: o `SceneStage` decide se o arrasto desloca a cena, e o
 * `OperatorStage` decide se os itens continuam agarráveis. Derivar isso em dois
 * lugares é a receita para uma delas ficar para trás — o palco deslocando
 * enquanto o outro ainda entrega os itens ao mesmo gesto.
 *
 * O espaço vence por cima da ferramenta em vez de alternar: com a mãozinha já
 * escolhida, segurar espaço não muda nada, e é o certo — `true || true`.
 */
export function usePanMode(): boolean {
  const porTecla = useViewportStore((state) => state.panMode);
  const ferramenta = useToolStore((state) => state.tool);

  return porTecla || ferramenta === "hand";
}
