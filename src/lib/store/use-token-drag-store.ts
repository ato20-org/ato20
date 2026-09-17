"use client";

import { create } from "zustand";

import { MIN_ITEM_SIZE } from "@/lib/geometry/transform";

/**
 * A imagem no ar: o que um painel já soltou da mão e o destino ainda não
 * recebeu.
 *
 * ## Por que não é o arrasto do navegador
 *
 * Isto nasceu para o token da lista de personagens, que ia ao mapa por HTML5
 * drag-and-drop como o acervo e o inventário iam. Esse arrasto não serve por
 * duas razões, e as duas são justamente o que estas telas precisam mostrar:
 *
 * - durante um arrasto nativo o conteúdo do `dataTransfer` é ilegível por
 *   segurança, e o palco só sabe QUE tipo vem, não qual imagem — não dá para
 *   desenhar a prévia do que está chegando;
 * - o navegador entra num laço de arrasto do sistema e engole a roda e o
 *   teclado. Só o `Escape` sobrevive. Sem a roda não há como escolher o tamanho
 *   no ar.
 *
 * Então o gesto é próprio, por `pointer capture` — ver `useTokenDrag`. O que
 * este store carrega é o meio do gesto, e ele morre quando o ponteiro solta:
 * guardado dentro da cena, cada quadro do arrasto marcaria a cena como alterada
 * e a gravaria no disco. Mesma decisão do `useDockDragStore`.
 *
 * "Token" aqui é a peça que vai ao mapa, venha ela de onde vier: a linha do
 * personagem, a linha do acervo ou o quadro do inventário. Os três gestos são o
 * mesmo gesto, e separá-los em três arrastos daria três sombras a manter.
 */
export type FonteDoArrasto =
  /** A miniatura do personagem, que já é arquivo do acervo. */
  | { tipo: "personagem"; personagemId: string; assetId: string }
  /** Uma imagem da biblioteca. */
  | { tipo: "acervo"; assetId: string }
  /** Uma imagem do handout da cena, que é id de acervo. Ver `Scene.handout`. */
  | { tipo: "handout"; assetId: string }
  /**
   * Um item de inventário.
   *
   * Carrega a URL já resolvida, e não um `assetId`, porque a imagem do item
   * pode ser um anexo do personagem, que não tem id de acervo. Ele só vira
   * asset quando é solto no mapa — ver `promoverImagemDoItem`, que é ida ao
   * disco e não cabe num `pointerdown`, que é síncrono.
   */
  | { tipo: "item"; personagemId: string; itemId: string; url: string };

/**
 * Onde o ponteiro está AGORA, entre os lugares que aceitam o que está na mão.
 *
 * `null` é "em cima de nada que receba" — a folga em volta do mapa, uma janela
 * da bancada sobre o palco, uma pasta que recusa item de inventário. Ali a
 * sombra some e soltar não faz nada, que é o que a sombra prometeu ao sumir.
 */
export type DestinoDoArrasto =
  | { tipo: "palco" }
  /** Uma pasta do acervo. `folderId` ausente é a raiz, "Fora de pasta". */
  | { tipo: "pasta"; folderId: string | undefined }
  /** A grade de inventário de outro personagem. */
  | { tipo: "inventario"; personagemId: string }
  /** A bolinha do handout da cena em edição. */
  | { tipo: "handout" };

export type ArrastoDeToken = {
  fonte: FonteDoArrasto;
  /** O tamanho com que o token nasceria sem a roda, em unidades de cena. */
  largura: number;
  altura: number;
  /** O que a roda fez com esse tamanho. 1 é o tamanho de nascença. */
  fator: number;
  /** Onde está o ponteiro, em pixels da janela. */
  x: number;
  y: number;
  destino: DestinoDoArrasto | null;
};

/** O arquivo do acervo que está sendo arrastado, quando há um. */
export function assetIdDoArrasto(fonte: FonteDoArrasto): string | undefined {
  return fonte.tipo === "item" ? undefined : fonte.assetId;
}

/**
 * Cada alvo tem uma chave, e é por ela que o gesto acha quem recebe.
 *
 * Uma chave por INVENTÁRIO, e não uma só para todos: há mais de uma ficha
 * aberta ao mesmo tempo, e cada uma recebe o item na própria pasta.
 */
export function chaveDoAlvo(destino: DestinoDoArrasto): string {
  switch (destino.tipo) {
    case "palco":
      return "palco";
    case "pasta":
      return "acervo";
    case "inventario":
      return `inventario:${destino.personagemId}`;
    case "handout":
      return "handout";
  }
}

/**
 * Este arrasto pode cair aqui?
 *
 * Função pura e num lugar só porque a resposta é pedida duas vezes por quadro —
 * uma para acender a borda do alvo, outra para decidir se soltar faz algo — e
 * as duas têm de concordar. Quando divergiam, a borda prometia um movimento que
 * o destino recusava.
 *
 * - pasta do acervo só recebe imagem do acervo: ali o gesto é "guarde este
 *   arquivo aqui", e item de inventário e miniatura de personagem não são
 *   arquivos que se guardem — a casa deles é a ficha;
 * - inventário só recebe item, e nunca o do próprio dono: mover um item para
 *   onde ele já está é um gesto sem efeito, e o Rust o recusa.
 */
export function aceita(
  fonte: FonteDoArrasto,
  destino: DestinoDoArrasto,
): boolean {
  switch (destino.tipo) {
    case "palco":
      return true;
    case "pasta":
      return fonte.tipo === "acervo";
    case "inventario":
      return (
        fonte.tipo === "item" && fonte.personagemId !== destino.personagemId
      );
    case "handout":
      // Só do acervo: o handout guarda ids de acervo, e retrato de personagem
      // e imagem de item já têm dono. Ver `Scene.handout`.
      return fonte.tipo === "acervo";
  }
}

/** O que um alvo faz com o que foi solto nele. */
export type AoSoltar = (
  arrasto: ArrastoDeToken,
  destino: DestinoDoArrasto,
) => void;

type TokenDragStore = {
  arrasto: ArrastoDeToken | null;
  /**
   * Quem sabe receber, por chave.
   *
   * Funções guardadas no store, e não o gesto chamando as ações direto, porque
   * cada destino precisa de contexto que só ele tem: o palco converte o ponto
   * do ponteiro em coordenada de cena com a escala e o deslocamento que vivem
   * dentro do `SceneStage`; o inventário que recebe é quem sabe avisar a lista
   * de arquivos do personagem que ela mudou.
   *
   * Quem registra cada um: `TokenFantasma` o palco, `AssetLibrary` o acervo,
   * `InventarioPersonagem` a própria grade.
   */
  alvos: Record<string, AoSoltar | undefined>;

  /** Levanta o token. Chamado quando o gesto passa do limiar de clique. */
  pegar: (arrasto: ArrastoDeToken) => void;
  mover: (x: number, y: number, destino: DestinoDoArrasto | null) => void;
  /** A roda: `passo` maior que 1 cresce, menor encolhe. */
  ajustar: (passo: number) => void;
  largar: () => void;
  /** Devolve a função que desfaz o registro. Use no `return` do efeito. */
  registrarAlvo: (chave: string, aoSoltar: AoSoltar) => () => void;
};

/**
 * De quanto a roda mexe no tamanho, por entalhe.
 *
 * Menor que o passo do zoom do palco (1,15): ali a roda enquadra o mapa e
 * errar meia volta se conserta com a volta seguinte; aqui ela escolhe o tamanho
 * com que o token vai ficar, e o mestre está mirando um quadrado da grade.
 */
export const PASSO_DA_RODA = 1.1;

/**
 * Até onde a roda cresce.
 *
 * Quatro vezes, e não livre, porque o gesto não tem trilho de volta: quem passa
 * de vinte entalhes para um lado precisa de vinte para o outro para achar o
 * tamanho de novo. Acima disso o token cobre o mapa inteiro, tamanho que
 * ninguém escolhe de propósito.
 */
const FATOR_MAX = 4;

/**
 * Até onde a roda encolhe: até o lado CURTO bater no mesmo piso do gizmo.
 *
 * Era um quarto do tamanho de nascença, e não bastava: a miniatura nasce em
 * até 40% da cena, e um quarto disso ainda é um token de dez quadrados da
 * grade. O piso agora é absoluto, e é o mesmo que o redimensionar pelos cantos
 * respeita -- assim o que a roda deixa soltar é o que a alça deixa encolher.
 */
function fatorMinimo(arrasto: Pick<ArrastoDeToken, "largura" | "altura">): number {
  return MIN_ITEM_SIZE / Math.min(arrasto.largura, arrasto.altura);
}

/** O tamanho que o token terá se for solto agora, em unidades de cena. */
export function tamanhoDoArrasto(arrasto: ArrastoDeToken): {
  largura: number;
  altura: number;
} {
  return {
    largura: Math.round(arrasto.largura * arrasto.fator),
    altura: Math.round(arrasto.altura * arrasto.fator),
  };
}

export const useTokenDragStore = create<TokenDragStore>((set, get) => ({
  arrasto: null,
  alvos: {},

  pegar(arrasto) {
    set({ arrasto });
  },

  mover(x, y, destino) {
    set((state) =>
      state.arrasto
        ? { arrasto: { ...state.arrasto, x, y, destino } }
        : state,
    );
  },

  ajustar(passo) {
    set((state) => {
      if (!state.arrasto) return state;

      const fator = Math.min(
        FATOR_MAX,
        Math.max(fatorMinimo(state.arrasto), state.arrasto.fator * passo),
      );

      // Identidade preservada no batente: sem isto, rodar contra o limite
      // redesenharia a prévia a cada entalhe para não mudar nada.
      if (fator === state.arrasto.fator) return state;

      return { arrasto: { ...state.arrasto, fator } };
    });
  },

  largar() {
    set({ arrasto: null });
  },

  /**
   * Os alvos vão e voltam: o palco desmonta ao trocar de campanha, e uma ficha
   * de personagem fecha a qualquer momento. Um registro velho apontaria para a
   * cena de antes ou para uma janela que já não existe.
   */
  registrarAlvo(chave, aoSoltar) {
    set((state) => ({ alvos: { ...state.alvos, [chave]: aoSoltar } }));

    return () => {
      // Só se ainda for o MESMO: duas montagens seguidas do mesmo alvo — o que
      // o StrictMode faz em desenvolvimento — desfariam o registro da segunda
      // na limpeza da primeira, e soltar ali deixaria de fazer qualquer coisa.
      if (get().alvos[chave] !== aoSoltar) return;

      set((state) => {
        const alvos = { ...state.alvos };
        delete alvos[chave];

        return { alvos };
      });
    };
  },
}));
