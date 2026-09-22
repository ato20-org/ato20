"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import {
  normalizarPoligono,
  pontosNaCaixa,
} from "@/lib/geometry/area-escondida";
import { rotateVec, type Vec } from "@/lib/geometry/transform";
import type { FogRegion } from "@/types/scene";

/** Acima do gizmo: os vértices são o que se pega numa área recortada. */
const ALCAS_Z = 10_100;

/**
 * Do tamanho da alça do gizmo, pelo mesmo motivo: é a mesma mão, no mesmo
 * palco, e duas medidas de alça na mesma tela leem como dois controles
 * diferentes.
 */
const ALCA_PX = 10;
const TRACO_PX = 1.5;

/** Mínimo de vértices. Abaixo disto o polígono deixa de ser região. */
const MINIMO = 3;

/**
 * As alças de VÉRTICE de uma área escondida recortada.
 *
 * Vive no `planoDaMargem`, junto do gizmo e pela mesma razão: a alça fica meio
 * corpo para fora da caixa, e um filho que passa da caixa de um plano infla a
 * camada composta dele -- a armadilha 1 de `debug-do-palco` §3, a que pinta o
 * palco deslocado e preto no zoom. Na margem não há caixa a transbordar.
 *
 * O contorno em curso é desenhado AQUI, e não na área da cena: arrastar um
 * vértice emitiria uma gravação por quadro no board -- um passo de desfazer
 * por quadro e a cena inteira re-renderizada junto. O gesto vive local, a
 * prévia mostra o resultado, e o store recebe UMA vez, ao soltar.
 */
export function AlcasDaArea({
  region,
  onChange,
}: {
  region: FogRegion;
  /** Chamado UMA vez, ao fim do gesto. */
  onChange: (
    patch: Pick<FogRegion, "x" | "y" | "width" | "height" | "pontos">,
  ) => void;
}) {
  const { scale, planoDaMargem } = useSceneScale();
  const startDrag = useSceneDrag();

  /** Os vértices locais enquanto a mão está neles. `null` fora do gesto. */
  const [rascunho, setRascunho] = useState<Vec[] | null>(null);
  /**
   * O mesmo rascunho, para o fim do gesto ler.
   *
   * Uma ref ao lado do estado porque gravar no `onEnd` precisa do valor mais
   * recente, e lê-lo de dentro de um atualizador de estado faria a gravação
   * acontecer DUAS vezes no StrictMode -- o React chama o atualizador em
   * dobro de propósito, e ele tem de ser puro.
   */
  const rascunhoRef = useRef<Vec[] | null>(null);

  const gravados = pontosNaCaixa(region, region.pontos ?? []);
  const locais = rascunho ?? gravados;
  if (locais.length < MINIMO) return null;

  const px = (valor: number) => valor / scale;

  /**
   * Arrasta um vértice. `inserir` acrescenta o ponto antes de começar, que é o
   * que transforma a alça-fantasma do meio de um lado num vértice novo -- o
   * mesmo gesto de quem puxa o meio de uma linha para dobrá-la.
   */
  function arrastarVertice(
    event: ReactPointerEvent,
    indice: number,
    inserir?: Vec,
  ) {
    const base = inserir
      ? [...locais.slice(0, indice), inserir, ...locais.slice(indice)]
      : locais;
    const origem = base[indice];

    rascunhoRef.current = base;
    setRascunho(base);

    // Puxar a fantasma do meio já é uma mudança, mesmo que a mão não ande: o
    // vértice novo nasceu no gesto. Mexer numa alça que já existia sem arrastar
    // não é, e gravar ali daria um passo de desfazer que não desfaz nada.
    let mexeu = Boolean(inserir);

    startDrag(event, {
      onMove: (delta) => {
        // O delta vem em unidades de cena, e a caixa pode estar girada: o que
        // a mão empurra para a direita anda na diagonal da caixa. Desgirar o
        // delta é o que faz a alça seguir o cursor numa área torta.
        const local = rotateVec(delta, -(region.rotation ?? 0));

        const movidos = base.map((ponto, i) =>
          i === indice
            ? { x: origem.x + local.x, y: origem.y + local.y }
            : ponto,
        );

        mexeu = true;
        rascunhoRef.current = movidos;
        setRascunho(movidos);
      },
      onEnd: () => {
        const atual = rascunhoRef.current;

        rascunhoRef.current = null;
        setRascunho(null);

        if (mexeu && atual) onChange(normalizarPoligono(region, atual));
      },
    });
  }

  /** Alt+clique tira o vértice, com piso de três: menos que isso não é região. */
  function removerVertice(event: ReactPointerEvent, indice: number) {
    if (!event.altKey || locais.length <= MINIMO) return false;

    event.preventDefault();
    event.stopPropagation();
    onChange(
      normalizarPoligono(
        region,
        locais.filter((_, i) => i !== indice),
      ),
    );

    return true;
  }

  const conteudo = (
    <div
      className="pointer-events-none absolute"
      style={{
        left: 0,
        top: 0,
        width: region.width,
        height: region.height,
        // Mesma composição do gizmo: posicionar e depois girar em torno do
        // centro da caixa, para as alças caírem sobre os vértices de verdade.
        transform: `translate(${region.x}px, ${region.y}px) rotate(${region.rotation ?? 0}deg)`,
        zIndex: ALCAS_Z,
      }}
    >
      {/* O contorno em curso. Só durante o gesto: parado, quem desenha a área
          é a camada dela, e duas linhas sobre a mesma borda engrossariam o
          traço sem dizer nada. */}
      {rascunho ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
          width={region.width}
          height={region.height}
          viewBox={`0 0 ${region.width} ${region.height}`}
        >
          <polygon
            points={locais.map((ponto) => `${ponto.x},${ponto.y}`).join(" ")}
            fill="rgb(0 0 0 / 0.5)"
            stroke="rgb(255 255 255 / 0.8)"
            strokeWidth={px(TRACO_PX)}
            strokeDasharray={`${px(TRACO_PX * 4)} ${px(TRACO_PX * 3)}`}
          />
        </svg>
      ) : null}

      {/* As fantasmas do MEIO de cada lado, que viram vértice ao serem
          puxadas. Um lado só se dobra onde há ponto, e sem elas acrescentar um
          vértice exigiria refazer a área inteira. Menores e apagadas: são
          possibilidade, não controle. */}
      {locais.map((ponto, indice) => {
        const proximo = locais[(indice + 1) % locais.length];
        const meio = {
          x: (ponto.x + proximo.x) / 2,
          y: (ponto.y + proximo.y) / 2,
        };

        return (
          <button
            key={`meio-${indice}`}
            type="button"
            aria-label={`Acrescentar vértice no lado ${indice + 1}`}
            className="bg-background/70 pointer-events-auto absolute touch-none rounded-full opacity-60 hover:opacity-100"
            style={{
              left: meio.x,
              top: meio.y,
              width: ALCA_PX * 0.7,
              height: ALCA_PX * 0.7,
              boxShadow: `inset 0 0 0 ${TRACO_PX}px rgb(255 255 255 / 0.9)`,
              // Tamanho fixo com a ampliação desfeita, como as alças do gizmo:
              // reescrever caixa a cada notch da roda é o que enchia o palco de
              // recálculo de layout no zoom.
              transform: `translate(-50%, -50%) scale(${1 / scale})`,
              willChange: "transform",
              cursor: "copy",
            }}
            onPointerDown={(event) =>
              arrastarVertice(event, indice + 1, meio)
            }
          />
        );
      })}

      {locais.map((ponto, indice) => (
        <button
          key={indice}
          type="button"
          aria-label={`Vértice ${indice + 1}. Alt+clique remove.`}
          className="bg-background pointer-events-auto absolute touch-none rounded-full"
          style={{
            left: ponto.x,
            top: ponto.y,
            width: ALCA_PX,
            height: ALCA_PX,
            boxShadow: `inset 0 0 0 ${TRACO_PX}px var(--primary)`,
            transform: `translate(-50%, -50%) scale(${1 / scale})`,
            willChange: "transform",
            cursor: "move",
          }}
          onPointerDown={(event) => {
            if (removerVertice(event, indice)) return;
            arrastarVertice(event, indice);
          }}
        />
      ))}
    </div>
  );

  return planoDaMargem ? createPortal(conteudo, planoDaMargem) : conteudo;
}
