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

export function useModoCinegrafista({ camera, ativo, onChange }: Opcoes): boolean {
  const { toScene, fundoDoPalco } = useSceneScale();
  const [ligado, setLigado] = useState(false);

  // Sempre o valor atual, sem remontar os listeners a cada quadro em que a
  // própria câmera muda -- e ela muda a cada movimento do mouse.
  const atual = useRef({ camera, ativo, onChange, toScene });
  useEffect(() => {
    atual.current = { camera, ativo, onChange, toScene };
  });

  useEffect(() => {
    const palco = fundoDoPalco?.parentElement ?? null;
    let quadro: number | undefined;
    let segurando = false;

    const podeSeguir = (alvo: EventTarget | null) =>
      Boolean(atual.current.camera) &&
      atual.current.ativo &&
      palco?.contains(alvo as Node) === true;

    function aoMover(evento: PointerEvent) {
      if (!segurando || evento.buttons !== 0 || !podeSeguir(evento.target))
        return;

      // Um commit por quadro: o mouse reporta acima da taxa de tela, e cada
      // evento viraria um update do board.
      if (quadro !== undefined) return;
      quadro = requestAnimationFrame(() => {
        quadro = undefined;
        const { camera, onChange, toScene } = atual.current;
        if (!camera) return;

        onChange(
          centerViewportOn(
            camera,
            toScene(evento.clientX, evento.clientY),
            useViewportStore.getState().conteudo,
          ),
        );
      });
    }

    function aoRodar(evento: WheelEvent) {
      if (!segurando || !podeSeguir(evento.target)) return;

      // Antes do `SceneStage`, e sem deixar chegar lá: a roda é da câmera.
      evento.preventDefault();
      evento.stopPropagation();

      const { camera, onChange, toScene } = atual.current;
      if (!camera) return;

      const fator =
        evento.deltaY < 0 ? ZOOM_CAMERA_STEP : 1 / ZOOM_CAMERA_STEP;

      onChange(
        clampViewport(
          zoomViewport(
            camera,
            fator,
            toScene(evento.clientX, evento.clientY),
            useViewportStore.getState().conteudo,
          ),
          useViewportStore.getState().conteudo,
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
    }

    // V solto fora da janela nunca chega como keyup.
    function desligar() {
      segurando = false;
      setLigado(false);
    }

    window.addEventListener("pointermove", aoMover, true);
    window.addEventListener("wheel", aoRodar, { capture: true, passive: false });
    window.addEventListener("keydown", aoTecla, true);
    window.addEventListener("keyup", aoTecla, true);
    window.addEventListener("blur", desligar);

    return () => {
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
