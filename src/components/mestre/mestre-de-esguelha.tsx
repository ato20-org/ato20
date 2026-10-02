"use client";

import { useEffect, useMemo, useState } from "react";

import { PainelDoTripe } from "@/components/mestre/painel-do-tripe";
import { TripesNoPalco } from "@/components/mestre/tripes-no-palco";
import { CenaDeEsguelha } from "@/components/playground/cena-de-esguelha";
import { PalcoSoTela } from "@/components/playground/scene-stage";
import { useCameraOrbital } from "@/hooks/use-camera-orbital";
import {
  cameraDoRecorte,
  correnteDoTripe,
  focalDaLente,
  LENTE_DA_MESA,
  tripeDaOrbital,
  type CameraAssinavel,
} from "@/lib/geometry/camera-orbital";
import { useCameraLockStore } from "@/lib/store/use-camera-lock-store";
import { aplicarGesto, useGestoStore } from "@/lib/store/use-gesto-store";
import { clampViewport, PLANO } from "@/lib/geometry/viewport";
import { useEsguelhaStore, type Olhar } from "@/lib/store/use-esguelha-store";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { sceneForTable } from "@/lib/sync/for-table";
import type { Scene, Tripe } from "@/types/scene";

/** A tela da mesa: o tripé alimenta uma janela 16:9. */
const PROPORCAO_DA_MESA = 16 / 9;

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

  const selecionadaId = useCameraLockStore((state) => state.selecionadaId);
  const selecionar = useCameraLockStore((state) => state.selecionar);
  const olhandoPor = useEsguelhaStore((state) => state.olhandoPor);
  const olharPor = useEsguelhaStore((state) => state.olharPor);

  /**
   * A cena com o gizmo em curso por cima, como o palco 2D faz com a moldura:
   * o board só sabe do tripé ao soltar. Ver `aplicarGesto`.
   */
  const gestoCena = useGestoStore((state) => state.sceneId);
  const gestoTripe = useGestoStore((state) => state.tripe);
  const comGesto = useMemo(
    () =>
      gestoTripe
        ? aplicarGesto(scene, {
            sceneId: gestoCena,
            patches: null,
            textos: null,
            formas: null,
            camera: null,
            tripe: gestoTripe,
          })
        : scene,
    [gestoCena, gestoTripe, scene],
  );
  const tripes = comGesto.tripes ?? [];
  const tripeEscolhido = tripes.find((tripe) => tripe.id === selecionadaId);
  const olhado = tripes.find((tripe) => tripe.id === olhandoPor);

  // Olhar por um tripé que deixou de existir -- apagado, ou de outra cena --
  // volta à navegação sozinho.
  useEffect(() => {
    if (olhandoPor && !olhado) olharPor(null);
  }, [olhado, olhandoPor, olharPor]);

  const { mesa, focal, tamanho, corrente, assinar, instante } = useCameraOrbital({
    travado: Boolean(olhado),
    lente: LENTE_DA_MESA,
    giro: olhar.giro,
    inclinacao: olhar.inclinacao,
    onGirar: setOlhar,
    arrastar: false,
    // Sem ferramenta na mão: o botão esquerdo é da câmera -- menos sobre um
    // tripé ou o gizmo dele, que são da mão.
    podeAgarrar: (alvo) =>
      !(alvo instanceof Element && alvo.closest("[data-tripe-alvo]")),
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

  // O "nova câmera daqui" pergunta por aqui: o tripé que veria o que o mestre
  // está vendo agora. Desmontado, ninguém responde. Ver `useEsguelhaStore`.
  const registrarOlho = useEsguelhaStore((state) => state.registrarOlho);
  useEffect(() => {
    registrarOlho(() => {
      const agora = instante();
      return agora ? tripeDaOrbital(agora.camera, agora.tela) : null;
    });
    return () => registrarOlho(null);
  }, [instante, registrarOlho]);

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

  /**
   * A janela 16:9 da mesa dentro da área do palco, para o "olhar pela câmera".
   * O tripé enche ESTA caixa como enche a tela da mesa; o que sobra em volta é
   * o que a mesa não vê.
   */
  const quadro = useMemo(
    () =>
      tamanho
        ? tamanho.largura / tamanho.altura > PROPORCAO_DA_MESA
          ? {
              largura: tamanho.altura * PROPORCAO_DA_MESA,
              altura: tamanho.altura,
            }
          : {
              largura: tamanho.largura,
              altura: tamanho.largura / PROPORCAO_DA_MESA,
            }
        : null,
    [tamanho],
  );

  /**
   * O olhar do Mestre pelo tripé: a corrente do tripé, com a lente trocada pela
   * que faz a altura da janela 16:9 ver o que a mesa vê. Ver `lenteNaCaixa`.
   */
  const pelaCamera = useMemo(() => {
    if (!olhado || !tamanho || !quadro || focal <= 0) return null;
    const tela = { ...tamanho, focal };
    const olho: Tripe = {
      ...olhado,
      lente: lenteNaCaixa(olhado.lente, quadro.altura, tamanho.altura),
    };
    return {
      camera: {
        corrente: () => correnteDoTripe(olho, tela),
        assinar,
        perspectiva: focal,
      } as CameraAssinavel,
      giro: olhado.giro,
      inclinacao: olhado.inclinacao,
    };
  }, [assinar, focal, olhado, quadro, tamanho]);

  return (
    <>
      <div
        ref={mesa}
        className={
          olhado
            ? "relative min-h-0 flex-1 overflow-hidden rounded-md bg-black"
            : "relative min-h-0 flex-1 cursor-grab overflow-hidden rounded-md bg-black active:cursor-grabbing"
        }
      >
        {daMesa && tamanho && focal > 0 ? (
          <PalcoSoTela largura={tamanho.largura} altura={tamanho.altura}>
            <CenaDeEsguelha scene={daMesa} olhar={pelaCamera ?? comCamera} />
          </PalcoSoTela>
        ) : null}

        {olhado && quadro ? (
          // A janela da mesa, marcada: o que está fora dela a mesa não vê.
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm outline outline-2 outline-red-400/80"
            style={{
              width: quadro.largura,
              height: quadro.altura,
              boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.55)",
            }}
          />
        ) : tamanho ? (
          <TripesNoPalco
            sceneId={scene.id}
            tripes={tripes}
            selecionadaId={selecionadaId}
            noArId={scene.cameraNoArId}
            olhar={{ assinar, instante }}
            onSelecionar={selecionar}
          />
        ) : null}
      </div>

      {/* Fora da área da mesa, e não dentro: a câmera do mestre ouve ali, e o
          clique ou a roda sobre o painel andariam com a mesa. */}
      {tripeEscolhido ? (
        <div className="absolute bottom-3 left-3">
          <PainelDoTripe sceneId={scene.id} tripe={tripeEscolhido} />
        </div>
      ) : null}
    </>
  );
}

/**
 * A lente que, numa caixa de `alturaDaCaixa` pixels, vê o que `lente` vê numa
 * janela de `alturaDaJanela`.
 *
 * O "olhar pela câmera" desenha na área inteira do palco, e a mesa é a janela
 * 16:9 dentro dela: para a janela ver exatamente o que a mesa vê, a caixa
 * inteira precisa de uma lente proporcionalmente mais aberta.
 */
function lenteNaCaixa(
  lente: number,
  alturaDaJanela: number,
  alturaDaCaixa: number,
): number {
  const focal = focalDaLente(alturaDaJanela, lente);
  return ((2 * Math.atan(alturaDaCaixa / 2 / focal)) * 180) / Math.PI;
}

