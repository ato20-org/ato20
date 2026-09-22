"use client";

import { create } from "zustand";

import {
  CORES_POSTIT,
  FORMA_ESPESSURA,
  type CorPostit,
  type FormaMedidor,
  type FormatoDeArea,
  type TipoDeForma,
} from "@/types/scene";

/**
 * `select` é o modo normal, `hand` desloca a cena no arrasto, `fog` desenha uma
 * área escondida -- no arrasto se ela for retângulo ou elipse, vértice a
 * vértice se for polígono, conforme `formatoDeArea` --, `pin` crava um ponto de
 * anotação no clique,
 * `postit` cola um papel de texto no clique, e `lapis`/`borracha` riscam e
 * apagam à mão livre.
 *
 * `pin` e `postit` são os dois do mestre e ficam lado a lado, mas não são a
 * mesma coisa: o alfinete é uma coordenada com nota fechada atrás dela — bom
 * para a preparação que não pode estar à vista o tempo todo —, e o postit é
 * texto ABERTO sobre uma região, que é o que se quer para o que precisa ser
 * lido de relance no meio da sessão.
 *
 * `regua` coloca um medidor no arrasto -- régua, círculo, cone ou retângulo,
 * conforme `formaMedidor` -- e mora colada na grade, na pílula do mapa: ela só
 * significa algo com a grade ligada, porque é o quadrado que diz quanto vale
 * um metro. Ver `METROS_POR_QUADRADO` e `Medidor`.
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
  | "regua"
  // As três do QUADRO: `texto` escreve direto na folha no clique, `ligacao`
  // amarra duas coisas com uma seta em dois cliques -- de onde, para onde --, e
  // `forma` desenha retângulo, elipse ou linha no arrasto, conforme
  // `tipoDeForma`.
  | "texto"
  | "ligacao"
  | "forma"
  // A de uma EXTENSAO, no formato `ext:{extensaoId}/{ferramentaId}`.
  //
  // Prefixo e nao um campo separado no store porque a ferramenta e UM valor em
  // dezenas de comparacoes espalhadas pelo palco: um par obrigaria todas elas a
  // comparar duas coisas, e a primeira esquecida deixaria a ferramenta do
  // plugin agindo como `select`.
  | `ext:${string}`;

/** O prefixo que separa ferramenta de plugin das de fabrica. */
export const PREFIXO_FERRAMENTA_EXT = "ext:";

/** Esta ferramenta e de extensao? Devolve quem a trouxe e qual e. */
export function ferramentaDeExtensao(
  tool: Tool,
): { extensaoId: string; ferramentaId: string } | null {
  if (!tool.startsWith(PREFIXO_FERRAMENTA_EXT)) return null;

  const [extensaoId, ferramentaId] = tool.slice(PREFIXO_FERRAMENTA_EXT.length).split("/");

  return extensaoId && ferramentaId ? { extensaoId, ferramentaId } : null;
}

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

  /**
   * A forma e a cor do PRÓXIMO medidor.
   *
   * Aqui pelas mesmas razões do lápis: preferência de quem mede, vale para a
   * cena seguinte, e cada medidor guarda a cópia da cor com que nasceu. A
   * régua reta é o padrão porque é a pergunta mais comum -- "quanto tem daqui
   * até ali". As cores são as do lápis: o medidor vive sobre o mesmo mapa.
   */
  formaMedidor: FormaMedidor;
  corMedidor: string;
  setMedidor: (medidor: { formaMedidor?: FormaMedidor; corMedidor?: string }) => void;

  /**
   * O tipo, a cor, a espessura e o fundo da PRÓXIMA forma do quadro.
   *
   * Aqui pelas mesmas razões do lápis: é preferência de quem desenha, vale para
   * a cena seguinte, e cada forma guarda a cópia do que estava escolhido quando
   * nasceu. As cores são as do lápis -- é o mesmo gesto de marcar, e duas
   * paletas diferentes para a mesma folha seriam duas linguagens.
   *
   * Sem fundo por padrão: uma caixa cheia sobre o quadro esconderia o que está
   * atrás dela, e o uso normal é CERCAR. Ver `Forma`.
   */
  /**
   * O recorte da PRÓXIMA área escondida.
   *
   * Aqui pelas mesmas razões do tipo de forma: é preferência de quem esconde, e
   * cada área guarda o formato com que nasceu -- trocar este não remodela o que
   * já está no mapa. O retângulo é o padrão porque é o que a área sempre foi, e
   * é o que cobre uma sala.
   */
  formatoDeArea: FormatoDeArea;
  setFormatoDeArea: (formato: FormatoDeArea) => void;

  tipoDeForma: TipoDeForma;
  /** Ausente = a cor do tema. Ver `Forma`. */
  corForma?: string;
  espessuraForma: number;
  fundoForma?: string;
  setForma: (forma: {
    tipoDeForma?: TipoDeForma;
    /** `null` volta à cor do tema, como `fundoForma` volta ao vazado. */
    corForma?: string | null;
    espessuraForma?: number;
    /** `null` tira o fundo -- `undefined` deixaria o valor como está. */
    fundoForma?: string | null;
  }) => void;
};

export const useToolStore = create<ToolStore>((set) => ({
  tool: "select",
  setTool: (tool) => set({ tool }),

  cor: CORES_LAPIS[0],
  espessura: ESPESSURAS_LAPIS[1],
  setLapis: (lapis) => set(lapis),

  corPostit: CORES_POSTIT[0],
  setCorPostit: (corPostit) => set({ corPostit }),

  formaMedidor: "linha",
  corMedidor: CORES_LAPIS[5],
  setMedidor: (medidor) => set(medidor),

  formatoDeArea: "retangulo",
  setFormatoDeArea: (formatoDeArea) => set({ formatoDeArea }),

  tipoDeForma: "retangulo",
  corForma: undefined,
  espessuraForma: FORMA_ESPESSURA,
  fundoForma: undefined,
  setForma: ({ corForma, fundoForma, ...resto }) =>
    set({
      ...resto,
      ...(corForma !== undefined ? { corForma: corForma ?? undefined } : {}),
      ...(fundoForma !== undefined ? { fundoForma: fundoForma ?? undefined } : {}),
    }),
}));
