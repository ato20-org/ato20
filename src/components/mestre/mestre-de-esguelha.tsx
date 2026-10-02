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
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { sceneForTable } from "@/lib/sync/for-table";
import { VISTA_PADRAO, type Scene, type Vista } from "@/types/scene";

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
 * Andar e aproximar ficam AQUI, no Mestre. Girar e deitar vão para a cena
 * (`Scene.vista`) quando o gesto assenta, e a mesa passa a olhar do mesmo
 * lado. Uma vez, no soltar, e não por quadro: gravar a cada quadro seria um
 * desfazer e um envio ao disco por quadro.
 *
 * ## O palco
 *
 * `PalcoSoTela` e não um `SceneStage`: o palco recorta e amplia um plano de
 * 1920x1080, e aqui quem enquadra é o olho. As camadas da cena leem o
 * contexto do palco (escala, camada da tela), e ele vem neutro -- a área do
 * palco é a janela, e a cena se desenha nela.
 */
export function MestreDeEsguelha({ scene }: { scene: Scene }) {
  const setVista = useSceneStore((state) => state.setVista);
  const vista = scene.vista;

  /**
   * De onde o Mestre olha AGORA.
   *
   * Local durante o gesto, e alcança a cena no soltar. Quando a vista da cena
   * muda por outro caminho -- o botão do modo, o desfazer --, este estado
   * alcança ela: estado derivado ajustado no render, o caminho que o React
   * documenta, e sem o quadro intermediário que um efeito deixaria passar.
   */
  const [olhar, setOlhar] = useState(() => paraOlhar(vista));
  const [vistaVista, setVistaVista] = useState(vista);
  if (vista !== vistaVista) {
    setVistaVista(vista);
    setOlhar(paraOlhar(vista));
  }

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
    onAssentar: (camera) => {
      const atual = useSceneStore
        .getState()
        .board?.scenes.find((cena) => cena.id === scene.id)?.vista;
      if (!atual) return;
      if (
        Math.round(atual.giro) === Math.round(camera.giro) &&
        Math.round(atual.inclinacao) === Math.round(camera.inclinacao)
      ) {
        return;
      }
      setVista(scene.id, {
        giro: Math.round(camera.giro),
        inclinacao: Math.round(camera.inclinacao),
      });
    },
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
   * A cena que se desenha, com o olhar de AGORA.
   *
   * O giro do gesto entra na vista da cena desenhada antes de chegar ao board:
   * a ordem do pintor e as peças em pé dependem dele, e sem isto a câmera
   * giraria com as peças olhando para o lado antigo até o soltar.
   */
  const desenhada = useMemo(
    () => (daMesa ? { ...daMesa, vista: olhar } : null),
    [daMesa, olhar],
  );

  const orbital = useMemo<CameraAssinavel>(
    () => ({ corrente, assinar, perspectiva: focal }),
    [assinar, corrente, focal],
  );

  return (
    <div
      ref={mesa}
      className="relative min-h-0 flex-1 cursor-grab overflow-hidden rounded-md bg-black active:cursor-grabbing"
    >
      {desenhada && tamanho && focal > 0 ? (
        <PalcoSoTela largura={tamanho.largura} altura={tamanho.altura}>
          <CenaDeEsguelha scene={desenhada} orbital={orbital} />
        </PalcoSoTela>
      ) : null}
    </div>
  );
}

function paraOlhar(vista: Vista | undefined): Vista {
  return vista ?? VISTA_PADRAO;
}
