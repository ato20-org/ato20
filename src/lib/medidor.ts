import type { Medidor } from "@/types/character";

/**
 * As contas de um medidor, fora de qualquer componente.
 *
 * Aqui e não na coluna que desenha, pela razão de sempre: quatro telas leem o
 * mesmo medidor — a ficha do mestre, o palco dele, a TV e o celular —, e uma
 * conta escrita dentro de uma delas seria reescrita nas outras três. E porque
 * conta pura é conta que se confere sem palco montado.
 *
 * Nada aqui valida: quem prende `atual` entre zero e `maximo` é o Rust, que é
 * por onde toda escrita passa. O que estas funções fazem é sobreviver ao
 * arquivo editado à mão e ao quadro de uma versão futura, que chegam sem passar
 * por lá.
 */

/**
 * Quanto do medidor está cheio, de 0 a 1.
 *
 * `maximo` zero ou negativo devolve zero, e não `NaN`: o valor vai para uma
 * largura em CSS, e um `NaN` ali não desenha uma barra errada — some com a
 * linha inteira, num quadro publicado a dez por segundo que ninguém está
 * olhando no inspetor.
 */
export function fracaoDoMedidor(medidor: Medidor): number {
  if (!Number.isFinite(medidor.maximo) || medidor.maximo <= 0) return 0;
  if (!Number.isFinite(medidor.atual)) return 0;

  return Math.min(1, Math.max(0, medidor.atual / medidor.maximo));
}

/**
 * O que se escreve ao lado da forma.
 *
 * `porcentagem` diz a proporção e omite a escala — é o estilo de quem não quer
 * a mesa contando quantos golpes faltam. Os outros dois dizem os dois números,
 * porque é a leitura que a mesa faz em voz alta: "quatorze de vinte".
 */
export function textoDoMedidor(medidor: Medidor): string {
  if (medidor.estilo === "porcentagem") {
    return `${Math.round(fracaoDoMedidor(medidor) * 100)}%`;
  }

  return `${Math.max(0, Math.trunc(medidor.atual))}/${Math.max(1, Math.trunc(medidor.maximo))}`;
}

/**
 * Quantas bolinhas o estilo `pontos` desenha, e quantas estão cheias.
 *
 * Sem teto. Um `maximo` alto vira uma fileira ilegível, e isso é de propósito
 * por enquanto: o corte para `barra` acima de N só faz sentido depois de ver a
 * coluna montada na tela, e um número chutado aqui viraria um limite que
 * ninguém mediu. Quando o corte existir, é esta função que ele atravessa.
 */
export function pontosDoMedidor(medidor: Medidor): {
  total: number;
  cheios: number;
} {
  const total = Math.max(1, Math.trunc(medidor.maximo));
  const cheios = Math.min(total, Math.max(0, Math.trunc(medidor.atual)));

  return { total, cheios };
}

/**
 * Os medidores que a mesa pode ver.
 *
 * A lista chega já filtrada do daemon e do publicador — é lá que a decisão vale
 * de verdade, porque o que sai pela rede não volta. Esta é a mesma regra dita
 * de novo do lado que desenha, para o palco do Mestre poder pedir a lista
 * inteira e a coluna ainda saber quais linhas a TV enxerga.
 */
export function medidoresVisiveis(
  medidores: ReadonlyArray<Medidor> | undefined,
): Medidor[] {
  return (medidores ?? []).filter((medidor) => !medidor.escondido);
}
