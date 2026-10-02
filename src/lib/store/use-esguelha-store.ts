import { create } from "zustand";

import { OLHAR_PADRAO } from "@/lib/geometry/camera-orbital";
import type { Tripe } from "@/types/scene";

/** De onde o mestre olha a mesa no 2.5D, em graus. */
export type Olhar = { giro: number; inclinacao: number };

type EsguelhaStore = {
  /** O palco do mestre está no 2.5D. */
  ligada: boolean;
  /** O último olhar do mestre no 2.5D, para voltar a ele. */
  olhar: Olhar;
  alternar: () => void;
  guardarOlhar: (olhar: Olhar) => void;
  /**
   * O tripé que veria o que o mestre vê agora, ou `null` fora do 2.5D.
   *
   * Uma função registrada pela mesa de esguelha enquanto ela está montada, e
   * não um valor: o olhar anda a cada quadro sem passar pelo React, e só quem
   * pergunta -- o "nova câmera daqui" -- precisa dele, e só no instante em
   * que pergunta. Ver `MestreDeEsguelha`.
   */
  olhoAgora: (() => Tripe | null) | null;
  registrarOlho: (olho: (() => Tripe | null) | null) => void;
  /**
   * O tripé por cujo olho o mestre está olhando agora, ou `null`.
   *
   * É o "olhar pela câmera": o 2.5D do mestre mostra exatamente o que a mesa
   * veria por aquele tripé. Só prévia -- a navegação fica parada, e o ajuste
   * continua sendo pelo gizmo e pelo painel.
   */
  olhandoPor: string | null;
  olharPor: (tripeId: string | null) => void;
  /**
   * A janela do minimapa: onde ela está, em pixels a partir do canto do palco,
   * e se está aberta. Da sessão, como o olhar: quem a arrastou para um canto
   * a reencontra lá ao voltar ao 2.5D.
   */
  miniMapa: { x: number; y: number; aberto: boolean };
  moverMiniMapa: (posicao: { x: number; y: number }) => void;
  alternarMiniMapa: () => void;
};

/**
 * O 2D e o 2.5D do MESTRE: modo de trabalho, e não dado da cena.
 *
 * Antes era `Scene.vista`, e ligar o 2.5D no Mestre ligava a mesa junto. Agora
 * quem decide o que a mesa vê é a câmera no ar -- um tripé põe a janela do
 * espectador de esguelha, uma câmera 2D a põe de prumo --, e o mestre pode
 * editar o mapa no 2D enquanto a mesa olha pelo tripé. Ver `Scene.tripes`.
 *
 * Estado da máquina do mestre, como o `useCameraLockStore`: não vai ao disco
 * nem ao canal. O olhar fica guardado pela sessão, para quem sai e volta ao
 * 2.5D reencontrar a mesa do lado em que a deixou.
 */
export const useEsguelhaStore = create<EsguelhaStore>((set) => ({
  ligada: false,
  olhar: { ...OLHAR_PADRAO },
  alternar: () => set((atual) => ({ ligada: !atual.ligada })),
  guardarOlhar: (olhar) => set({ olhar }),
  olhoAgora: null,
  registrarOlho: (olhoAgora) => set({ olhoAgora }),
  olhandoPor: null,
  olharPor: (olhandoPor) => set({ olhandoPor }),
  miniMapa: { x: 12, y: 52, aberto: true },
  moverMiniMapa: ({ x, y }) =>
    set((atual) => ({ miniMapa: { ...atual.miniMapa, x, y } })),
  alternarMiniMapa: () =>
    set((atual) => ({
      miniMapa: { ...atual.miniMapa, aberto: !atual.miniMapa.aberto },
    })),
}));
