"use client";

import { create } from "zustand";

import {
  FULL_VIEWPORT,
  zoomViewportCentered,
} from "@/lib/geometry/viewport";
import type { Viewport } from "@/types/scene";

/** Passo dos botões e atalhos de zoom. */
const STEP = 1.4;

type ViewportStore = {
  viewport: Viewport;
  /**
   * Espaço pressionado: o arrasto passa a deslocar a cena em vez de mexer nos
   * itens. Mora aqui porque o palco e a camada interativa precisam concordar
   * sobre quem trata o gesto.
   */
  panMode: boolean;

  setViewport: (viewport: Viewport) => void;
  setPanMode: (panMode: boolean) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
};

/**
 * Zoom e deslocamento do palco do Operador.
 *
 * Estado de UI da máquina do mestre: não entra no board, não é persistido e
 * não viaja no canal. O que a mesa vê é `Scene.camera`, e só chega lá quando o
 * mestre manda pelo botão de enquadrar.
 */
export const useViewportStore = create<ViewportStore>((set, get) => ({
  viewport: FULL_VIEWPORT,
  panMode: false,

  setViewport: (viewport) => set({ viewport }),
  setPanMode: (panMode) => set({ panMode }),
  zoomIn: () => set({ viewport: zoomViewportCentered(get().viewport, STEP) }),
  zoomOut: () => set({ viewport: zoomViewportCentered(get().viewport, 1 / STEP) }),
  fit: () => set({ viewport: FULL_VIEWPORT }),
}));
