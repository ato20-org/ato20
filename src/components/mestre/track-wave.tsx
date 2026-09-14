"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Altura mínima de uma barra, em porcentagem. Zero desapareceria. */
const MIN_ALTURA = 8;

/**
 * A forma da onda, com a parte tocada acesa.
 *
 * Substituiu um slider comum. Um slider diz onde a faixa está; a onda diz
 * também **como ela é** — onde tem batida, onde tem silêncio, onde o trecho
 * calmo começa. Numa mesa isso é útil de verdade: dá para achar a virada da
 * música sem ouvir até lá.
 *
 * `role="slider"` de propósito. É um controle personalizado, e sem isso ele
 * seria invisível para teclado e leitor de tela — as setas movem, e é a única
 * forma de buscar sem mouse.
 */
export function TrackWave({
  peaks,
  position,
  duration,
  onSeek,
}: {
  /** Um valor de 0 a 100 por barra. Vazio desenha a linha lisa. */
  peaks: number[] | null;
  position: number;
  duration: number;
  onSeek: (segundos: number) => void;
}) {
  const trilhaRef = useRef<HTMLDivElement>(null);

  /**
   * Instante que o dedo está arrastando.
   *
   * Enquanto existe, manda na aparência: sem isso o `timeupdate`, que chega
   * quatro vezes por segundo, empurraria a posição de volta para debaixo do
   * cursor a cada atualização.
   */
  const [arrastando, setArrastando] = useState<number | null>(null);

  const conhecida = duration > 0;
  const mostrado = arrastando ?? position;
  const fracao = conhecida ? Math.min(1, Math.max(0, mostrado / duration)) : 0;

  // Sem picos ainda — medindo, ou arquivo que o browser não decodifica. Uma
  // linha lisa é honesta: mostra a posição sem inventar uma forma.
  const barras =
    peaks && peaks.length > 0 ? peaks : Array.from({ length: 120 }, () => 12);
  const tocadas = Math.round(fracao * barras.length);

  function instanteDoEvento(clientX: number): number | null {
    const trilha = trilhaRef.current;
    if (!trilha || !conhecida) return null;

    const { left, width } = trilha.getBoundingClientRect();
    if (width === 0) return null;

    return Math.min(1, Math.max(0, (clientX - left) / width)) * duration;
  }

  return (
    <div
      ref={trilhaRef}
      role="slider"
      tabIndex={conhecida ? 0 : -1}
      aria-label="Posição da faixa"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(mostrado)}
      aria-valuetext={`${Math.round(mostrado)} de ${Math.round(duration)} segundos`}
      aria-disabled={!conhecida}
      className={cn(
        "focus-visible:ring-ring flex h-7 min-w-24 flex-1 items-center gap-px rounded focus-visible:ring-2 focus-visible:outline-none",
        conhecida ? "cursor-pointer" : "cursor-default opacity-60",
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return;

        const instante = instanteDoEvento(event.clientX);
        if (instante === null) return;

        // `setPointerCapture`: o arraste continua valendo se o cursor sair da
        // barra, que é o que acontece sempre que alguém arrasta rápido.
        event.currentTarget.setPointerCapture(event.pointerId);
        setArrastando(instante);
      }}
      onPointerMove={(event) => {
        if (arrastando === null) return;

        const instante = instanteDoEvento(event.clientX);
        if (instante !== null) setArrastando(instante);
      }}
      onPointerUp={(event) => {
        if (arrastando === null) return;

        event.currentTarget.releasePointerCapture(event.pointerId);
        onSeek(arrastando);
        setArrastando(null);
      }}
      onKeyDown={(event) => {
        if (!conhecida) return;

        // Cinco segundos por seta, e a faixa inteira com Home e End. Um passo
        // de um segundo obrigaria a segurar a tecla para atravessar a música.
        const passo = event.shiftKey ? 30 : 5;

        const alvo =
          event.key === "ArrowRight"
            ? position + passo
            : event.key === "ArrowLeft"
              ? position - passo
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? duration
                  : null;

        if (alvo === null) return;

        event.preventDefault();
        onSeek(Math.min(duration, Math.max(0, alvo)));
      }}
    >
      {barras.map((altura, indice) => (
        <span
          key={indice}
          // `pointer-events-none` nas barras: o alvo do gesto é a trilha
          // inteira, e sem isso `clientX` continuaria certo mas o `currentTarget`
          // do `pointerup` poderia ser uma barra, quebrando a captura.
          className={cn(
            "pointer-events-none min-w-px flex-1 rounded-full transition-colors",
            indice < tocadas ? "bg-foreground" : "bg-muted-foreground/30",
          )}
          style={{ height: `${Math.max(MIN_ALTURA, altura)}%` }}
        />
      ))}
    </div>
  );
}
