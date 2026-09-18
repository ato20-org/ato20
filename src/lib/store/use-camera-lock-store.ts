"use client";

import { create } from "zustand";

import { boundsOfItems, type Bounds } from "@/lib/geometry/bounds";
import { clampViewport, viewportQueCabe } from "@/lib/geometry/viewport";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { CameraSalva, Scene } from "@/types/scene";

/**
 * Folga em volta do alvo ao prender pela primeira vez, como fração do maior
 * lado. Depois disso o zoom é do mestre: só o centro segue.
 */
const MARGEM_ALVO = 0.35;

type CameraLockStore = {
  /**
   * A câmera que o mestre está EDITANDO: alça, slider, setas, travas e
   * cinegrafista agem sobre ela. Não é a que está no ar -- essa mora na cena,
   * em `cameraNoArId`. Separar as duas é o que permite preparar o beco
   * enquanto a TV ainda mostra a taverna.
   *
   * `null` só até a primeira cena abrir; ver `garantirCameraInicial`.
   */
  selecionadaId: string | null;
  /**
   * Espelho: cada mudança do palco do mestre vira o recorte da selecionada.
   * O que ele vê, a câmera vê -- e a mesa, se ela estiver no ar.
   */
  espelhoMestre: boolean;
  /**
   * Desenhar as outras câmeras apagadas no palco do mestre. Mora aqui e não na
   * cena porque é preferência de bancada, não dado: a mesa nunca as vê.
   */
  fantasmasVisiveis: boolean;

  selecionar: (cameraId: string) => void;
  /**
   * Garante que a selecionada exista na cena, e migra a cena antiga que tinha
   * recorte sem câmeras. Chamado pelo palco do Mestre a cada cena aberta.
   * Cena nova fica SEM câmera: a mesa vê o mapa inteiro até o mestre criar
   * uma, e criar já transmite.
   */
  garantirCameraInicial: (scene: Scene) => void;
  /** Prende a selecionada no que está selecionado agora. Sem seleção, nada. */
  prenderNaSelecao: () => void;
  /**
   * Prende a selecionada nestes itens, com a ampliação de `base` se vier.
   * Sem `base`, enquadra com folga. Itens que já não existem são ignorados;
   * sem nenhum, não prende.
   */
  prenderEm: (
    itemIds: string[],
    base?: { width: number; height: number },
  ) => void;
  alternarEspelho: () => void;
  alternarFantasmas: () => void;
  /** Solta a selecionada do alvo e desliga o espelho. */
  soltar: () => void;
};

function cenaEmEdicao(): Scene | null {
  return selectEditingScene(useSceneStore.getState());
}

function selecionadaDe(scene: Scene | null, id: string | null) {
  return scene?.cameras?.find((camera) => camera.id === id);
}

/**
 * Câmeras da bancada do Mestre.
 *
 * Estado de UI da máquina do mestre, como o `useViewportStore`: qual câmera
 * ele está editando, se o espelho está ligado, se as outras aparecem no
 * mapa. Nada disto entra no board nem viaja no canal. O que É dado -- as
 * câmeras, quem cada uma segue, qual está no ar -- mora na cena.
 *
 * Os seguidores no fim do arquivo são o que faz "seguir" e "espelhar"
 * acontecerem: assinam os stores e regravam recortes. Quem grava é sempre
 * `atualizarCamera`, que leva o recorte à mesa se a câmera estiver no ar.
 */
export const useCameraLockStore = create<CameraLockStore>((set, get) => ({
  selecionadaId: null,
  espelhoMestre: false,
  fantasmasVisiveis: true,

  selecionar: (cameraId) =>
    // Trocar de câmera desliga o espelho: ele é da câmera em que foi ligado,
    // e passar a espelhar outra sem aviso mudaria o que a TV mostra.
    set({ selecionadaId: cameraId, espelhoMestre: false }),

  garantirCameraInicial: (scene) => {
    const store = useSceneStore.getState();
    // Do store, e não da prop: o efeito que chama isto pode rodar duas vezes
    // com a mesma cena em mãos, e a segunda chamada via a lista vazia de antes
    // da primeira ter gravado -- e a cena nascia com duas câmeras iguais.
    const atual =
      store.board?.scenes.find((cena) => cena.id === scene.id) ?? scene;
    let cameras = atual.cameras ?? [];

    if (cameras.length === 0 && atual.camera) {
      // Cena antiga com recorte e sem câmeras: o recorte vira a Câmera 1 e
      // continua no ar, para a TV não pular ao abrir o app novo.
      const id = store.salvarCamera(scene.id, {
        nome: "Câmera 1",
        viewport: atual.camera,
      });
      store.transmitirCamera(scene.id, id);

      cameras = selectEditingScene(useSceneStore.getState())?.cameras ?? [];
    }

    if (!cameras.some((camera) => camera.id === get().selecionadaId)) {
      // A que está no ar, se houver: é a que o mestre mais provavelmente quer
      // ajustar ao abrir. Senão a primeira.
      const inicial =
        cameras.find((camera) => camera.id === scene.cameraNoArId) ??
        cameras[0];
      if (inicial) set({ selecionadaId: inicial.id, espelhoMestre: false });
    }
  },

  prenderNaSelecao: () => {
    get().prenderEm(useSelectionStore.getState().selectedIds);
  },

  prenderEm: (itemIds, base) => {
    const scene = cenaEmEdicao();
    const selecionada = selecionadaDe(scene, get().selecionadaId);
    if (!scene || !selecionada || itemIds.length === 0) return;

    const alvo = scene.items.filter((item) => itemIds.includes(item.id));
    const caixa = boundsOfItems(alvo);
    if (!caixa) return;

    const conteudo = useViewportStore.getState().conteudo;
    const cx = (caixa.minX + caixa.maxX) / 2;
    const cy = (caixa.minY + caixa.maxY) / 2;

    // Com base, a ampliação é a dada e só o centro vai para o alvo. Sem base,
    // enquadra o alvo com folga uma vez; daí em diante só o centro segue.
    const folga =
      Math.max(caixa.maxX - caixa.minX, caixa.maxY - caixa.minY) * MARGEM_ALVO;
    const viewport = base
      ? clampViewport(
          { ...base, x: cx - base.width / 2, y: cy - base.height / 2 },
          conteudo,
        )
      : clampViewport(
          viewportQueCabe({
            minX: caixa.minX - folga,
            minY: caixa.minY - folga,
            maxX: caixa.maxX + folga,
            maxY: caixa.maxY + folga,
          }),
          conteudo,
        );

    ultimaCaixa.set(selecionada.id, caixa);
    useSceneStore.getState().atualizarCamera(scene.id, selecionada.id, {
      viewport,
      alvoIds: alvo.map((item) => item.id),
    });
    set({ espelhoMestre: false });
  },

  alternarEspelho: () => {
    const scene = cenaEmEdicao();
    const selecionada = selecionadaDe(scene, get().selecionadaId);
    if (!scene || !selecionada) return;

    if (get().espelhoMestre) {
      set({ espelhoMestre: false });
      return;
    }

    // Liga já espelhando: o mestre apertou e quer ver a câmera vir para onde
    // ele está, não esperar o próximo arrasto.
    const { viewport, conteudo } = useViewportStore.getState();
    useSceneStore.getState().atualizarCamera(scene.id, selecionada.id, {
      viewport: clampViewport(viewport, conteudo),
      alvoIds: undefined,
    });
    set({ espelhoMestre: true });
  },

  alternarFantasmas: () =>
    set((state) => ({ fantasmasVisiveis: !state.fantasmasVisiveis })),

  soltar: () => {
    const scene = cenaEmEdicao();
    const selecionada = selecionadaDe(scene, get().selecionadaId);

    if (scene && selecionada?.alvoIds)
      useSceneStore
        .getState()
        .atualizarCamera(scene.id, selecionada.id, { alvoIds: undefined });

    // Só escreve se há o que soltar: `gravarCameraManual` chama isto a cada
    // quadro de arrasto da moldura, e um `set` com o mesmo valor ainda acorda
    // todo assinante do store.
    if (get().espelhoMestre) set({ espelhoMestre: false });
  },
}));

/**
 * A caixa do alvo de cada câmera no último quadro seguido, por id.
 *
 * Fora do store porque é memória de trabalho do seguidor, não estado que a
 * interface lê. Comparar com ela é o que impede o laço: o recorte que o
 * seguidor grava também passa pelo `subscribe` abaixo, e sem a comparação ele
 * gravaria de novo, e de novo.
 */
const ultimaCaixa = new Map<string, Bounds>();

function mesmaCaixa(a: Bounds | undefined, b: Bounds): boolean {
  return (
    !!a &&
    a.minX === b.minX &&
    a.minY === b.minY &&
    a.maxX === b.maxX &&
    a.maxY === b.maxY
  );
}

/** Onde a câmera com alvo deve estar: centrada nos itens, ampliação dela. */
export function recorteSeguindo(
  camera: CameraSalva,
  caixa: Bounds,
  conteudo: Bounds,
) {
  const { width, height } = camera.viewport;

  return clampViewport(
    {
      x: (caixa.minX + caixa.maxX) / 2 - width / 2,
      y: (caixa.minY + caixa.maxY) / 2 - height / 2,
      width,
      height,
    },
    conteudo,
  );
}

/**
 * O seguidor de alvo: a cada mudança da cena, toda câmera com alvo cujos
 * itens se moveram vai atrás deles.
 *
 * TODAS, e não só a selecionada ou a que está no ar: a câmera do grupo B tem
 * de estar onde o grupo B está quando o mestre a puser no ar, sem um pulo.
 *
 * Um commit por câmera que precisou andar, e nenhum quando o que mudou foi
 * outra coisa -- a comparação de caixa é o filtro. Não roda por quadro.
 */
useSceneStore.subscribe((state) => {
  const scene = selectEditingScene(state);
  if (!scene?.cameras) return;

  const conteudo = useViewportStore.getState().conteudo;

  for (const camera of scene.cameras) {
    if (!camera.alvoIds) continue;

    const alvo = scene.items.filter((item) =>
      camera.alvoIds?.includes(item.id),
    );

    // Alvo apagado: a câmera solta e fica onde estava. Seguir o vazio seria
    // deixar a mira acesa sem ninguém do outro lado.
    if (alvo.length === 0) {
      ultimaCaixa.delete(camera.id);
      state.atualizarCamera(scene.id, camera.id, { alvoIds: undefined });
      continue;
    }

    const caixa = boundsOfItems(alvo);
    if (!caixa || mesmaCaixa(ultimaCaixa.get(camera.id), caixa)) continue;

    ultimaCaixa.set(camera.id, caixa);
    state.atualizarCamera(scene.id, camera.id, {
      viewport: recorteSeguindo(camera, caixa, conteudo),
    });
  }
});

/**
 * O espelho do mestre: cada mudança do palco dele vira o recorte da câmera
 * selecionada -- e da mesa, se ela estiver no ar.
 *
 * Um update do board por quadro de arrasto do palco, e é o custo assumido do
 * modo: o board já grava fora do store com folga (ver o `persist` do
 * `useSceneStore`), e o canal manda quatro números. Se pesar com a TV ligada,
 * o lugar de um debounce de um quadro é aqui.
 */
useViewportStore.subscribe((state, anterior) => {
  if (state.viewport === anterior.viewport) return;

  const { espelhoMestre, selecionadaId } = useCameraLockStore.getState();
  if (!espelhoMestre || !selecionadaId) return;

  const scene = cenaEmEdicao();
  if (!scene) return;

  useSceneStore.getState().atualizarCamera(scene.id, selecionadaId, {
    viewport: clampViewport(state.viewport, state.conteudo),
  });
});
