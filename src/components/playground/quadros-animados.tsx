"use client";

import type { CSSProperties } from "react";

/**
 * Uma folha de quadros tocada em ordem, dentro do recorte de quem a monta: o
 * fogo do externo, a revoada de fagulhas, o chão da área.
 *
 * UM elemento, com a folha de fundo: as colunas andam no
 * `background-position-x` e as linhas no `-y`, duas animações em degraus
 * (`steps`) na mesma caixa. Em porcentagem, P% alinha P% da folha com P% da
 * caixa: o quadro k pede k/(n-1), e `steps(n)` de 0 a n/(n-1) entrega
 * exatamente isso.
 *
 * Antes eram dois elementos andando por `transform` -- as linhas num
 * invólucro, as colunas na imagem --, duas camadas no compositor por folha, e
 * a figura em chamas monta três folhas (o fogo de trás, o da frente, as
 * fagulhas). Medido na TV com quarenta figuras: 28,1 fps o fogo sem a luz e
 * 32,3 o veneno, contra 48,7 e 50,3 com um elemento só. É a mesma saída da
 * chama de pé do 2.5D (`faixaDaFolha`), sem reassar a folha numa faixa.
 *
 * As propriedades da animação vão uma a uma, e nunca o atalho `animation`: o
 * atalho no `style` zeraria o `animation-play-state` que o Mestre usa para
 * pausar o efeito de quem não está selecionado (`data-efeito-parado`).
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
  const eixos = [
    colunas > 1 ? { nome: "efeito-grade-x", duracao: colunas / fps, degraus: colunas } : null,
    linhas > 1 ? { nome: "efeito-grade-y", duracao: (colunas * linhas) / fps, degraus: linhas } : null,
  ].filter((eixo) => eixo !== null);

  return (
    <div
      className="efeito-grade absolute inset-0"
      style={
        {
          backgroundImage: `url(${fonte})`,
          backgroundSize: `${colunas * 100}% ${linhas * 100}%`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "0% 0%",
          ...(eixos.length > 0
            ? {
                animationName: eixos.map((eixo) => eixo.nome).join(", "),
                animationDuration: eixos.map((eixo) => `${eixo.duracao}s`).join(", "),
                animationTimingFunction: eixos.map((eixo) => `steps(${eixo.degraus})`).join(", "),
                animationIterationCount: "infinite",
                animationDelay: fase,
              }
            : {}),
          "--grade-fim-x": colunas > 1 ? `${(colunas / (colunas - 1)) * 100}%` : "0%",
          "--grade-fim-y": linhas > 1 ? `${(linhas / (linhas - 1)) * 100}%` : "0%",
        } as CSSProperties
      }
    />
  );
}
