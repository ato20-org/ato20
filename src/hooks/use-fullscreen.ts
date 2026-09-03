"use client";

import { useEffect, useState } from "react";

/**
 * Tela cheia com duas camadas.
 *
 * A base é um estado que o chamador usa para esticar o elemento sobre a
 * viewport por CSS. Isso funciona em todo lugar — inclusive no iPhone, onde
 * `Element.requestFullscreen` não existe: o Safari de iOS só entrega tela
 * cheia para `<video>`.
 *
 * Em cima disso, a API nativa é tentada como reforço, para também sumir com a
 * barra do navegador onde houver suporte. Falhar aí não muda o resultado
 * visível.
 */
export function useFullscreen(): {
  expanded: boolean;
  toggle: (element: HTMLElement | null) => void;
  exit: () => void;
} {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Sair pelo Esc ou pelo gesto do sistema avisa por aqui. Se a API nativa
    // nunca foi concedida, o evento não dispara e nada é colapsado à revelia.
    function handleChange() {
      if (!document.fullscreenElement) setExpanded(false);
    }

    document.addEventListener("fullscreenchange", handleChange);

    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  useEffect(() => {
    if (!expanded) return;

    // Caminho só-CSS (iOS): o Esc não passa pelo navegador, então é tratado
    // aqui. Em tela cheia nativa o navegador consome o Esc e o
    // `fullscreenchange` acima resolve.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  function toggle(element: HTMLElement | null) {
    if (expanded) {
      setExpanded(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      return;
    }

    setExpanded(true);

    // Tudo daqui para baixo é melhor-esforço.
    void element
      ?.requestFullscreen?.()
      .then(() => {
        // Cena é 16:9. Num celular em retrato ela sobra tela dos dois lados, e
        // deitar a tela é o que torna a leitura de mapa possível. Só existe em
        // parte dos navegadores e só dentro de tela cheia.
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (target: string) => Promise<void>;
        };

        return orientation.lock?.("landscape");
      })
      .catch(() => {});
  }

  function exit() {
    setExpanded(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }

  return { expanded, toggle, exit };
}
