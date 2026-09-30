/**
 * As menções de uma nota, juntas: quem, o quê e onde.
 *
 * É o que o painel "Menções" do editor mostra -- a lista dos personagens,
 * arquivos, cenas e páginas marcadas que a nota cita, com as linhas de cada
 * um. Pura: o texto entra, as menções saem, e resolver o nome em coisa é de
 * quem desenha, que tem os vínculos.
 */

import { bloco } from "@/lib/markdown/linha";
import { parsePostit, type TipoNoPostit } from "@/lib/mestre/postit-mencoes";
import { normaliza } from "@/lib/search";

export type MencaoDaNota = {
  tipo: TipoNoPostit;
  /** O nome como foi escrito da PRIMEIRA vez -- o painel mostra um só. */
  nome: string;
  /** O marcador inteiro, com o sinal: é o que se mostra quando o nome não resolve. */
  bruto: string;
  /** As linhas em que aparece, contando de 0, sem repetir. */
  linhas: number[];
  /** Quantas vezes, somando as repetidas na mesma linha. */
  vezes: number;
};

/**
 * As menções, na ordem em que aparecem pela primeira vez.
 *
 * Uma por tipo e nome SEM acento nem caixa: `@Thalor` e `@thalor` são o mesmo
 * personagem para o vínculo (ver `useMencoesDoMestre`), e têm de ser o mesmo
 * na lista.
 *
 * Pelo mesmo caminho do desenho: a linha que é só menções -- uma prévia, ou
 * uma fileira delas -- passa por `bloco()`, que tira o `|320` da largura. Lida
 * direto pelo parser, a menção seria "porao.jpg|320" e não resolveria nada.
 */
export function mencoesDaNota(texto: string): MencaoDaNota[] {
  const porChave = new Map<string, MencaoDaNota>();

  texto.split("\n").forEach((linha, indice) => {
    const b = bloco(linha);
    const tokens =
      b.tipo === "embed"
        ? [b.mencao]
        : b.tipo === "galeria"
          ? b.itens.map((item) => item.mencao)
          : parsePostit(linha);

    for (const token of tokens) {
      if (token.tipo === "texto" || token.tipo === "bold" || token.tipo === "quebra") continue;

      const chave = `${token.tipo}:${normaliza(token.valor)}`;
      const achada = porChave.get(chave);
      if (achada) {
        achada.vezes += 1;
        if (achada.linhas[achada.linhas.length - 1] !== indice) achada.linhas.push(indice);
        continue;
      }
      porChave.set(chave, {
        tipo: token.tipo,
        nome: token.valor,
        bruto: token.bruto,
        linhas: [indice],
        vezes: 1,
      });
    }
  });

  return [...porChave.values()];
}
