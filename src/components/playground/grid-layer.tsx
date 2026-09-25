"use client";

import { useId, useMemo } from "react";

import { casaDoItem } from "@/lib/geometry/grid";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type SceneGrid,
} from "@/types/scene";

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
 *
 * ## A casa de quem está no mapa
 *
 * Os quadrados ocupados por personagem saem realçados -- fundo na cor da linha,
 * com pouca tinta, e as quatro linhas da casa mais fortes. É o que responde
 * "de onde eu saio" sem ninguém precisar apontar o dedo na TV, e é o par
 * natural do ímã: com o encaixe ligado, o realce mostra a casa em que a peça
 * acabou de pousar.
 *
 * DENTRO do mesmo `svg` da grade, e não em `div`s ao lado: o `svg` recorta o
 * que passa da caixa dele, então um token na beira do mapa não faz a casa
 * transbordar o plano -- e transbordo dentro do plano é o que já derrubou o
 * palco três vezes. Ver a §3 de `debug-do-palco`.
 */
export function GridLayer({
  grid,
  items = [],
}: {
  grid: SceneGrid;
  /**
   * O que está no mapa. Só quem tem personagem ganha casa realçada: mobília,
   * porta e mancha de sangue também são itens, e realçar a casa de cada um
   * pintaria o mapa inteiro.
   */
  items?: CanvasItem[];
}) {
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
  // A mesma cor da linha, nas duas doses do realce: o fundo com pouco mais da
  // metade da tinta -- forte o bastante para a casa se achar de relance na TV,
  // e ainda fraco o bastante para o mapa aparecer por baixo --, e a borda com o
  // dobro, com teto em 1, que é o que faz a casa "acender".
  const fundoDaCasa = `rgb(${cor} / ${grid.opacity * 0.6})`;
  const bordaDaCasa = `rgb(${cor} / ${Math.min(1, grid.opacity * 2)})`;

  // `size` mínimo de 8: abaixo disso a grade vira um borrão cinza, e um valor
  // acidental de 0 travaria o browser tentando repetir infinitamente.
  const passo = Math.max(8, grid.size);

  /**
   * As casas a realçar, uma por personagem no mapa.
   *
   * Por chave e não por posição na lista: dois tokens na mesma casa -- o que
   * acontece quando a mesa se amontoa numa porta -- pintariam o mesmo quadrado
   * duas vezes, e o segundo escureceria o primeiro.
   */
  const casas = useMemo(() => {
    const porCasa = new Map<string, { x: number; y: number; lado: number }>();

    for (const item of items) {
      if (!item.personagemId) continue;
      const casa = casaDoItem(item, grid);
      porCasa.set(`${casa.x}:${casa.y}`, casa);
    }

    return [...porCasa];
  }, [items, grid]);

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

      {/*
        Depois do padrão, por cima dele: a casa acende, não apaga.

        Meia linha de deslocamento, e a caixa do tamanho do passo: a linha do
        padrão nasce DENTRO do quadrado (um retângulo de 1,5 a partir do canto)
        e a borda do realce fica centrada no caminho. Sem o meio traço de folga
        as duas ficariam lado a lado em vez de sobrepostas, e a 500% a casa
        apareceria com linha dupla.
      */}
      {casas.map(([chave, casa]) => (
        <rect
          key={chave}
          x={casa.x + LINHA / 2}
          y={casa.y + LINHA / 2}
          width={casa.lado}
          height={casa.lado}
          fill={fundoDaCasa}
          stroke={bordaDaCasa}
          strokeWidth={LINHA}
        />
      ))}
    </svg>
  );
}
