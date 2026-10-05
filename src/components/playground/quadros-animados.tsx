"use client";

import { cn } from "@/lib/utils";

/**
 * Uma folha de quadros tocada em ordem, dentro do recorte de quem a monta: o
 * fogo do externo, a revoada de fagulhas.
 *
 * As linhas descem num invólucro, as colunas andam na imagem: cada um carrega
 * UMA animação, pela razão dos invólucros da figura. Os dois em degraus
 * (`steps`), e por `transform` -- o compositor troca o quadro sem repintar
 * nada. Quem monta põe o `overflow: hidden` no recorte do tamanho de um
 * quadro; a folha inteira mora dentro dele e anda.
 */
export function QuadrosAnimados({
  fonte,
  colunas,
  linhas,
  fps,
  fase,
}: {
  fonte: string;
  colunas: number;
  linhas: number;
  fps: number;
  /** O `animation-delay` dos dois eixos, o mesmo, para eles não se perderem. */
  fase?: string;
}) {
  return (
    <div
      className={cn("absolute top-0 left-0 w-full", linhas > 1 && "efeito-linhas")}
      style={{
        height: `${linhas * 100}%`,
        ...(linhas > 1
          ? {
              animationDuration: `${(colunas * linhas) / fps}s`,
              animationTimingFunction: `steps(${linhas})`,
              animationDelay: fase,
            }
          : {}),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={fonte}
        alt=""
        draggable={false}
        className="efeito-colunas absolute top-0 left-0 h-full max-w-none"
        style={{
          width: `${colunas * 100}%`,
          animationDuration: `${colunas / fps}s`,
          animationTimingFunction: `steps(${colunas})`,
          animationDelay: fase,
        }}
      />
    </div>
  );
}
