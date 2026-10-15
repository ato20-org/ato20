"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import {
  ATRASO_DA_MESA_MS,
  contornoDoRastro,
  COR_DO_LASER,
  HALO_DO_LASER_PX,
  LARGURA_DO_LASER_PX,
  laserDaMesa,
  PASSO_DA_CURVA_PX,
  proximoDeslocamento,
  rastroApagado,
  rastroMacio,
  rastroNoInstante,
  SEM_RASTRO,
  type RastroDoLaser,
} from "@/lib/laser";
import type { LaserNaMesa } from "@/types/laser";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";

/**
 * Acima do ping (5500) e abaixo do retrato (`PORTRAIT_Z`, 6000).
 *
 * Por cima da névoa pelo mesmo motivo do ping: apontar para o escuro é o
 * caso. Por cima do ping porque o laser é o gesto de agora, e o ping pode
 * estar ali há quatro segundos.
 */
const LASER_Z = 5_600;

/** A opacidade do brilho em volta do miolo. */
const OPACIDADE_DO_HALO = 0.35;

type DesenhoDoLaser = {
  /** As duas pontas do SVG. De callback, para quem monta não ler ref nenhum. */
  pintarHalo: (caminho: SVGPathElement | null) => void;
  pintarMiolo: (caminho: SVGPathElement | null) => void;
  /** O rastro que conta a partir de agora. Acorda o laço, se ele dormia. */
  acender: (rastro: RastroDoLaser) => void;
  /** O rastro que o laço está desenhando. */
  rastro: RefObject<RastroDoLaser>;
};

/**
 * O laço que desenha o rastro: um `requestAnimationFrame` que escreve o `d`
 * dos dois caminhos direto no DOM.
 *
 * Fora do React de propósito. O rastro muda a cada quadro de tela -- a cauda
 * encolhe mesmo com o mouse parado --, e um render por quadro seria o palco
 * inteiro sessenta vezes por segundo para mexer dois atributos. É o mesmo
 * caminho da prévia do lápis.
 *
 * O laço DORME quando o rastro apaga: parado, o laser não custa nada.
 *
 * `atraso` é quanto desenhar atrás do relógio. O Mestre desenha o próprio
 * rastro na hora; a mesa, atrás. Ver `ATRASO_DA_MESA_MS`.
 */
export function useDesenhoDoLaser(atraso: number): DesenhoDoLaser {
  const { scale } = useSceneScale();

  const halo = useRef<SVGPathElement | null>(null);
  const miolo = useRef<SVGPathElement | null>(null);
  const rastro = useRef<RastroDoLaser>(SEM_RASTRO);
  const escala = useRef(scale);
  const quadro = useRef<number | null>(null);

  // A escala muda com o zoom no meio do rastro, e a largura é em pixel de
  // tela: o laço lê a de agora, e não a do quadro em que acordou.
  useEffect(() => {
    escala.current = scale;
  }, [scale]);

  const acender = useCallback(
    (novo: RastroDoLaser) => {
      rastro.current = novo;
      if (quadro.current !== null) return;

      const passo = () => {
        const agora = Date.now() - atraso;
        const escalaAgora = escala.current || 1;
        const riscos = rastroNoInstante(rastro.current, agora).map((risco) =>
          rastroMacio(risco, PASSO_DA_CURVA_PX / escalaAgora),
        );

        halo.current?.setAttribute(
          "d",
          riscos
            .map((risco) => contornoDoRastro(risco, HALO_DO_LASER_PX / escalaAgora))
            .join(""),
        );
        miolo.current?.setAttribute(
          "d",
          riscos
            .map((risco) => contornoDoRastro(risco, LARGURA_DO_LASER_PX / escalaAgora))
            .join(""),
        );

        quadro.current = rastroApagado(rastro.current, agora)
          ? null
          : requestAnimationFrame(passo);
      };

      quadro.current = requestAnimationFrame(passo);
    },
    [atraso],
  );

  useEffect(
    () => () => {
      if (quadro.current !== null) cancelAnimationFrame(quadro.current);
      quadro.current = null;
    },
    [],
  );

  const pintarHalo = useCallback((caminho: SVGPathElement | null) => {
    halo.current = caminho;
  }, []);
  const pintarMiolo = useCallback((caminho: SVGPathElement | null) => {
    miolo.current = caminho;
  }, []);

  return { pintarHalo, pintarMiolo, acender, rastro };
}

/**
 * O SVG do rastro: o brilho e o miolo, cheios, sem nada dentro até o laço
 * escrever.
 *
 * Do tamanho do plano e `overflow-visible`, como o `PingLayer`: o rastro que
 * passa da borda do mapa pinta fora dele sem inflar a camada do plano. Ver a
 * regra de transbordo do palco.
 */
export function SvgDoLaser({
  desenho: { pintarHalo, pintarMiolo },
}: {
  desenho: DesenhoDoLaser;
}) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ zIndex: LASER_Z }}
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
    >
      <path ref={pintarHalo} fill={COR_DO_LASER} opacity={OPACIDADE_DO_HALO} />
      <path ref={pintarMiolo} fill={COR_DO_LASER} />
    </svg>
  );
}

/**
 * O laser do mestre na TV, no celular e na janela Mesa.
 *
 * O quadro chega a 10 Hz com o rastro inteiro; aqui ele vira hora local e
 * entra no laço, que desenha atrasado o bastante para a ponta andar suave
 * entre uma amostra e a próxima.
 *
 * O mesmo rastro chega de novo em todo quadro que o Mestre montar por outro
 * motivo -- um ping, um retrato. O `agora` dele diz que é o mesmo, e ele não
 * reacende.
 */
export function LaserLayer({ laser }: { laser: LaserNaMesa | null }) {
  const desenho = useDesenhoDoLaser(ATRASO_DA_MESA_MS);
  const { acender, rastro } = desenho;

  const deslocamento = useRef<number | null>(null);
  const ultimo = useRef<number | null>(null);

  useEffect(() => {
    if (!laser) {
      // O laser saiu do quadro. O que está aceso termina de apagar sozinho;
      // só a ponta segurada solta, para um Mestre que fechou no meio do
      // gesto não deixar um ponto vermelho para sempre na TV.
      if (rastro.current.aceso) acender({ ...rastro.current, aceso: false });
      return;
    }

    if (laser.agora === ultimo.current) return;
    ultimo.current = laser.agora;

    deslocamento.current = proximoDeslocamento(
      deslocamento.current,
      Date.now() - laser.agora,
    );
    acender(laserDaMesa(laser, deslocamento.current));
  }, [laser, acender, rastro]);

  return <SvgDoLaser desenho={desenho} />;
}
