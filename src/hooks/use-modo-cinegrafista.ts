"use client";

import { useEffect, useRef, useState } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import {
  centerViewportOn,
  clampViewport,
  zoomViewport,
} from "@/lib/geometry/viewport";
import { ZOOM_CAMERA_STEP } from "@/lib/mestre/camera-actions";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import type { Viewport } from "@/types/scene";

type Opcoes = {
  camera: Viewport | undefined;
  /** Com espaço segurado o gesto é do palco, e a câmera não segue. */
  ativo: boolean;
  onChange: (camera: Viewport) => void;
  /**
   * V acabou de ser apertado. Quem precisa soltar a trava da câmera grava
   * aqui -- e UMA vez, no começo.
   *
   * Existia de graça enquanto cada quadro chamava `gravarCameraManual`, que
   * solta o alvo por conta própria. Com o gesto passando pelo `useGestoStore`,
   * ninguém mais soltava: a câmera presa a tokens seguia o mouse e o seguidor
   * a puxava de volta para os tokens, dez vezes por segundo, brigando.
   */
  onGestureStart?: () => void;
  /** V foi solto. Quem separa gesto de documento grava aqui. */
  onGestureEnd?: () => void;
};

/**
 * Modo cinegrafista: com V segurado, a câmera da mesa segue o mouse do
 * mestre, e a roda aproxima e afasta o que a TV vê.
 *
 * V e não Alt, como era: no Linux Alt+arrastar pertence ao gerenciador de
 * janelas, e a webview nem via o gesto. V de "visor", segurado como o Space do
 * pan -- modo temporário é tecla segurada, é o padrão da bancada.
 *
 * Existe porque arrastar uma moldura é um gesto de EDITOR, e enquadrar a mesa
 * durante a sessão é um gesto de CÂMERA: o mestre quer apontar, não pegar.
 * Segurar V e passear o mouse pela sala faz a TV passear junto; soltar
 * congela onde estava.
 *
 * Os listeners são nativos e na janela, com captura, porque precisam ganhar
 * da roda do `SceneStage`, que é zoom do palco e vive num listener nativo no
 * quadro -- um `stopPropagation` sintético não o alcança. A câmera não segue
 * com botão pressionado: no meio de um arrasto o gesto é do item.
 *
 * A tecla segurada é estado deste hook, e não lida do evento como o `altKey`
 * era: `pointermove` e `wheel` não sabem se o V está apertado.
 *
 * Devolve se o modo está ligado, para a moldura se pintar de acordo.
 */
function digitando(alvo: EventTarget | null): boolean {
  return Boolean(
    (alvo as HTMLElement | null)?.closest?.(
      "input, textarea, [contenteditable='true']",
    ),
  );
}

export function useModoCinegrafista({
  camera,
  ativo,
  onChange,
  onGestureStart,
  onGestureEnd,
}: Opcoes): boolean {
  const { toScene, fundoDoPalco } = useSceneScale();
  const [ligado, setLigado] = useState(false);

  // Sempre o valor atual, sem remontar os listeners a cada quadro em que a
  // própria câmera muda -- e ela muda a cada movimento do mouse.
  const atual = useRef({
    camera,
    ativo,
    onChange,
    toScene,
    onGestureStart,
    onGestureEnd,
  });
  useEffect(() => {
    atual.current = {
      camera,
      ativo,
      onChange,
      toScene,
      onGestureStart,
      onGestureEnd,
    };
  });

  useEffect(() => {
    const palco = fundoDoPalco?.parentElement ?? null;
    let quadro: number | undefined;
    let segurando = false;

    /**
     * O recorte que este gesto já pediu, entregue ou não.
     *
     * A roda é incremental -- cada notch multiplica a largura da anterior --, e
     * agrupar por quadro sem guardar o pedido faria todos os notches do mesmo
     * quadro partirem da MESMA câmera: dez notches dariam um degrau de zoom, e
     * não dez. Aqui a roda e o mouse escrevem os dois nesta variável, e o
     * quadro entrega uma vez só o que sobrou.
     */
    let pedida: Viewport | null = null;
    let proxima: Viewport | null = null;

    const base = () => pedida ?? atual.current.camera ?? null;

    const pedir = (viewport: Viewport) => {
      pedida = viewport;
      proxima = viewport;
      if (quadro !== undefined) return;

      quadro = requestAnimationFrame(() => {
        quadro = undefined;
        const entregar = proxima;
        proxima = null;
        if (entregar) atual.current.onChange(entregar);
      });
    };

    /** O último pedido entra antes do fim: descartá-lo perderia um quadro. */
    const despejar = () => {
      if (quadro !== undefined) cancelAnimationFrame(quadro);
      quadro = undefined;
      if (proxima) atual.current.onChange(proxima);
      proxima = null;
      pedida = null;
    };

    const podeSeguir = (alvo: EventTarget | null) =>
      Boolean(atual.current.camera) &&
      atual.current.ativo &&
      palco?.contains(alvo as Node) === true;

    function aoMover(evento: PointerEvent) {
      if (!segurando || evento.buttons !== 0 || !podeSeguir(evento.target))
        return;

      const camera = base();
      if (!camera) return;

      pedir(
        centerViewportOn(
          camera,
          atual.current.toScene(evento.clientX, evento.clientY),
          useViewportStore.getState().conteudo,
        ),
      );
    }

    function aoRodar(evento: WheelEvent) {
      if (!segurando || !podeSeguir(evento.target)) return;

      // Antes do `SceneStage`, e sem deixar chegar lá: a roda é da câmera.
      evento.preventDefault();
      evento.stopPropagation();

      const camera = base();
      if (!camera) return;

      const conteudo = useViewportStore.getState().conteudo;
      const fator =
        evento.deltaY < 0 ? ZOOM_CAMERA_STEP : 1 / ZOOM_CAMERA_STEP;

      pedir(
        clampViewport(
          zoomViewport(
            camera,
            fator,
            atual.current.toScene(evento.clientX, evento.clientY),
            conteudo,
          ),
          conteudo,
        ),
      );
    }

    function aoTecla(evento: KeyboardEvent) {
      if (evento.key.toLowerCase() !== "v") return;

      // SOLTAR vale sempre, venha de onde vier. Se o V foi apertado no palco
      // e solto com o foco num campo -- renomear uma pasta no meio do gesto
      // --, recusar o keyup deixava o visor preso: a roda passava a dar zoom
      // na câmera em vez do mapa até a próxima tecla V. Foi o "bug da câmera
      // no zoom" voltando por outra porta.
      if (evento.type === "keyup") {
        if (segurando) {
          despejar();
          atual.current.onGestureEnd?.();
        }
        segurando = false;
        setLigado(false);
        return;
      }

      // Só o V solto: Shift+V é espelhar, Ctrl+V é colar, e digitar num campo
      // não é segurar o visor.
      if (
        evento.ctrlKey ||
        evento.metaKey ||
        evento.shiftKey ||
        evento.altKey ||
        digitando(evento.target)
      )
        return;

      // A repetição automática da tecla chega como keydown de novo; não é
      // mudança de estado.
      if (evento.repeat) return;

      segurando = true;
      setLigado(true);
      atual.current.onGestureStart?.();
    }

    // V solto fora da janela nunca chega como keyup.
    function desligar() {
      if (segurando) {
        despejar();
        atual.current.onGestureEnd?.();
      }
      segurando = false;
      setLigado(false);
    }

    window.addEventListener("pointermove", aoMover, true);
    window.addEventListener("wheel", aoRodar, { capture: true, passive: false });
    window.addEventListener("keydown", aoTecla, true);
    window.addEventListener("keyup", aoTecla, true);
    window.addEventListener("blur", desligar);

    return () => {
      // Desmontar com V segurado deixaria o gesto pendurado no store, e o
      // palco desenharia para sempre a câmera onde a mão a largou.
      if (segurando) {
        despejar();
        atual.current.onGestureEnd?.();
      }
      if (quadro !== undefined) cancelAnimationFrame(quadro);
      window.removeEventListener("pointermove", aoMover, true);
      window.removeEventListener("wheel", aoRodar, true);
      window.removeEventListener("keydown", aoTecla, true);
      window.removeEventListener("keyup", aoTecla, true);
      window.removeEventListener("blur", desligar);
    };
  }, [fundoDoPalco]);

  return ligado && Boolean(camera) && ativo;
}
