"use client";

import type { CSSProperties } from "react";

import type { LuzDeclarada } from "@/lib/extensoes/manifesto";

/**
 * A LUZ de uma aura de plugin, por cima da caixa que a recebe: as bordas da
 * janela aberta numa pasta do bestiário, ou a borda do card sob a mão. A caixa
 * precisa ser `relative`; a luz não pega clique. Ver `extensoes::Aura`.
 *
 * Os efeitos são do núcleo, e cada um é camada pintada uma vez com opacidade
 * ou posição animada -- ver `.luz-camada` no `globals.css`:
 *
 * - `fixa`: o brilho parado.
 * - `pulso`: o brilho que respira devagar.
 * - `fluxo`: o brilho latejando, com a luz correndo pelas quatro bordas.
 * - `cintilar`: um brilho por cor, cada um piscando no seu ritmo.
 *
 * Com várias cores, a `fixa` e o `pulso` sobrepõem uma camada por cor, e o
 * `fluxo` alterna as cores entre as bordas.
 */
export function LuzDaAura({ luz, alcance = 32 }: { luz: LuzDeclarada; alcance?: number }) {
  const cores = luz.cores.length > 0 ? luz.cores : ["#ffffff"];
  const estilo = (cor: string, extra?: Record<string, string>) =>
    ({ "--luz-cor": cor, "--luz-alcance": `${alcance}px`, ...extra }) as CSSProperties;

  switch (luz.efeito) {
    case "fluxo":
      return (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <span className="luz-camada luz-latejo" style={estilo(cores[0])} />
          {BORDAS.map(({ borda, duracao, atraso }, indice) => (
            <span key={borda} className="luz-faixa" data-borda={borda} style={estilo(cores[indice % cores.length])}>
              <span className="luz-cometa" style={estilo(cores[indice % cores.length], { "--luz-duracao": duracao, "--luz-atraso": atraso })} />
              <span
                className="luz-cometa"
                style={estilo(cores[(indice + 1) % cores.length], {
                  "--luz-duracao": `calc(${duracao} * 1.6)`,
                  "--luz-atraso": `calc(${atraso} + 0.5s)`,
                })}
              />
            </span>
          ))}
        </span>
      );
    case "cintilar":
      return (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          {/* A base, para a janela não apagar de todo entre as piscadas. */}
          <span className="luz-camada opacity-30" style={estilo(cores[0])} />
          {cores.map((cor, indice) => (
            <span
              key={`${cor}-${indice}`}
              className="luz-camada luz-cintilar"
              style={estilo(cor, RITMOS_DO_CINTILAR[indice % RITMOS_DO_CINTILAR.length])}
            />
          ))}
        </span>
      );
    default:
      return (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          {cores.map((cor, indice) => (
            <span
              key={`${cor}-${indice}`}
              className={luz.efeito === "pulso" ? "luz-camada luz-pulso" : "luz-camada"}
              style={estilo(cor)}
            />
          ))}
        </span>
      );
  }
}

/**
 * As quatro bordas do `fluxo`, no sentido do relógio, cada uma num ritmo: a
 * luz que corre igual nas quatro parece um letreiro, e não um fluxo.
 */
const BORDAS = [
  { borda: "cima", duracao: "1.3s", atraso: "0s" },
  { borda: "direita", duracao: "1.1s", atraso: "0.35s" },
  { borda: "baixo", duracao: "1.5s", atraso: "0.15s" },
  { borda: "esquerda", duracao: "1.2s", atraso: "0.6s" },
] as const;

/** Durações primas entre si: as cores do `cintilar` quase nunca piscam juntas. */
const RITMOS_DO_CINTILAR: Array<Record<string, string>> = [
  { "--luz-duracao": "2.3s", "--luz-atraso": "0s" },
  { "--luz-duracao": "3.1s", "--luz-atraso": "0.4s" },
  { "--luz-duracao": "1.7s", "--luz-atraso": "0.9s" },
  { "--luz-duracao": "2.9s", "--luz-atraso": "0.2s" },
];
