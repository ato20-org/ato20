"use client";

import { memo } from "react";

import { TracosDoPing } from "@/components/playground/icone-do-ping";
import { useSceneScale } from "@/components/playground/scene-stage";
import { APARENCIA_DO_PING } from "@/lib/ping";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";
import type { Ping } from "@/types/ping";

/** O raio do disco do ícone, em pixel de tela. */
const DISCO_PX = 15;

/**
 * Acima da névoa (`FOG_Z`, 5000) e abaixo do retrato (`PORTRAIT_Z`, 6000).
 *
 * O palco empilha por `zIndex`, e não pela ordem no DOM: cada token leva o `z`
 * dele, e a névoa e o retrato têm faixas fixas. Sem número próprio o ping
 * ficava no `auto` -- embaixo da névoa que ele aponta, e embaixo do token que
 * ele marca para atacar.
 */
const PING_Z = 5_500;

/**
 * Os pings sobre o mapa: um disco com o ícone, as ondas que puxam o olho, e o
 * nome de quem apontou embaixo.
 *
 * Um SVG do tamanho do plano, como o `ReguaLayer`, e pelo mesmo motivo: o ping
 * perto da borda pinta para fora do mapa, e um `<div>` ali transbordaria o
 * plano e inflaria a camada composta -- a armadilha número um do palco. O SVG
 * tem a caixa do plano e pinta fora dela sem inflar nada.
 *
 * Em pixel de TELA, como o medidor: o ping é sinal, não conteúdo do mapa, e
 * tem de ter o mesmo tamanho na TV afastada e no mestre ampliado a 400%. O
 * grupo de cada ping desfaz a escala de uma vez (`scale(1 / scale)`), e tudo
 * dentro dele é escrito em pixel.
 *
 * Por cima da névoa: apontar para o escuro é justamente o caso -- "tem um
 * barulho vindo dali". O ping não conta nada que o ponto não conte, e quem
 * escolheu o ponto foi quem apontou.
 */
export function PingLayer({ pings }: { pings: Ping[] }) {
  const { scale } = useSceneScale();

  if (pings.length === 0 || scale === 0) return null;

  return (
    <svg
      aria-hidden
      // `overflow-visible` pelo mesmo motivo do `ReguaLayer`: o ping na borda
      // não pode ser cortado em `x = 0`.
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ zIndex: PING_Z }}
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
    >
      {pings.map((ping) => (
        <PingView key={ping.id} ping={ping} escala={1 / scale} />
      ))}
    </svg>
  );
}

/**
 * Um ping. `memo` porque o quadro chega dez vezes por segundo e traz a lista
 * inteira de novo: sem ele, cada amostra redesenharia todos os pings no ar por
 * nada. A animação não reinicia de todo jeito -- a chave é o id --, mas o
 * trabalho de montar o SVG fica de fora.
 */
const PingView = memo(function PingView({
  ping,
  escala,
}: {
  ping: Ping;
  escala: number;
}) {
  const { cor } = APARENCIA_DO_PING[ping.tipo];

  return (
    <g transform={`translate(${ping.x} ${ping.y}) scale(${escala})`}>
      {/* As animações escalam em volta da ORIGEM do grupo, que é o ponto
          marcado: o `translate` acima já a pôs ali. */}
      <g className="ping-no-mapa" style={{ transformOrigin: "0 0" }}>
        {[0, 0.35, 0.7].map((atraso) => (
          <circle
            key={atraso}
            className="ping-onda"
            r={DISCO_PX}
            fill="none"
            stroke={cor}
            strokeWidth={2.5}
            style={{ transformOrigin: "0 0", animationDelay: `${atraso}s` }}
          />
        ))}

        {/* Halo escuro por baixo do disco: o ping aparece sobre mapa claro e
            sobre mapa escuro sem depender de filtro, que o WebKitGTK pinta
            caro dentro de camada composta. */}
        <circle r={DISCO_PX + 4} fill="rgb(0 0 0 / 0.45)" />
        <circle r={DISCO_PX} fill={cor} stroke="#fff" strokeWidth={2} />

        {/* Traços soltos, e não um `<svg>` de ícone aninhado: aninhado, o
            WebKitGTK engrossa o traço com o palco em `zoom`. Ver `TRACOS`. O
            quadro de 24 vira 18 pixels, centrado no ponto. */}
        <TracosDoPing
          tipo={ping.tipo}
          transform="translate(-9 -9) scale(0.75)"
          stroke="#0a0a0a"
          strokeWidth={2.4}
        />

        <text
          y={DISCO_PX + 16}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="#fff"
          stroke="rgb(0 0 0 / 0.75)"
          strokeWidth={3}
          paintOrder="stroke"
          style={{ fontFamily: "var(--font-sans, system-ui)" }}
        >
          {ping.autor}
        </text>
      </g>
    </g>
  );
});
