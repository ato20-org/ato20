"use client";

import {
  alturaDoNome,
  CORPO_DO_NOME,
  larguraDoNome,
  pecaNoRecorte,
} from "@/lib/geometry/portrait";
import type { LugarDaPeca } from "@/types/scene";

/**
 * O nome do personagem, como legenda do retrato.
 *
 * No automático, embaixo, dentro da caixa, centrado. Com lugar escolhido, onde
 * o mestre o pôs. Ver `LayoutDoRetrato.nome`.
 *
 * Tudo sai de `largura`, na unidade de quem chama -- cena no palco do Mestre,
 * pixel de tela no overlay da mesa. Um tamanho cravado sumiria num e cobriria o
 * rosto no outro.
 *
 * ## Preso ao recorte, nos dois eixos
 *
 * Filho que transborda a caixa de um plano infla a camada composta, e o
 * WebKitGTK então pinta o mapa deslocado e depois preto. Ver `pecaNoRecorte`,
 * que é uma trava de um eixo só e serve aos dois: aqui o vertical passa a
 * altura no lugar da largura, e as folgas de cima e de baixo no lugar das de
 * esquerda e direita.
 */
export function NomeDoRetrato({
  nome,
  largura,
  altura,
  lugar,
  escala,
  folgaDireita,
  folgaEsquerda,
  folgaAcima,
  folgaAbaixo,
}: {
  nome: string;
  /** A largura da caixa do retrato. */
  largura: number;
  /** A altura da caixa do retrato, na mesma unidade. */
  altura: number;
  /** Ausente é o automático. Ver `LayoutDoRetrato.lugarDoNome`. */
  lugar?: LugarDaPeca;
  escala?: number;
  folgaDireita: number;
  folgaEsquerda: number;
  folgaAcima: number;
  folgaAbaixo: number;
}) {
  const peca = larguraDoNome(largura, escala);
  const alto = alturaDoNome(largura, escala);

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: pecaNoRecorte({
          desejado: lugar ? lugar.x * largura : (largura - peca) / 2,
          coluna: peca,
          largura,
          folgaDireita,
          folgaEsquerda,
        }),
        top: pecaNoRecorte({
          desejado: lugar ? lugar.y * altura : altura - alto,
          coluna: alto,
          largura: altura,
          folgaDireita: folgaAbaixo,
          folgaEsquerda: folgaAcima,
        }),
        width: peca,
      }}
    >
      <TextoDoNome nome={nome} largura={peca} />
    </div>
  );
}

/**
 * A legenda desenhada, sem saber onde está.
 *
 * Separada de `NomeDoRetrato` para a prévia do painel usar o mesmo desenho:
 * lá quem posiciona é a moldura arrastável, e aqui é o recorte. Com dois
 * desenhos, o mestre ajustaria o nome num lugar que não se parece com o que a
 * mesa vê -- a razão de `DesenhoDoMedidor`.
 *
 * Contorno escuro no texto, e não uma faixa por trás: retrato é imagem, com
 * claro e escuro, e a sombra acerta os dois sem apagar o queixo de ninguém.
 * A altura é `alturaDoNome`: a linha e a folga de baixo somam 1,6 corpo.
 */
export function TextoDoNome({
  nome,
  largura,
}: {
  nome: string;
  /** A largura da legenda, já com a escala. */
  largura: number;
}) {
  const corpo = largura * CORPO_DO_NOME;

  return (
    <span
      className="block truncate text-center font-semibold text-white"
      style={{
        fontSize: corpo,
        lineHeight: 1.25,
        paddingInline: corpo * 0.4,
        paddingBottom: corpo * 0.35,
        textShadow: `0 ${corpo * 0.06}px ${corpo * 0.3}px rgba(0,0,0,0.95), 0 0 ${corpo * 0.12}px rgba(0,0,0,0.8)`,
      }}
    >
      {nome}
    </span>
  );
}
