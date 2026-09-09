"use client";

import { useId } from "react";

import { SCENE_HEIGHT, SCENE_WIDTH, type SceneGrid } from "@/types/scene";

/** Espessura da linha, em unidades de cena. */
const LINHA = 1.5;

/**
 * A grade sobre o mapa.
 *
 * Um padrão SVG, e não um elemento por linha: um mapa com grade de 40 unidades
 * tem 48 colunas e 27 linhas, e 75 nós no DOM que o compositor precisa recompor
 * a cada quadro de arrasto custaria o que a cena inteira custa. O padrão é um nó
 * só.
 *
 * ## Por que não gradiente
 *
 * Era `repeating-linear-gradient`, e ele borrava com o quadrado grande. A linha
 * é expressa como fração do período — 1,5 de 62 é 2,4% —, e o gradiente é
 * resolvido por uma tabela de cores de resolução fixa: abaixo de ~30 colunas a
 * transição dura menos que uma entrada da tabela, e a borda que devia ser seca
 * vira rampa. Quanto maior o quadrado, mais grosso o borrão.
 *
 * O padrão SVG não tem esse limite: a linha é um retângulo, com a largura que
 * ela diz ter, em qualquer proporção de quadrado.
 *
 * ## Por que dois retângulos e não um traço em L
 *
 * `stroke` fica centrado no caminho, então um "L" no canto do quadrado deixaria
 * metade da espessura fora do bloco — a primeira linha nasceria com metade da
 * grossura das outras. Retângulo é preenchimento, e começa onde diz que começa.
 *
 * Em unidades de cena, como todo o resto do plano: a grade acompanha o zoom do
 * palco e é a mesma na TV de 1920 e no celular de 390.
 */
export function GridLayer({ grid }: { grid: SceneGrid }) {
  /**
   * Um id por instância: dois palcos na mesma página — o do mestre e a
   * pré-visualização — teriam padrões de nomes iguais, e o segundo venceria.
   *
   * Saneado porque ele entra num `url(#...)`, que é sintaxe de CSS: o React 19
   * gera `_R_1a_`, que passa, mas o 18 gerava `:r0:` — e dois pontos ali fazem
   * o navegador descartar a referência sem erro nenhum. A grade simplesmente
   * não apareceria, e nada na tela diria por quê.
   */
  const id = `grade${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const cor = grid.dark ? "0 0 0" : "255 255 255";
  const linha = `rgb(${cor} / ${grid.opacity})`;

  // `size` mínimo de 8: abaixo disso a grade vira um borrão cinza, e um valor
  // acidental de 0 travaria o browser tentando repetir infinitamente.
  const passo = Math.max(8, grid.size);

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0"
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
    >
      <defs>
        {/*
          O deslocamento move o PADRÃO, não o elemento: mover o elemento
          deixaria uma faixa sem grade na borda oposta.

          O resto da divisão porque deslocar um quadrado inteiro é o mesmo que
          não deslocar nada, e o controle deixa o mestre arrastar até o tamanho
          do quadrado.
        */}
        <pattern
          id={id}
          x={grid.offsetX % passo}
          y={grid.offsetY % passo}
          width={passo}
          height={passo}
          patternUnits="userSpaceOnUse"
        >
          <rect width={LINHA} height={passo} fill={linha} />
          <rect width={passo} height={LINHA} fill={linha} />
        </pattern>
      </defs>

      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
