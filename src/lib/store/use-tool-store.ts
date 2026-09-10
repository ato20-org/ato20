"use client";

import { create } from "zustand";

import { CORES_POSTIT, type CorPostit } from "@/types/scene";

/**
 * `select` é o modo normal, `hand` desloca a cena no arrasto, `fog` desenha uma
 * área escondida no arrasto, `pin` crava um ponto de anotação no clique,
 * `postit` cola um papel de texto no clique, e `lapis`/`borracha` riscam e
 * apagam à mão livre.
 *
 * `pin` e `postit` são os dois do mestre e ficam lado a lado, mas não são a
 * mesma coisa: o alfinete é uma coordenada com nota fechada atrás dela — bom
 * para a preparação que não pode estar à vista o tempo todo —, e o postit é
 * texto ABERTO sobre uma região, que é o que se quer para o que precisa ser
 * lido de relance no meio da sessão.
 *
 * `regua` mede em metros no arrasto, e mora ao lado da grade e não na barra de
 * ferramentas: ela só significa algo com a grade ligada, porque é o quadrado
 * que diz quanto vale um metro. Ver `METROS_POR_QUADRADO`.
 *
 * As duas de mira são de gesto diferente de propósito: área é arrasto, porque
 * ela tem tamanho; ponto é clique, porque ele não tem — pedir um arrasto para
 * cravar um alfinete faria o mestre desenhar uma caixa invisível sem saber.
 *
 * `hand` não substitui o espaço segurado, que continua sendo o caminho
 * momentâneo. Ver `usePanMode`, que junta os dois.
 */
export type Tool =
  | "select"
  | "hand"
  | "fog"
  | "pin"
  | "postit"
  | "lapis"
  | "borracha"
  | "regua";

/**
 * As cores do lápis.
 *
 * Poucas e de propósito: um seletor contínuo pede decisão a cada risco, e o que
 * o mestre quer é "o vermelho" — a cor aqui é código combinado na mesa ("o
 * caminho é o azul"), não escolha de arte. Fortes e saturadas porque o risco
 * vive sobre um mapa que já é cheio de cor.
 */
export const CORES_LAPIS = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ffffff",
] as const;

/** Espessuras, em unidades de cena. A do meio é o padrão. */
export const ESPESSURAS_LAPIS = [3, 6, 12, 24] as const;

type ToolStore = {
  tool: Tool;
  setTool: (tool: Tool) => void;

  /**
   * A cor e a espessura do próximo risco.
   *
   * No store da ferramenta e não na cena: é preferência de quem desenha, e vale
   * para a cena seguinte também. O risco guarda a cópia do que estava escolhido
   * quando ele nasceu — mudar a cor depois não repinta o que já está no mapa.
   *
   * Não persiste: escolher a cor é um clique, e restaurá-la ao abrir o
   * aplicativo não vale um arquivo.
   */
  cor: string;
  espessura: number;
  setLapis: (lapis: { cor?: string; espessura?: number }) => void;

  /**
   * A cor do PRÓXIMO postit colado.
   *
   * Aqui e não na cena pela mesma razão da cor do lápis: é preferência de quem
   * anota, e vale para a cena seguinte. Cada postit guarda a cópia da cor que
   * estava escolhida quando ele nasceu — trocar esta não repinta o que já está
   * no mapa, e trocar a cor de um papel já colado é botão dele.
   *
   * É o que faz colar três pistas em rosa seguidas ser três cliques, e não seis.
   */
  corPostit: CorPostit;
  setCorPostit: (cor: CorPostit) => void;
};

export const useToolStore = create<ToolStore>((set) => ({
  tool: "select",
  setTool: (tool) => set({ tool }),

  cor: CORES_LAPIS[0],
  espessura: ESPESSURAS_LAPIS[1],
  setLapis: (lapis) => set(lapis),

  corPostit: CORES_POSTIT[0],
  setCorPostit: (corPostit) => set({ corPostit }),
}));
