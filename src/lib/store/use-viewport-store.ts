"use client";

import { create } from "zustand";

import type { Bounds } from "@/lib/geometry/bounds";
import { mesmosLimites } from "@/lib/geometry/limites";
import {
  centerViewportOn,
  FULL_VIEWPORT,
  PLANO,
  viewportQueCabe,
  zoomViewportCentered,
} from "@/lib/geometry/viewport";
import type { Vec } from "@/lib/geometry/transform";
import type { Viewport } from "@/types/scene";

/** Passo dos botões e atalhos de zoom. */
const STEP = 1.4;

type ViewportStore = {
  viewport: Viewport;
  /**
   * A área que a cena ocupa — o plano mais o que foi colocado fora dele.
   *
   * Mora aqui, e não é lida da cena onde cada um precisa, porque é o zoom que
   * a consome: afastar, encaixar e centralizar precisam saber até onde existe
   * coisa, e os botões que disparam essas ações não têm a cena em mãos. Quem
   * abastece é o `StageBoundary`, que tem.
   */
  conteudo: Bounds;
  /**
   * Espaço pressionado: o arrasto passa a deslocar a cena em vez de mexer nos
   * itens. Mora aqui porque o palco e a camada interativa precisam concordar
   * sobre quem trata o gesto.
   */
  panMode: boolean;
  /**
   * Quantos arrastos estão em curso no palco -- item, alça, postit, moldura.
   *
   * Existe para o `SceneStage` saber que há GESTO mesmo com a câmera parada.
   * O plano de conteúdo assenta em `zoom` (layout, nítido) quando a câmera
   * para; mover um item dentro de um plano em `zoom` paga layout e re-raster
   * do plano inteiro a cada quadro, e era isso que fazia um token já no mapa
   * pesar na mão enquanto o fantasma da aba -- fora do plano -- corria leve.
   * Com um gesto em curso o plano volta ao `transform`, e o compositor cuida.
   *
   * Contador e não booleano: dois ponteiros (toque) podem se sobrepor, e o
   * segundo a soltar é quem encerra.
   */
  gestos: number;

  setViewport: (viewport: Viewport) => void;
  comecarGesto: () => void;
  terminarGesto: () => void;
  setConteudo: (conteudo: Bounds) => void;
  setPanMode: (panMode: boolean) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  /**
   * Leva a vista até um ponto do plano, mantendo a ampliação.
   *
   * Usado pela busca de pontos de anotação: escolher um da lista sem mover a
   * vista não responderia nada, porque o alfinete pode estar fora do recorte
   * atual.
   */
  centerOn: (point: Vec) => void;
};

/**
 * Zoom e deslocamento do palco do Mestre.
 *
 * Estado de UI da máquina do mestre: não entra no board, não é persistido e
 * não viaja no canal. O que a mesa vê é `Scene.camera`, e só chega lá quando o
 * mestre manda pelo botão de enquadrar.
 */
export const useViewportStore = create<ViewportStore>((set, get) => ({
  viewport: FULL_VIEWPORT,
  conteudo: PLANO,
  panMode: false,
  gestos: 0,

  setViewport: (viewport) => set({ viewport }),
  comecarGesto: () => set((state) => ({ gestos: state.gestos + 1 })),
  terminarGesto: () => set((state) => ({ gestos: Math.max(0, state.gestos - 1) })),

  // Devolver o estado intocado quando a caixa não mudou é o que deixa o palco
  // chamar isto a cada quadro de arrasto de graça: o zustand não avisa ninguém
  // quando o objeto volta idêntico. Ver `mesmosLimites`.
  setConteudo: (conteudo) =>
    set((state) =>
      mesmosLimites(state.conteudo, conteudo) ? state : { conteudo },
    ),

  setPanMode: (panMode) => set({ panMode }),
  zoomIn: () =>
    set({ viewport: zoomViewportCentered(get().viewport, STEP, get().conteudo) }),
  zoomOut: () =>
    set({
      viewport: zoomViewportCentered(get().viewport, 1 / STEP, get().conteudo),
    }),

  // O que CABE, e não o plano: com tudo dentro do plano os dois são o mesmo
  // recorte, e fora dele é este botão que devolve a vista ao que existe.
  fit: () => set({ viewport: viewportQueCabe(get().conteudo) }),

  centerOn: (point) =>
    set({ viewport: centerViewportOn(get().viewport, point, get().conteudo) }),
}));
