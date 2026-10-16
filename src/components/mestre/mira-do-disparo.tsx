"use client";

import { useEffect, useRef } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import {
  corDoDisparo,
  novoDisparo,
  pontosDoDisparo,
} from "@/lib/disparo-de-efeito";
import { definicaoDoEfeito } from "@/lib/efeitos";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { useDisparosStore } from "@/lib/store/use-disparos-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import type { DefinicaoDeEfeito } from "@/types/efeito";
import type { EfeitoDisparado } from "@/types/efeito-disparado";
import { SCENE_HEIGHT, SCENE_WIDTH, type Scene } from "@/types/scene";

/** Por cima de tudo do mapa, como a seta em curso: é o gesto do mestre agora. */
const MIRA_Z = 5_900;

/**
 * A definição do efeito na mão do Disparo: a que vem junto (a do Compêndio do
 * ATO20, que ainda não é da campanha), a do catálogo em jogo, ou a do molde
 * guardado no Compêndio da campanha.
 */
export function useDefinicaoDoDisparo(): DefinicaoDeEfeito | undefined {
  const fonte = useToolStore((state) => state.efeitoDoDisparo);
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const moldes = useEfeitosDaCampanhaStore((state) => state.moldes);

  if (!fonte) return undefined;
  return (
    fonte.definicao ??
    definicaoDoEfeito(fonte.id, deFora) ??
    moldes?.find((molde) => molde.id === fonte.id)
  );
}

/** O caminho SVG do leque: da ponta, pelo arco, de volta à ponta. */
function caminhoDoCone(disparo: EfeitoDisparado): string {
  const { de, para } = disparo;
  const raio = Math.hypot(para.x - de.x, para.y - de.y);
  const rumo = Math.atan2(para.y - de.y, para.x - de.x);
  const metade = (((disparo.abertura ?? 60) / 2) * Math.PI) / 180;
  const ponta = (angulo: number) =>
    `${de.x + Math.cos(angulo) * raio} ${de.y + Math.sin(angulo) * raio}`;

  return `M ${de.x} ${de.y} L ${ponta(rumo - metade)} A ${raio} ${raio} 0 ${
    metade * 2 > Math.PI ? 1 : 0
  } 1 ${ponta(rumo + metade)} Z`;
}

/**
 * A MIRA do Disparo: com o ponto A marcado, a sombra do tiro até o cursor, na
 * forma do efeito -- a linha com o círculo do estouro, ou o leque. É o tiro
 * que sairia ali, contado pelo mesmo `novoDisparo` (preso ao plano, encaixado
 * nos personagens, travado pelo Shift): o que se vê é o que sai.
 *
 * Ouve o ponteiro no documento e escreve direto nos nós, como a seta em curso
 * (`AncorasDeSeta`): um estado por `pointermove` redesenharia o palco inteiro
 * sessenta vezes por segundo. Um SVG do tamanho do plano, que pinta fora dele
 * sem inflar nada -- ver `PingLayer`.
 */
export function MiraDoDisparo({ scene }: { scene: Scene }) {
  const { scale, toScene } = useSceneScale();
  const mira = useDisparosStore((state) => state.mira);
  const definicao = useDefinicaoDoDisparo();
  const cor = corDoDisparo(definicao);

  const linha = useRef<SVGLineElement | null>(null);
  const estouro = useRef<SVGCircleElement | null>(null);
  const leque = useRef<SVGPathElement | null>(null);

  const agora = useRef({ scene, toScene, mira, definicao });
  useEffect(() => {
    agora.current = { scene, toScene, mira, definicao };
  });

  /** Trocar de cena larga o ponto A: ele é desta. */
  useEffect(() => {
    const { mira: atual } = useDisparosStore.getState();
    if (atual && atual.cenaId !== scene.id) useDisparosStore.getState().largarMira();
  }, [scene.id]);

  useEffect(() => {
    function mover(event: PointerEvent) {
      const atual = agora.current;
      if (!atual.mira) return;

      const cursor = atual.toScene(event.clientX, event.clientY);
      const pontos = pontosDoDisparo(atual.scene.items, atual.mira.de, cursor, event.shiftKey);
      const tiro = novoDisparo({
        id: "mira",
        cenaId: atual.scene.id,
        efeito: "",
        definicao: atual.definicao,
        grid: atual.scene.grid,
        de: pontos.de,
        para: pontos.para,
        quando: 0,
      });

      for (const no of [linha.current, estouro.current, leque.current]) {
        no?.style.setProperty("opacity", "0");
      }
      if (!tiro) return;

      if (tiro.forma === "cone") {
        leque.current?.setAttribute("d", caminhoDoCone(tiro));
        leque.current?.style.setProperty("opacity", "1");
        return;
      }

      const traco = linha.current;
      if (traco) {
        traco.setAttribute("x1", String(tiro.de.x));
        traco.setAttribute("y1", String(tiro.de.y));
        traco.setAttribute("x2", String(tiro.para.x));
        traco.setAttribute("y2", String(tiro.para.y));
        traco.style.setProperty("opacity", "1");
      }
      const circulo = estouro.current;
      if (circulo && tiro.impacto > 0) {
        circulo.setAttribute("cx", String(tiro.para.x));
        circulo.setAttribute("cy", String(tiro.para.y));
        circulo.setAttribute("r", String(tiro.impacto / 2));
        circulo.style.setProperty("opacity", "1");
      }
    }

    document.addEventListener("pointermove", mover);
    return () => document.removeEventListener("pointermove", mover);
  }, []);

  if (scale === 0 || !mira || mira.cenaId !== scene.id) return null;

  const traco = 2 / scale;
  const tracejado = `${traco * 4} ${traco * 3}`;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ zIndex: MIRA_Z }}
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
    >
      {/* Nascem apagados: só o primeiro movimento sabe para onde o tiro vai. */}
      <line ref={linha} stroke={cor} strokeWidth={traco} strokeDasharray={tracejado} style={{ opacity: 0 }} />
      <circle
        ref={estouro}
        fill={cor}
        fillOpacity={0.15}
        stroke={cor}
        strokeWidth={traco}
        strokeDasharray={tracejado}
        style={{ opacity: 0 }}
      />
      <path
        ref={leque}
        fill={cor}
        fillOpacity={0.15}
        stroke={cor}
        strokeWidth={traco}
        strokeDasharray={tracejado}
        strokeLinejoin="round"
        style={{ opacity: 0 }}
      />
      {/* O ponto A, marcado. */}
      <circle cx={mira.de.x} cy={mira.de.y} r={5 / scale} fill={cor} stroke="#fff" strokeWidth={traco / 2} />
    </svg>
  );
}
