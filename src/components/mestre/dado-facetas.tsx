"use client";

import { corDaFace, corDaTinta, type FaceDesenhada } from "@/lib/geometry/dado";
import type { TipoDado } from "@/types/dado";

/**
 * As faces e os números de um dado, em SVG.
 *
 * Um renderizador só, e três chamadores: o dado que rola no tabuleiro, o dado
 * que está na mão e o dado parado do saquinho. Eles têm de ser o MESMO dado —
 * um ícone chapado no saquinho e um sólido no mapa parecem duas coisas
 * diferentes, e o arrasto entre os dois deixa de contar uma história.
 *
 * Não recebe orientação nem posição: recebe o desenho já projetado. Quem decide
 * a pose é quem chama — pouso, tombada na mão, ou a pose de retrato do saquinho
 * —, e projetar é da geometria. Ver `desenharDado`.
 */
export function DadoFacetas({
  tipo,
  desenho,
  raio,
  /**
   * Quanto os números estão legíveis, de 0 a 1. Padrão um, para quem está
   * parado. Ver `QuadroDaQueda.nitidez`.
   */
  nitidez = 1,
}: {
  tipo: TipoDado;
  desenho: FaceDesenhada[];
  /** Em unidades de cena ou em pixel, conforme o chamador. Dá a espessura da aresta. */
  raio: number;
  nitidez?: number;
}) {
  return (
    <>
      {desenho.map((face) => (
        <polygon
          key={face.chave}
          points={face.pontos}
          fill={corDaFace(tipo.hex, face.luz)}
          // A aresta é a mesma cor da face, mais escura: sem ela duas faces de
          // brilho parecido viram uma mancha só, e o sólido perde a silhueta
          // facetada que é o que se reconhece num dado.
          stroke={corDaFace(tipo.hex, face.luz * 0.35)}
          strokeWidth={raio * 0.018}
          strokeLinejoin="round"
        />
      ))}

      {/* Depois de TODAS as faces, e não junto de cada uma: o número tem de
          ficar por cima do polígono vizinho quando ele encosta na aresta, e SVG
          pinta na ordem em que recebe.

          A opacidade num grupo só, e não em cada `<text>`: são até dez por
          dado, e são eles o gasto dominante da animação — um atributo por
          quadro em vez de dez. Omitida quando é um, para não pôr atributo onde
          ele não muda nada. */}
      <g opacity={nitidez < 1 ? nitidez : undefined}>
        {desenho.map((face) =>
          face.numeros.map((numero, i) => (
            <text
              key={`${face.chave}n${i}`}
              // A `matrix(...)` do SVG montada aqui, a partir dos seis números
              // que a geometria devolve -- ver `NumeroDesenhado.matriz`. Quem
              // desenha em canvas passa os mesmos números para `ctx.transform`.
              transform={`matrix(${numero.matriz.join(" ")})`}
              // `1` porque a matriz já traz o corpo da fonte, a escala do dado e o
              // encurtamento da perspectiva. Por isso o número deita junto com a
              // face em vez de flutuar de frente para a tela.
              fontSize={1}
              // A mesma luz da face: é tinta gravada nela, não rótulo por cima.
              fill={corDaTinta(tipo.tinta, face.luz)}
              textAnchor="middle"
              dominantBaseline="central"
              fontWeight={700}
              textDecoration={numero.sublinhado ? "underline" : undefined}
            >
              {numero.texto}
            </text>
          )),
        )}
      </g>
    </>
  );
}
