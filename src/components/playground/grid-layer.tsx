"use client";

import { SCENE_HEIGHT, SCENE_WIDTH, type SceneGrid } from "@/types/scene";

/** Espessura da linha, em unidades de cena. */
const LINHA = 1.5;

/**
 * A grade sobre o mapa.
 *
 * Desenhada com dois gradientes repetidos, e não com um elemento por linha: um
 * mapa com grade de 40 unidades tem 48 colunas e 27 linhas, e 75 nós no DOM que
 * o compositor precisa recompor a cada frame de arrasto custaria o que a cena
 * inteira custa. O gradiente é uma textura só, e fica na GPU.
 *
 * Em unidades de cena, como todo o resto do plano: a grade acompanha o zoom do
 * palco e é a mesma na TV de 1920 e no celular de 390.
 */
export function GridLayer({ grid }: { grid: SceneGrid }) {
  const cor = grid.dark ? "0 0 0" : "255 255 255";
  const linha = `rgb(${cor} / ${grid.opacity})`;

  // `size` mínimo de 8: abaixo disso a grade vira um borrão cinza, e um valor
  // acidental de 0 travaria o browser tentando repetir infinitamente.
  const passo = Math.max(8, grid.size);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        width: SCENE_WIDTH,
        height: SCENE_HEIGHT,
        backgroundImage: `
          repeating-linear-gradient(to right, ${linha} 0 ${LINHA}px, transparent ${LINHA}px ${passo}px),
          repeating-linear-gradient(to bottom, ${linha} 0 ${LINHA}px, transparent ${LINHA}px ${passo}px)
        `,
        // O deslocamento move a textura, não o elemento: mover o elemento
        // deixaria uma faixa sem grade na borda oposta.
        backgroundPosition: `${grid.offsetX % passo}px ${grid.offsetY % passo}px`,
      }}
    />
  );
}
