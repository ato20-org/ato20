"use client";

import { useState } from "react";

import { desenrolarAngulo } from "@/lib/geometry/transform";

/**
 * O giro para pôr num `rotate()` que tem transição: o mesmo ângulo, desenrolado
 * contra o último desenhado. Sem isto, cruzar a base (359° → 0°) faz a TV dar
 * uma volta inteira. Ver `desenrolarAngulo`.
 *
 * Em estado, e não num ref: é o "guardar o que veio do render anterior" da
 * documentação do React. O `set` no meio do render refaz o componente antes de
 * pintar, e um render descartado leva o estado junto. Um ref mutado no render
 * ficaria apontando para um ângulo que nunca chegou à tela.
 *
 * Guarda o giro BRUTO ao lado do desenhado, e compara o bruto: comparar o
 * desenhado normalizado esbarraria no arredondamento de um giro fracionário, e
 * o `set` não pararia de disparar.
 */
export function useGiroDesenrolado(giro: number): number {
  const [visto, setVisto] = useState({ giro, desenhado: giro });

  if (visto.giro !== giro) {
    const desenhado = desenrolarAngulo(visto.desenhado, giro);
    setVisto({ giro, desenhado });
    return desenhado;
  }

  return visto.desenhado;
}
