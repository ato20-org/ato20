"use client";

import { SelosDaCondicao } from "@/components/playground/selos-da-condicao";
import {
  larguraDosSelos,
  pecaNoRecorte,
  tamanhoDoSelo,
} from "@/lib/geometry/portrait";
import type { Condicao } from "@/types/character";
import type { LugarDaPeca } from "@/types/scene";

/**
 * A fileira de selos das condições, como peça do retrato.
 *
 * No automático, no alto da FIGURA, dentro da caixa e centrada: a fileira é
 * baixa, e sobre a cabeça ela não disputa a fila com o vizinho. Com lugar
 * escolhido, onde o mestre a pôs. Ver `LayoutDoRetrato.condicoes`.
 *
 * Tudo sai de `largura` e `altura`, na unidade de quem chama -- cena no palco
 * do Mestre, pixel de tela no overlay da mesa --, como o nome e os dados.
 *
 * ## Preso ao recorte, nos dois eixos
 *
 * Pela razão do `NomeDoRetrato`: filho que transborda a caixa de um plano
 * infla a camada composta, e o WebKitGTK então pinta o mapa deslocado e depois
 * preto. `pecaNoRecorte` é uma trava de um eixo só e serve aos dois.
 */
export function SelosDoRetrato({
  condicoes,
  largura,
  altura,
  topoDaFigura,
  lugar,
  escala,
  folgaDireita,
  folgaEsquerda,
  folgaAcima,
  folgaAbaixo,
}: {
  condicoes: ReadonlyArray<Condicao>;
  /** A largura da caixa do retrato. */
  largura: number;
  /** A altura da caixa do retrato, na mesma unidade. */
  altura: number;
  /**
   * Onde o rosto começa dentro da caixa, na mesma unidade.
   *
   * O automático encosta no alto da FIGURA, e não da caixa: o arquivo raramente
   * tem a proporção da caixa, e no alto dela a fileira flutuaria sobre um vão
   * transparente, longe da cabeça que ela descreve.
   */
  topoDaFigura: number;
  /** Ausente é o automático. Ver `LayoutDoRetrato.lugarDasCondicoes`. */
  lugar?: LugarDaPeca;
  escala?: number;
  folgaDireita: number;
  folgaEsquerda: number;
  folgaAcima: number;
  folgaAbaixo: number;
}) {
  if (condicoes.length === 0) return null;

  const tamanho = tamanhoDoSelo(altura, escala);
  const peca = larguraDosSelos(condicoes.length, altura, escala);

  return (
    <SelosDaCondicao
      condicoes={condicoes}
      tamanho={tamanho}
      // Numa linha só, e na largura que a fila reservou: ver `larguraDosSelos`.
      className="pointer-events-none absolute flex-nowrap"
      style={{
        left: pecaNoRecorte({
          desejado: lugar ? lugar.x * largura : (largura - peca) / 2,
          coluna: peca,
          largura,
          folgaDireita,
          folgaEsquerda,
        }),
        top: pecaNoRecorte({
          desejado: lugar ? lugar.y * altura : topoDaFigura + tamanho * 0.3,
          coluna: tamanho,
          largura: altura,
          folgaDireita: folgaAbaixo,
          folgaEsquerda: folgaAcima,
        }),
        width: peca,
      }}
    />
  );
}
