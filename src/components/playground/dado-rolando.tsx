"use client";

import { memo } from "react";

import { DadoFacetas } from "@/components/mestre/dado-facetas";
import { desenharDado, quadroDaQueda } from "@/lib/geometry/dado";
import { tipoDado, type FacesDado } from "@/types/dado";

/**
 * Quanto a caixa do desenho é maior que a do dado parado.
 *
 * O dado CRESCE enquanto está no ar: altura vira tamanho, porque a mesa é vista
 * de cima — ver `alturaNaTela` —, e da altura da mão ele sai 26% maior do que
 * pousa. Uma caixa do tamanho do dado assentado cortaria a ponta dele
 * justamente no quadro em que ele está mais alto.
 *
 * A caixa maior é desenhada para FORA, centrada: o dado pousado ocupa o mesmo
 * lugar que o `DadoParado` ocuparia, e a folga não empurra nada no layout.
 */
const FOLGA = 1.45;

/**
 * A semente da tombada, tirada do id da rolagem.
 *
 * Do id e não do relógio: ela decide o EIXO em que o dado gira, e o eixo tem de
 * ser o mesmo em todos os renders e em todas as telas. Semeado pelo relógio
 * local, o mesmo dado giraria num eixo na TV e noutro no celular — e mudaria de
 * eixo no meio da queda a cada render.
 */
function sementeDoId(id: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/**
 * Um dado caindo no lugar, mostrando a face que saiu só quando assenta.
 *
 * É o `DadoParado` com a queda de volta, e a troca vale a pena onde o número
 * CHEGA: na fileira do mestre e no retrato do personagem, o resultado aparecia
 * pronto no instante do arremesso — entre um e dois segundos antes de o dado
 * pousar na mão de quem rolou. O número da mesa saía antes do dado da mesa.
 *
 * Com a queda aqui, as três telas resolvem o borrão no mesmo beat: quem rolou vê
 * o próprio dado pousar, e o mestre e a TV veem o número nascer junto. A rampa
 * de `nitidez` é a mesma do dado do tabuleiro, então o algarismo não pisca — ele
 * resolve conforme o giro morre.
 *
 * O que ele NÃO faz é percorrer distância: a queda usa impulso zero, e o dado
 * tomba onde está. O arremesso é do dedo de quem rolou e não viaja — ver
 * `DURACAO_DA_CHEGADA` —, e inventar uma trajetória aqui mandaria o dado passear
 * por um pedaço de tela que não é mesa, e sim lista.
 *
 * Sem sombra no chão, ao contrário do dado do tabuleiro: ali ele está sobre o
 * mapa, e a sombra é o que diz a que altura. Aqui ele está numa fileira, e uma
 * mancha escura debaixo de cada linha leria como sujeira.
 *
 * `memo` porque quem chama CONGELA o instante no pouso: com a propriedade
 * parada, o dado que já assentou pula a subárvore inteira enquanto os outros
 * ainda caem. Ver `instanteDaQueda`.
 */
export const DadoRolando = memo(function DadoRolando({
  id,
  faces,
  valor,
  tamanho,
  t,
}: {
  /** O id da rolagem. Só a semente da tombada sai dele. */
  id: string;
  faces: FacesDado;
  /** O número GRAVADO na face. No d10 o zero é zero. Ver `valorDaRolagem`. */
  valor: number;
  /** Lado do quadrado do dado POUSADO, em pixel ou unidade de cena. */
  tamanho: number;
  /** Há quantos segundos ele foi solto. Ver `instanteDaQueda`. */
  t: number;
}) {
  const tipo = tipoDado(faces);
  const raio = tamanho * 0.44;

  const caixa = tamanho * FOLGA;
  const centro = caixa / 2;

  const quadro = quadroDaQueda(
    {
      faces,
      x: centro,
      y: centro,
      raio,
      valor,
      semente: sementeDoId(id),
      // Largado parado: o dado tomba onde está. Ver a nota do componente.
      impulso: { x: 0, y: 0 },
    },
    t,
    // A caixa inteira como limite. Com impulso zero ele não anda, e o que isto
    // evita é a trava de beirada puxar o centro para dentro — a folga dela é
    // maior que meio dado, então numa caixa justa ela deslocaria o dado parado.
    { largura: caixa, altura: caixa },
  );

  const desenho = desenharDado({
    faces,
    orientacao: quadro.orientacao,
    cx: quadro.x,
    cy: quadro.y,
    raio,
    // Enquanto ele tomba rápido não sai número nenhum: não se leria, e é o que
    // faz a rampa parecer um borrão resolvendo. Ver `QuadroDaQueda.nitidez`.
    nitidez: quadro.nitidez,
  });

  return (
    // A caixa do dado POUSADO é quem ocupa lugar na fileira, e o desenho
    // transborda dela para os quatro lados. Sem isto, cada linha da lista
    // mudaria de altura conforme o dado sobe.
    <span
      className="relative inline-block shrink-0"
      style={{ width: tamanho, height: tamanho }}
    >
      <svg
        // O número está no próprio desenho, e quem lê por voz recebe o valor
        // pelo rótulo de quem chama -- aqui seria repetição.
        aria-hidden
        width={caixa}
        height={caixa}
        viewBox={`0 0 ${caixa} ${caixa}`}
        className="absolute overflow-visible"
        style={{ left: (tamanho - caixa) / 2, top: (tamanho - caixa) / 2 }}
      >
        <g
          // Altura vira TAMANHO, porque a mesa é vista de cima. O esmagamento
          // da batida entra aqui junto, no mesmo `scale`.
          transform={
            `translate(${quadro.x} ${quadro.y}) ` +
            `scale(${quadro.escala * quadro.esmagaX} ${quadro.escala * quadro.esmagaY}) ` +
            `translate(${-quadro.x} ${-quadro.y})`
          }
        >
          <DadoFacetas
            tipo={tipo}
            desenho={desenho}
            raio={raio}
            nitidez={quadro.nitidez}
          />
        </g>
      </svg>
    </span>
  );
});
