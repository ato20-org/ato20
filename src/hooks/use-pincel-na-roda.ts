"use client";

import { useEffect } from "react";

import { deltaDaRoda } from "@/lib/geometry/pincel";
import { mudarTamanhoDoPincel, pincelNaMao } from "@/lib/mestre/pincel";

/**
 * Quanto a roda tem de girar para o pincel andar um passo, em pixels.
 *
 * Um entalhe de mouse passa disto sozinho; o trackpad, que entrega a rolagem
 * em migalhas, precisa juntar algumas. Sem acumular, um deslizar de dois dedos
 * levaria o pincel do mínimo ao máximo de uma vez.
 */
const DEGRAU_PX = 40;

/**
 * Alt+roda sobre o palco muda o tamanho do pincel na mão: a largura do lápis,
 * o raio da borracha da névoa.
 *
 * Na janela, na fase de CAPTURA: a roda do palco é zoom, e o ouvinte dele mora
 * na moldura. Com o Alt e um pincel na mão, este chega antes e a segura -- a
 * roda vira tamanho, e a câmera não anda. Sem o Alt, ou sem pincel, ou fora do
 * palco (um painel lateral rolando), não toca em nada.
 */
export function usePincelNaRoda(): void {
  useEffect(() => {
    let acumulado = 0;

    const rodou = (evento: WheelEvent) => {
      if (!evento.altKey || !pincelNaMao()) return;
      const alvo = evento.target instanceof Element ? evento.target : null;
      if (!alvo?.closest("[data-palco]")) return;

      evento.preventDefault();
      evento.stopPropagation();

      acumulado += deltaDaRoda(evento);
      if (Math.abs(acumulado) < DEGRAU_PX) return;

      // Para cima cresce, como o zoom aproxima.
      mudarTamanhoDoPincel(acumulado < 0 ? 1 : -1);
      acumulado = 0;
    };

    window.addEventListener("wheel", rodou, { capture: true, passive: false });
    return () =>
      window.removeEventListener("wheel", rodou, { capture: true });
  }, []);
}
