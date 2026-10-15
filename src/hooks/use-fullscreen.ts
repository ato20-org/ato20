"use client";

import { useEffect, useRef, useState } from "react";

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
  /** O elemento a que a API nativa CONCEDEU tela cheia. `null` = só CSS. */
  const concedido = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Sair pelo Esc ou pelo gesto do sistema avisa por aqui. Se a API nativa
    // nunca foi concedida, nada é colapsado à revelia.
    //
    // Pelo elemento, e não por `fullscreenElement` vazio: com a página inteira
    // em tela cheia por baixo (ver `useTelaCheiaDaPagina`), sair da do mapa
    // devolve a tela cheia à página -- o elemento não fica `null`, e o mapa
    // continuaria esticado por CSS sobre ela.
    function handleChange() {
      if (!concedido.current) return;
      if (document.fullscreenElement === concedido.current) return;
      concedido.current = null;
      destravarOrientacao();
      setExpanded(false);
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
      exit();
      return;
    }

    setExpanded(true);

    // A página já está em tela cheia (ver `useTelaCheiaDaPagina`) e é ela que
    // se pede: não há o que pedir, só deitar a tela. E sem `concedido`, sair
    // do mapa deixa a página na tela cheia que já era dela.
    const pedido =
      element !== null && document.fullscreenElement === element
        ? Promise.resolve()
        : element?.requestFullscreen?.().then(() => {
            concedido.current = element;
          });

    // Tudo daqui para baixo é melhor-esforço.
    void pedido
      ?.then(() => {
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
    // Só a tela cheia DESTE elemento: a da página, se estiver por baixo, fica.
    if (concedido.current && document.fullscreenElement === concedido.current) {
      void document.exitFullscreen().catch(() => {});
    }
    // Sempre: com a página já em tela cheia não houve `concedido`, mas a tela
    // foi deitada do mesmo jeito.
    destravarOrientacao();
    concedido.current = null;
  }

  return { expanded, toggle, exit };
}

/**
 * Solta a orientação que a tela cheia do mapa travou em paisagem.
 *
 * Sair de toda tela cheia já a solta sozinho; mas com a página inteira em tela
 * cheia por baixo, sair da do mapa não sai de toda -- e o celular ficaria
 * deitado à força na ficha e no chat.
 */
function destravarOrientacao() {
  const orientation = screen.orientation as ScreenOrientation & {
    unlock?: () => void;
  };

  try {
    orientation.unlock?.();
  } catch {
    // Sem trava, nada a soltar.
  }
}
