"use client";

import { create } from "zustand";

import {
  semIdDaArea,
  semIdDaForma,
  semIdDaLuz,
  semIdDaParede,
  semIdDoPostit,
  semIdDoTexto,
} from "@/types/scene";
import type {
  CanvasItem,
  FogRegion,
  Forma,
  ItemDraft,
  Luz,
  NewFogRegion,
  NewForma,
  NewLuz,
  NewParede,
  NewTexto,
  NewTraco,
  Parede,
  Postit,
  Texto,
  Traco,
} from "@/types/scene";

/** O que um Ctrl+C leva. Cada lista é opcional: a seleção mistura tudo. */
type Copia = {
  itens?: CanvasItem[];
  textos?: Texto[];
  formas?: Forma[];
  postits?: Postit[];
  tracos?: Traco[];
  paredes?: Parede[];
  areas?: FogRegion[];
  luzes?: Luz[];
};

type ClipboardStore = {
  /** Rascunhos sem `id`/`z`: colar sempre cria itens novos, nunca ressuscita. */
  drafts: ItemDraft[];
  /**
   * Os textos soltos copiados, sem id. AO LADO dos itens e não no lugar deles:
   * a área do quadro marca frase e imagem no mesmo laço, e um Ctrl+C que
   * escolhesse um dos dois perderia metade do que estava na mão.
   *
   * Cada Ctrl+C substitui TODAS as listas, como uma área de transferência de
   * verdade -- o último é o que vale.
   */
  textos: NewTexto[];
  /** E as formas do quadro, pela mesma razão: a seleção mistura tudo. */
  formas: NewForma[];
  /** Os papéis, com a cor e a letra de cada um. */
  postits: Omit<Postit, "id">[];
  /** Os riscos do lápis, com os pontos onde estavam. */
  tracos: NewTraco[];
  /**
   * O que é do CHÃO do mapa: parede, área escondida e luz cravada.
   *
   * Cada uma se seleciona sozinha no palco, então um Ctrl+C traz uma lista com
   * um só -- e as outras vazias. Listas mesmo assim, pela forma do resto: o
   * colar não precisa saber quantas são.
   */
  paredes: NewParede[];
  /**
   * Sem o `revealed`: a cópia nasce ESCONDENDO, como toda área nova. Copiar a
   * área de uma sala já aberta é pegar o formato para a próxima que a mesa
   * ainda não viu, e uma cópia já revelada não esconderia nada.
   */
  areas: NewFogRegion[];
  luzes: NewLuz[];
  copy: (copia: Copia) => void;
};

/**
 * Há o que colar?
 *
 * Uma pergunta só para os três que a fazem -- o Ctrl+V, o menu do palco e o
 * próprio colar. Cada um escrevia a sua, e a do atalho esqueceu as formas: um
 * Ctrl+C só de formas deixava o Ctrl+V passar para o browser, que colava o
 * texto do SISTEMA no quadro no lugar delas.
 */
export function temAlgoParaColar(
  guardado: Pick<
    ClipboardStore,
    | "drafts"
    | "textos"
    | "formas"
    | "postits"
    | "tracos"
    | "paredes"
    | "areas"
    | "luzes"
  >,
): boolean {
  return (
    guardado.drafts.length > 0 ||
    guardado.textos.length > 0 ||
    guardado.formas.length > 0 ||
    guardado.postits.length > 0 ||
    guardado.tracos.length > 0 ||
    guardado.paredes.length > 0 ||
    guardado.areas.length > 0 ||
    guardado.luzes.length > 0
  );
}

/**
 * Área de transferência interna. Não usa a do sistema de propósito: ler o
 * clipboard do browser exige permissão e handshake assíncrono, e o que
 * copiamos aqui (posição, rotação, referência a asset) não faz sentido fora
 * do app.
 */
export const useClipboardStore = create<ClipboardStore>((set) => ({
  drafts: [],
  textos: [],
  formas: [],
  postits: [],
  tracos: [],
  paredes: [],
  areas: [],
  luzes: [],

  copy({
    itens = [],
    textos = [],
    formas = [],
    postits = [],
    tracos = [],
    paredes = [],
    areas = [],
    luzes = [],
  }) {
    set({
      paredes: paredes.map(semIdDaParede),
      areas: areas.map(semIdDaArea),
      luzes: luzes.map(semIdDaLuz),
      formas: formas.map(semIdDaForma),
      // Com a cor, o fundo e a ênfase: ver `semIdDoTexto`.
      textos: textos.map(semIdDoTexto),
      postits: postits.map(semIdDoPostit),
      tracos: tracos.map(({ pontos, cor, espessura }) => ({
        pontos,
        cor,
        espessura,
      })),
      drafts: itens.map(
        ({ assetId, x, y, width, height, rotation, locked, flipX, flipY, opacity }) => ({
          assetId,
          x,
          y,
          width,
          height,
          rotation,
          locked,
          flipX,
          flipY,
          opacity,
        }),
      ),
    });
  },
}));
