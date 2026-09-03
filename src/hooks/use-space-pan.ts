"use client";

import { useEffect } from "react";

import { useViewportStore } from "@/lib/store/use-viewport-store";

function isTyping(target: EventTarget | null): boolean {
  return Boolean(
    (target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']"),
  );
}

/**
 * Espaço pressionado liga o modo de deslocar a cena.
 *
 * O botão do meio já fazia isso, mas mouse sem terceiro botão e trackpad de
 * notebook não têm como acioná-lo — e navegar num mapa ampliado é operação
 * constante, não eventual.
 */
export function useSpacePan(): void {
  const setPanMode = useViewportStore((state) => state.setPanMode);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || isTyping(event.target)) return;

      // Barra duas coisas: a rolagem da página e o "clique" que o espaço
      // dispara no botão que estiver com foco — a barra de zoom fica a um Tab
      // de distância.
      event.preventDefault();

      // `keydown` repete enquanto a tecla fica segura.
      if (!useViewportStore.getState().panMode) setPanMode(true);
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") setPanMode(false);
    }

    /** Perder o foco com a tecla segura deixaria o modo preso. */
    function release() {
      setPanMode(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", release);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", release);
      setPanMode(false);
    };
  }, [setPanMode]);
}
