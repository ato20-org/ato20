"use client";

import { useMemo, useState } from "react";

import { CenaDeEsguelha } from "@/components/playground/cena-de-esguelha";
import { PalcoSoTela } from "@/components/playground/scene-stage";
import { useCameraOrbital } from "@/hooks/use-camera-orbital";
import {
  cameraDoRecorte,
  LENTE_DA_MESA,
  type CameraAssinavel,
} from "@/lib/geometry/camera-orbital";
import { clampViewport, PLANO } from "@/lib/geometry/viewport";
import { useEsguelhaStore, type Olhar } from "@/lib/store/use-esguelha-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { sceneForTable } from "@/lib/sync/for-table";
import type { Scene } from "@/types/scene";

/**
 * O palco do Mestre no 2.5D: a mesa vista de esguelha, e só ela.
 *
 * ## Por que só olhar
 *
 * No 2.5D não há ferramenta: mapa, luz, parede e o resto se editam no 2D. É
 * decisão do usuário, e pelo custo -- cada ferramenta do Mestre mede o ponteiro
 * pela conta chapada (`toScene`), e ensinar todas a desfazer uma câmera em
 * perspectiva é reescrever a interação inteira. Aqui se confere a mesa.
 *
 * E é a mesa MESMO: `sceneForTable`, o que a janela do espectador recebe, sem
 * o que está escondido. Conferir com o que só o mestre vê seria conferir outra
 * cena.
 *
 * ## A câmera
 *
 * A orbital, com os gestos da bancada: arrastar anda, a roda aproxima no
 * cursor, o botão direito gira e deita. Abre olhando o pedaço que o 2D estava
 * olhando, e devolve o lugar ao 2D quando sai -- trocar de modo não perde a
 * mesa.
 *
 * O olhar é do MESTRE, e fica nele: andar, aproximar, girar e deitar não chegam
 * à mesa. Quem a mesa olha é a câmera no ar -- um tripé, para vê-la assim. O
 * giro e a inclinação ficam guardados pela sessão (`useEsguelhaStore`) quando o
 * gesto assenta, uma vez e não por quadro.
 *
 * ## O palco
 *
 * `PalcoSoTela` e não um `SceneStage`: o palco recorta e amplia um plano de
 * 1920x1080, e aqui quem enquadra é o olho. As camadas da cena leem o
 * contexto do palco (escala, camada da tela), e ele vem neutro -- a área do
 * palco é a janela, e a cena se desenha nela.
 */
export function MestreDeEsguelha({ scene }: { scene: Scene }) {
  const guardarOlhar = useEsguelhaStore((state) => state.guardarOlhar);

  /**
   * De onde o Mestre olha AGORA: começa no último olhar da sessão, muda a
   * cada quadro do giro, e vai ao store quando o gesto assenta.
   */
  const [olhar, setOlhar] = useState<Olhar>(
    () => useEsguelhaStore.getState().olhar,
  );

  const { mesa, focal, tamanho, corrente, assinar } = useCameraOrbital({
    lente: LENTE_DA_MESA,
    giro: olhar.giro,
    inclinacao: olhar.inclinacao,
    onGirar: setOlhar,
    arrastar: false,
    // Sem ferramenta na mão: o botão esquerdo é sempre da câmera.
    podeAgarrar: () => true,
    inicial: (tela) =>
      cameraDoRecorte(
        useViewportStore.getState().viewport,
        tela,
        olhar.giro,
        olhar.inclinacao,
      ),
    mapa: PLANO,
    onAssentar: (camera) =>
      guardarOlhar({ giro: camera.giro, inclinacao: camera.inclinacao }),
    // O 2D volta olhando o pedaço em que o 2.5D estava.
    onSair: (camera, tela) =>
      useViewportStore.getState().setViewport(
        clampViewport(
          {
            x: camera.alvo.x - tela.largura / camera.zoom / 2,
            y: camera.alvo.y - tela.altura / camera.zoom / 2,
            width: tela.largura / camera.zoom,
            height: tela.altura / camera.zoom,
          },
          PLANO,
        ),
      ),
  });

  const daMesa = useMemo(() => sceneForTable(scene), [scene]);

  /**
   * O olhar de AGORA, com a câmera que o escreve no DOM.
   *
   * O giro do gesto entra aqui a cada quadro: a ordem do pintor e as peças em
   * pé dependem dele, e sem isto a câmera giraria com as peças olhando para o
   * lado antigo até o soltar.
   */
  const comCamera = useMemo(
    () => ({
      camera: { corrente, assinar, perspectiva: focal } as CameraAssinavel,
      giro: olhar.giro,
      inclinacao: olhar.inclinacao,
    }),
    [assinar, corrente, focal, olhar],
  );

  return (
    <div
      ref={mesa}
      className="relative min-h-0 flex-1 cursor-grab overflow-hidden rounded-md bg-black active:cursor-grabbing"
    >
      {daMesa && tamanho && focal > 0 ? (
        <PalcoSoTela largura={tamanho.largura} altura={tamanho.altura}>
          <CenaDeEsguelha scene={daMesa} olhar={comCamera} />
        </PalcoSoTela>
      ) : null}
    </div>
  );
}

