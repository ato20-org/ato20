"use client";

import type { SVGProps } from "react";

import type { TipoDePing } from "@/types/ping";

type Traco =
  | { forma: "path"; d: string }
  | { forma: "circle"; cx: number; cy: number; r: number };

/**
 * Os traços de cada ícone, num quadro de 24 por 24.
 *
 * São os ícones do lucide -- `eye`, `triangle-alert`, `skull`, `swords`,
 * `footprints` e `circle-question-mark`, da versão 1.39.0, licença ISC --, e
 * não os componentes dele, por causa do `zoom` do palco.
 *
 * O componente do lucide desenha um `<svg>` próprio, e dentro do SVG do ping
 * isso é um `<svg>` ANINHADO. Com o plano do conteúdo em `zoom` -- o Mestre de
 * câmera parada --, o WebKitGTK multiplica o traço do `<svg>` aninhado pelo
 * `zoom`, e a escala do grupo não o traz de volta: a 16x o olho virava um borrão.
 * Fotografado na webview, com os círculos do mesmo ping intactos ao lado -- o
 * defeito é só do aninhado. Os traços soltos aqui dentro são desenhados como os
 * círculos, no sistema do SVG de fora, e saem certos nas duas formas de ampliar.
 *
 * A roda usa os mesmos traços, para o ícone do mapa e o da roda não divergirem
 * quando o lucide redesenhar um deles.
 */
const TRACOS: Record<TipoDePing, Traco[]> = {
  olhe: [
    {
      forma: "path",
      d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
    },
    { forma: "circle", cx: 12, cy: 12, r: 3 },
  ],
  alerta: [
    {
      forma: "path",
      d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
    },
    { forma: "path", d: "M12 9v4" },
    { forma: "path", d: "M12 17h.01" },
  ],
  perigo: [
    { forma: "path", d: "m12.5 17-.5-1-.5 1h1z" },
    {
      forma: "path",
      d: "M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z",
    },
    { forma: "circle", cx: 15, cy: 12, r: 1 },
    { forma: "circle", cx: 9, cy: 12, r: 1 },
  ],
  atacar: [
    { forma: "path", d: "m13 19 6-6" },
    {
      forma: "path",
      d: "M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5",
    },
    {
      forma: "path",
      d: "m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586",
    },
    { forma: "path", d: "m16 16 4 4" },
    { forma: "path", d: "m19 21 2-2" },
    { forma: "path", d: "m5 14 4 4" },
    { forma: "path", d: "m5 21-2-2" },
    { forma: "path", d: "M7.5 16.5 4 20" },
  ],
  ir: [
    {
      forma: "path",
      d: "M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z",
    },
    {
      forma: "path",
      d: "M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z",
    },
    { forma: "path", d: "M16 17h4" },
    { forma: "path", d: "M4 13h4" },
  ],
  duvida: [
    { forma: "circle", cx: 12, cy: 12, r: 10 },
    { forma: "path", d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" },
    { forma: "path", d: "M12 17h.01" },
  ],
};

/**
 * Os traços soltos, para desenhar DENTRO de um SVG -- o do ping no mapa. O
 * quadro é de 24 unidades: quem chama posiciona e escala pelo `transform`.
 */
export function TracosDoPing({
  tipo,
  ...props
}: { tipo: TipoDePing } & SVGProps<SVGGElement>) {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {TRACOS[tipo].map((traco, indice) =>
        traco.forma === "path" ? (
          <path key={indice} d={traco.d} />
        ) : (
          <circle key={indice} cx={traco.cx} cy={traco.cy} r={traco.r} />
        ),
      )}
    </g>
  );
}

/**
 * O ícone num `<svg>` próprio, para o HTML -- a roda, que mora fora do palco e
 * não passa por `zoom` nenhum. A cor é a do texto em volta.
 */
export function IconeDoPing({
  tipo,
  className,
  strokeWidth = 2,
}: {
  tipo: TipoDePing;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <TracosDoPing tipo={tipo} strokeWidth={strokeWidth} />
    </svg>
  );
}
