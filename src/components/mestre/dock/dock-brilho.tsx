"use client";

import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

import {
  useDockDragStore,
  type Beirada,
  type Saida,
} from "@/lib/store/use-dock-drag-store";

/** Quanto o brilho entra na tela, a partir da beirada. */
const PROFUNDIDADE = 64;

/** O comprimento da mancha mais acesa, ao longo da beirada. */
const COMPRIMENTO = 360;

/**
 * A faixa de cada beirada e a mancha dentro dela.
 *
 * A mancha tem o dobro da profundidade e fica centrada NA linha da beirada: só
 * a metade de dentro aparece, e o meio da elipse — o ponto mais aceso — cai
 * exatamente na borda por onde a janela saiu.
 */
const FORMA: Record<
  Beirada,
  { faixa: CSSProperties; mancha: CSSProperties; rumo: string }
> = {
  esquerda: {
    faixa: { top: 0, bottom: 0, left: 0, width: PROFUNDIDADE },
    mancha: { top: 0, left: -PROFUNDIDADE, width: PROFUNDIDADE * 2, height: COMPRIMENTO },
    rumo: "to right",
  },
  direita: {
    faixa: { top: 0, bottom: 0, right: 0, width: PROFUNDIDADE },
    mancha: { top: 0, right: -PROFUNDIDADE, width: PROFUNDIDADE * 2, height: COMPRIMENTO },
    rumo: "to left",
  },
  topo: {
    faixa: { left: 0, right: 0, top: 0, height: PROFUNDIDADE },
    mancha: { left: 0, top: -PROFUNDIDADE, height: PROFUNDIDADE * 2, width: COMPRIMENTO },
    rumo: "to bottom",
  },
  base: {
    faixa: { left: 0, right: 0, bottom: 0, height: PROFUNDIDADE },
    mancha: { left: 0, bottom: -PROFUNDIDADE, height: PROFUNDIDADE * 2, width: COMPRIMENTO },
    rumo: "to top",
  },
};

/** A cor do tema, apagada. O Mestre é sempre escuro: `primary` é quase branco. */
function tom(porcento: number): string {
  return `color-mix(in oklab, var(--primary) ${porcento}%, transparent)`;
}

/**
 * Onde a mancha fica, para o ponto da beirada sob a mão.
 *
 * Por `transform`, e não por `top`/`left`, porque o arrasto escreve isto a cada
 * quadro: com a mancha na própria camada, mover é trabalho do compositor, sem
 * repintar a faixa.
 */
export function deslocamentoDoBrilho({ beirada, posicao }: Saida): string {
  const inicio = posicao - COMPRIMENTO / 2;

  return beirada === "esquerda" || beirada === "direita"
    ? `translateY(${inicio}px)`
    : `translateX(${inicio}px)`;
}

/**
 * O brilho na beirada por onde uma janela está sendo arrastada para fora.
 *
 * A etiqueta embaixo diz o que soltar ali faz; o brilho diz ONDE a janela vai
 * sair — a beirada inteira acende de leve e o ponto por onde a mão passou
 * acende mais, seguindo o cursor ao longo dela.
 *
 * Num portal no `body`, e não na camada das janelas: a camada é a linha do
 * meio, e a borda de cima e a de baixo da janela do ATO20 não são as dela.
 *
 * A posição da mancha vem do store uma vez, quando a beirada muda, e depois é
 * escrita direto no DOM pelo arrasto — ver `data-dock-brilho` em `dock-drag`.
 */
export function DockBrilho() {
  const fora = useDockDragStore((state) => state.fora);

  if (!fora) return null;

  const forma = FORMA[fora.beirada];

  return createPortal(
    <div
      aria-hidden
      // Por beirada: trocar de lado no canto acende a outra de novo, em vez de
      // a faixa pular de uma borda para a outra já acesa.
      key={fora.beirada}
      className="animate-in fade-in-0 pointer-events-none fixed z-[200] overflow-hidden duration-200 motion-reduce:animate-none"
      style={{
        ...forma.faixa,
        backgroundImage: `linear-gradient(${forma.rumo}, ${tom(9)}, transparent 75%)`,
      }}
    >
      <div
        data-dock-brilho
        className="absolute will-change-transform"
        style={{
          ...forma.mancha,
          transform: deslocamentoDoBrilho(fora),
          backgroundImage: `radial-gradient(closest-side, ${tom(22)}, ${tom(6)} 55%, transparent)`,
        }}
      />
    </div>,
    document.body,
  );
}
