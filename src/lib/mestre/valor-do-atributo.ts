import {
  lerExpressaoDeRolagem,
  sinalDeManter,
  textoDaExpressao,
  textoDoModificador,
  type TermoDeDados,
} from "@/lib/mestre/expressao-de-rolagem";
import { MAX_VALOR_ATRIBUTO, type Atributo } from "@/types/character";

/** O que o campo do atributo leu: um número, um dado, ou nada que sirva. */
export type ValorLido = { tipo: "numero"; valor: number } | { tipo: "dado"; rolagem: string } | null;

/**
 * O que o mestre digitou no valor de um atributo: "3", "-1", "d8", "1d12+1",
 * e o "{1d4}" de quem já escreve rolagem entre chaves no texto da ficha.
 *
 * Sem `d` nenhum, é número pelo `parseInt` de sempre -- "4abc" ainda é 4 --,
 * dentro do teto. Com `d`, é dado se o leitor das rolagens o lê, e o dado
 * gravado é a forma curta dele (`1d8`), a mesma que o fio escreve.
 */
export function lerValorDoAtributo(texto: string): ValorLido {
  const limpo = texto.trim().replace(/^\{([^{}]*)\}$/, "$1").trim();

  if (!/[dD]/.test(limpo)) {
    const numero = Number.parseInt(limpo, 10);
    if (Number.isNaN(numero)) return null;
    return {
      tipo: "numero",
      valor: Math.max(-MAX_VALOR_ATRIBUTO, Math.min(MAX_VALOR_ATRIBUTO, numero)),
    };
  }

  const leitura = lerExpressaoDeRolagem(limpo);
  if (!leitura.ok) return null;

  return { tipo: "dado", rolagem: textoDaExpressao(leitura.expressao) };
}

/**
 * O dado como a ficha o mostra: sem o "1" do dado sozinho, que é como o
 * livro escreve. `1d8` mostra "d8", `1d12+1` mostra "d12+1", e `2d6` fica.
 */
export function textoDoDado(rolagem: string): string {
  const leitura = lerExpressaoDeRolagem(rolagem);
  if (!leitura.ok) return rolagem;

  const { dados, modificador } = leitura.expressao;
  return (
    dados
      .map(({ quantidade, faces, manter }) => `${quantidade === 1 ? "" : quantidade}d${faces}${sinalDeManter(manter)}`)
      .join("+") + textoDoModificador(modificador)
  );
}

/** O valor de um atributo como a ficha o mostra: o número, ou o dado. */
export function textoDoValor(atributo: Pick<Atributo, "valor" | "rolagem">): string {
  return atributo.rolagem ? textoDoDado(atributo.rolagem) : String(atributo.valor);
}

/**
 * A escada dos dados de atributo, do menor ao maior: o d4 que sobe a d6, a d8,
 * até o d20. Sem a moeda e o d%, que não são degrau de ninguém.
 */
const DEGRAUS = [4, 6, 8, 10, 12, 20] as const;

/**
 * O próximo dado da escada, para as setas do campo: com "d6" escrito, a seta
 * para cima dá "d8". Só para um dado sozinho, com ou sem modificador, que é o
 * atributo de dado de que um sistema sobe e desce. O resto -- "2d6", um número
 * -- devolve `null`, e quem chama faz a conta do número.
 */
export function passoDoDado(texto: string, sentido: 1 | -1): string | null {
  if (!/[dD]/.test(texto)) return null;
  const leitura = lerExpressaoDeRolagem(texto.trim().replace(/^\{([^{}]*)\}$/, "$1"));
  if (!leitura.ok) return null;

  const { dados, modificador } = leitura.expressao;
  const [unico] = dados;
  if (dados.length !== 1 || !unico || unico.quantidade !== 1) return null;

  const degrau = DEGRAUS.indexOf(unico.faces as (typeof DEGRAUS)[number]);
  if (degrau < 0) return null;
  const proximo = DEGRAUS[Math.max(0, Math.min(DEGRAUS.length - 1, degrau + sentido))]!;

  return `d${proximo}${textoDoModificador(modificador)}`;
}

/** Quantos tipos de dado o desenho de um atributo mostra, no máximo. */
const TIPOS_A_VISTA = 3;

/**
 * Os dados que o desenho de um atributo mostra: UM por tipo de dado, na ordem
 * escrita, e não um por dado. "8d4" é um d4 -- o oito está no texto embaixo
 * --, e oito d4 em fila não cabem no cartão nem no círculo do ritual.
 */
export function facesParaDesenhar(rolagem: string): TermoDeDados["faces"][] {
  const leitura = lerExpressaoDeRolagem(rolagem);
  if (!leitura.ok) return [];

  const faces = [...new Set(leitura.expressao.dados.map((termo) => termo.faces))];
  return faces.slice(0, TIPOS_A_VISTA);
}
