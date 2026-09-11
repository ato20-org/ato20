"use client";

import { DadoFacetas } from "@/components/operator/dado-facetas";
import { desenharDado, orientacaoParaValor } from "@/lib/geometry/dado";
import { tipoDado, type FacesDado } from "@/types/dado";

/**
 * Um dado parado, mostrando a face que saiu.
 *
 * O mesmo sólido, a mesma projeção e o mesmo sombreado da `DadoLayer`, sem
 * queda nenhuma: `orientacaoParaValor` já devolve a pose de pouso, com o tombo
 * de quinze graus que dá volume ao dado sem encurtar o número.
 *
 * É o que a mesa vê de uma rolagem de JOGADOR, e é de propósito que não haja
 * animação aqui. A queda é do aparelho de quem rolou — é lá que o gesto
 * aconteceu, e é lá que ela significa alguma coisa. Na tela do mestre e na TV o
 * dado já chega decidido, e animar a chegada seria encenar um lançamento que
 * ninguém fez naquela tela.
 *
 * Vive em `playground` porque as três telas o desenham. A camada do saquinho do
 * mestre continua em `components/operator`, e continua certo que ela esteja lá:
 * aquilo não é publicado. Ver `useDadosStore` e `useRolagensStore`.
 */
export function DadoParado({
  faces,
  valor,
  tamanho,
}: {
  faces: FacesDado;
  /** O número GRAVADO na face. No d10 o zero é zero. Ver `valorDaRolagem`. */
  valor: number;
  /** Lado do quadrado, em pixel. O dado ocupa um pouco menos que ele. */
  tamanho: number;
}) {
  const tipo = tipoDado(faces);
  const raio = tamanho * 0.44;

  const desenho = desenharDado({
    faces,
    orientacao: orientacaoParaValor(faces, valor),
    cx: tamanho / 2,
    cy: tamanho / 2,
    raio,
  });

  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox={`0 0 ${tamanho} ${tamanho}`}
      // O número está no próprio desenho, e quem lê por voz recebe o valor pelo
      // rótulo de quem chama -- aqui seria repetição.
      aria-hidden
    >
      <DadoFacetas tipo={tipo} desenho={desenho} raio={raio} />
    </svg>
  );
}
