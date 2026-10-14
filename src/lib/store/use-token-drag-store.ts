"use client";

import { create } from "zustand";

import { MIN_SCENE_ITEM_SIZE } from "@/lib/geometry/transform";

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
  /**
   * A miniatura do personagem, que já é arquivo do acervo.
   *
   * `assetId` vazio é o personagem sem miniatura: ele não vai ao mapa, mas
   * ainda entra numa pasta e vira menção numa nota.
   *
   * `secao` diz de que seção da lista ele saiu, quando saiu de lá: a pasta de
   * NPCs só recebe NPC. Ver `Pasta.membros`.
   */
  | {
      tipo: "personagem";
      personagemId: string;
      assetId: string;
      secao?: "players" | "npcs";
    }
  /** Uma imagem da biblioteca. */
  | { tipo: "acervo"; assetId: string }
  /** Uma imagem do handout da cena, que é id de acervo. Ver `Scene.handout`. */
  | { tipo: "handout"; assetId: string }
  /**
   * Um anexo de ponto de anotação, que também é id de acervo. O ponto vai junto
   * para o cartão dele saber que a imagem na mão saiu dali. Ver
   * `MapPin.attachments`.
   */
  | { tipo: "ponto"; pinId: string; assetId: string }
  /**
   * Um item da campanha.
   *
   * `personagemId` diz de que INVENTÁRIO ele saiu, quando saiu de um: largado
   * na ficha de outro personagem ele MUDA de mão. Sem ele o item veio de onde
   * não é de ninguém — a janela de Itens, um ponto, o handout — e largado num
   * personagem é DADO, e continua onde estava. Item é item: dar não tira do
   * catálogo.
   *
   * Carrega a URL já resolvida, e não um `assetId`, porque a imagem do item
   * pode ser a foto do jogador, que não tem id de acervo. Ela só vira asset
   * quando o item é solto no mapa — ver `promoverImagemDoItem`, que é ida ao
   * disco e não cabe num `pointerdown`, que é síncrono. Sem URL o item não vai
   * ao mapa, que é onde só a imagem diz alguma coisa; vai a todo o resto.
   */
  | { tipo: "item"; itemId: string; personagemId?: string; url?: string }
  // Uma nota `.md` da árvore de Arquivos, que vira cartão no quadro.
  | { tipo: "nota"; notaId: string; arquivo: string; titulo: string }
  // Um mapa ou fundo da lista de Cenas. Vira menção `>mapa` numa nota, e entra
  // numa pasta da MESMA aba -- `lista` diz de qual ela saiu.
  | { tipo: "cena"; sceneId: string; nome: string; lista?: "mapas" | "fundos" };

/**
 * Onde o ponteiro está AGORA, entre os lugares que aceitam o que está na mão.
 *
 * `null` é "em cima de nada que receba" — a folga em volta do mapa, uma janela
 * da bancada sobre o palco, uma pasta que recusa item de inventário. Ali a
 * sombra some e soltar não faz nada, que é o que a sombra prometeu ao sumir.
 */
export type DestinoDoArrasto =
  | { tipo: "palco" }
  /** A grade de inventário de outro personagem. */
  | { tipo: "inventario"; personagemId: string }
  /**
   * A linha de um personagem na lista de Personagens: o item largado nela vai
   * para o inventário dele, com a ficha aberta ou não.
   */
  | { tipo: "personagem"; personagemId: string }
  // Uma pasta da janela de Itens. `undefined` é a raiz.
  | { tipo: "pasta-itens"; pastaId: string | undefined }
  /** A bolinha do handout da cena em edição. */
  | { tipo: "handout" }
  /**
   * O cartão aberto de um ponto de anotação. Um por ponto, como o inventário
   * é um por ficha: há mais de uma nota aberta ao mesmo tempo.
   */
  | { tipo: "ponto"; pinId: string }
  // Uma pasta da árvore de Arquivos. `undefined` é a raiz.
  | { tipo: "pasta-arquivos"; pastaId: string | undefined }
  // Uma pasta de Mapas ou de Fundos. `undefined` é a raiz da aba.
  | {
      tipo: "pasta-cenas";
      lista: "mapas" | "fundos";
      pastaId: string | undefined;
    }
  // Uma pasta de uma seção da lista de personagens. `undefined` é a raiz dela.
  | {
      tipo: "pasta-personagens";
      lista: "players" | "npcs";
      pastaId: string | undefined;
    }
  // O editor de uma nota: o que cai vira menção no texto.
  | { tipo: "nota" }
  // A área de split: abre a nota ao lado do mapa, ou como aba de um painel.
  // Ver `FileiraDePaineis`.
  | { tipo: "split"; painel: string; zona: "esquerda" | "direita" | "centro" };

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
  return fonte.tipo === "item" || fonte.tipo === "nota" || fonte.tipo === "cena"
    ? undefined
    : fonte.assetId || undefined;
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
    case "inventario":
      return `inventario:${destino.personagemId}`;
    // Uma chave só para todas as linhas: quem recebe é a lista, que sabe dar o
    // item a qualquer personagem -- ao contrário do inventário, que existe uma
    // vez por ficha aberta.
    case "personagem":
      return "linha-personagem";
    case "pasta-itens":
      return "itens";
    case "handout":
      return "handout";
    case "ponto":
      return `ponto:${destino.pinId}`;
    case "pasta-arquivos":
      return "arquivos";
    case "pasta-personagens":
      return "personagens";
    case "pasta-cenas":
      // Uma por aba: Mapas e Fundos registram cada uma o seu alvo, e uma chave
      // só faria a aba que desmonta apagar o alvo da outra.
      return `cenas:${destino.lista}`;
    case "nota":
      return "nota";
    case "split":
      return "split";
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
 * - pasta de Arquivos só recebe nota e arquivo do acervo: ali o gesto é
 *   "guarde isto aqui", e item de inventário e miniatura de personagem não são
 *   arquivos que se guardem — a casa deles é a ficha;
 * - inventário só recebe item, e nunca o do próprio dono: mover um item para
 *   onde ele já está é um gesto sem efeito, e o Rust o recusa;
 * - o mapa só recebe item com imagem: a peça É a imagem, e um item sem ela
 *   não teria o que desenhar lá.
 */
export function aceita(
  fonte: FonteDoArrasto,
  destino: DestinoDoArrasto,
): boolean {
  switch (destino.tipo) {
    case "palco":
      // Mapa não cai no palco: ele É um palco. Só vira menção. E personagem sem
      // miniatura não tem peça para pôr ali.
      return (
        fonte.tipo !== "cena" &&
        !(fonte.tipo === "personagem" && !fonte.assetId) &&
        !(fonte.tipo === "item" && !fonte.url)
      );
    case "nota":
      // O que tem nome para ser mencionado: `/arquivo`, `@personagem`, `>mapa`.
      return (
        fonte.tipo === "acervo" ||
        fonte.tipo === "handout" ||
        fonte.tipo === "ponto" ||
        fonte.tipo === "personagem" ||
        fonte.tipo === "cena"
      );
    case "split":
      // A nota é o que se divide ao lado do mapa. O quadro também, mas ele
      // chega pelo gesto de reordenar a lista -- ver `naMao` em
      // `usePaineisStore`.
      return fonte.tipo === "nota";
    case "pasta-arquivos":
      // A árvore é uma só: a nota e o arquivo do acervo mudam de pasta pelo
      // mesmo gesto. O quadro muda pelo reordenar da lista.
      return fonte.tipo === "nota" || fonte.tipo === "acervo";
    case "pasta-cenas":
      return fonte.tipo === "cena" && fonte.lista === destino.lista;
    case "pasta-personagens":
      // Da mesma seção: a seção é DERIVADA do vínculo com um jogador, e um
      // Player largado numa pasta de NPCs continuaria aparecendo em Players.
      return fonte.tipo === "personagem" && fonte.secao === destino.lista;
    case "inventario":
    case "personagem":
      return (
        fonte.tipo === "item" && fonte.personagemId !== destino.personagemId
      );
    case "pasta-itens":
      // Só o item que veio do catálogo: o de uma ficha largado numa pasta
      // pareceria sair da mochila e não sairia.
      return fonte.tipo === "item" && fonte.personagemId === undefined;
    case "handout":
      // Do acervo, e o item da campanha. Retrato de personagem já tem dono, e
      // a imagem que o handout guarda é id de acervo. Ver `Scene.handout` e
      // `Scene.handoutItens`.
      return fonte.tipo === "acervo" || fonte.tipo === "item";
    case "ponto":
      // Pela mesma razão do handout. Ver `MapPin.attachments` e `MapPin.itens`.
      return fonte.tipo === "acervo" || fonte.tipo === "item";
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
   * `InventarioPersonagem` a própria grade, `PinNote` o cartão do ponto.
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
  return MIN_SCENE_ITEM_SIZE / Math.min(arrasto.largura, arrasto.altura);
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
