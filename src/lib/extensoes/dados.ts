"use client";

import { duracaoDaQueda } from "@/lib/geometry/dado";
import { lancarNaMesa } from "@/lib/mestre/dados-actions";
import { lerNotacaoDeDados, type Jogada } from "@/lib/mestre/notacao-de-dados";
import { entraNaSoma, valorDaRolagem, type FacesDado } from "@/types/dado";

/**
 * Um dado que caiu, como o plugin o vê.
 *
 * `valor` é o que a mesa SOMA -- no d10 o zero vale dez --, e não o número
 * gravado na face. É o número que um plugin quer para dar o dano, e a
 * tradução mora num lugar só, `valorDaRolagem`.
 */
export type DadoCaido = { faces: FacesDado; valor: number };

export type ResultadoDaRolagem = {
  dados: DadoCaido[];
  /** A soma dos que entram na soma. A moeda fica de fora. */
  total: number;
};

/**
 * Joga dados de verdade no palco, e resolve quando eles caem.
 *
 * "1d20", "2d6" -- a mesma notação da paleta, uma por item, sem modificador:
 * `+3` é conta do plugin, que é quem sabe de onde o bônus veio. A soma por
 * conta dele também é o que deixa a paleta continuar recusando `2d6+3` de
 * propósito, como sempre recusou.
 *
 * O valor é sorteado no lançamento e a promessa espera a QUEDA. A conta é a
 * mesma que anima o dado: quem chamou recebe o resultado no instante em que
 * o mestre o vê parar, e não antes -- um plugin que desse o dano antes de o
 * d20 parar entregaria o final da cena.
 *
 * Só o Mestre vê os dados. Levá-los à TV é outra decisão, ainda não tomada.
 */
export async function rolarParaPlugin(notacoes: readonly string[]): Promise<ResultadoDaRolagem> {
  if (notacoes.length === 0) throw new Error("nenhuma notação: passe ao menos uma, como \"1d20\".");

  const jogadas: Jogada[] = notacoes.map((texto) => {
    const jogada = lerNotacaoDeDados(texto);
    if (!jogada) throw new Error(`notação inválida: ${JSON.stringify(texto)}. Use "2d6", "d20"; o modificador é conta do plugin.`);

    return jogada;
  });

  const lancados = jogadas.flatMap((jogada) => lancarNaMesa(jogada));
  if (lancados.length === 0) throw new Error("a mesa está cheia: recolha os dados antes de rolar.");

  // Espera o ÚLTIMO a parar: o total só vale quando a mesa inteira parou.
  const espera = Math.max(...lancados.map((dado) => duracaoDaQueda(dado))) * 1000;
  await new Promise((resolver) => setTimeout(resolver, espera));

  const dados = lancados.map((dado) => ({
    faces: dado.faces,
    valor: valorDaRolagem(dado.faces, dado.valor),
  }));

  return {
    dados,
    total: dados
      .filter((dado) => entraNaSoma(dado.faces))
      .reduce((soma, dado) => soma + dado.valor, 0),
  };
}
