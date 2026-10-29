import {
  lerExpressaoDeRolagem,
  type ExpressaoDeRolagem,
} from "@/lib/mestre/expressao-de-rolagem";

/** Os caracteres que uma expressão de rolagem usa. Ver `lerExpressaoDeRolagem`. */
const DA_EXPRESSAO = /^[\d\s dD+\-*/×÷()<>]+/;

/**
 * A expressão de dado com que um valor COMEÇA, e o resto dele.
 *
 * Para o atributo de item, que é texto livre: "1d8+2 cortante" rola `1d8+2` e
 * mostra "cortante" ao lado; "2 kg" não rola nada. O começo, e não o texto
 * inteiro, porque é assim que se escreve dano em todo livro -- o dado, depois o
 * tipo --, e pedir ao mestre um campo só para o dado seria um formulário para
 * cada espada.
 *
 * O começo mais LONGO que lê: "1d6 de fogo" passa por "1d6 d", que não lê, e
 * chega a "1d6". `null` quando nada lê -- inclusive o número sem dado, que é
 * peso, preço ou bônus, e não rolagem.
 */
export function rolagemNoValor(
  valor: string,
): { expressao: ExpressaoDeRolagem; texto: string; resto: string } | null {
  const comeco = DA_EXPRESSAO.exec(valor)?.[0];
  if (!comeco) return null;

  for (let fim = comeco.length; fim > 0; fim -= 1) {
    const candidato = comeco.slice(0, fim).trim();
    if (!candidato) break;

    const leitura = lerExpressaoDeRolagem(candidato);
    if (leitura.ok) {
      return {
        expressao: leitura.expressao,
        texto: candidato,
        resto: valor.slice(comeco.slice(0, fim).length).trim(),
      };
    }
  }

  return null;
}
