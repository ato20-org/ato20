import {
  lerExpressaoDeRolagem,
  type AtributoDaConta,
  type ExpressaoDeRolagem,
} from "@/lib/mestre/expressao-de-rolagem";
import { MAX_ROLAGEM } from "@/types/detalhe";

/** Um pedaço do texto: solto, ou uma rolagem que estava entre chaves. */
export type PedacoDoTexto =
  | { tipo: "texto"; texto: string }
  | {
      tipo: "rolagem";
      /** Como o autor escreveu, sem as chaves: `AGId20>+5`. */
      texto: string;
      /** Já com o número de cada sigla: `3d20>+5`. */
      expressao: ExpressaoDeRolagem;
      /** As siglas que a conta leu, e quanto valeram. Ver `lerExpressaoDeRolagem`. */
      siglas?: AtributoDaConta[];
    };

/**
 * Uma rolagem entre chaves, numa linha só e do tamanho de uma `rolagem` de
 * detalhe: `{2d10+50}`, `{6d20>+45}`. Chave sem expressão dentro fica texto.
 */
const ENTRE_CHAVES = new RegExp(`\\{([^{}\\n]{1,${MAX_ROLAGEM}})\\}`, "g");

/**
 * O texto da ficha em pedaços: o que é texto, e as rolagens escritas entre
 * chaves, que a tela desenha como o botão de rolar -- "Dano: {2d10+50}
 * Sangue". Só vira rolagem o que o leitor de expressões lê; o resto, com as
 * chaves e tudo, continua texto, como o autor escreveu.
 *
 * `atributos` são os da ficha onde o texto mora: com eles, `{1d20+FOR}` lê a
 * FOR dela. A sigla que a ficha não tem deixa as chaves como texto.
 */
export function pedacosComRolagens(
  texto: string,
  atributos?: ReadonlyArray<AtributoDaConta>,
): PedacoDoTexto[] {
  const pedacos: PedacoDoTexto[] = [];
  let desde = 0;

  for (const achado of texto.matchAll(ENTRE_CHAVES)) {
    const leitura = lerExpressaoDeRolagem(achado[1]!, atributos);
    if (!leitura.ok) continue;

    if (achado.index > desde) pedacos.push({ tipo: "texto", texto: texto.slice(desde, achado.index) });
    pedacos.push({
      tipo: "rolagem",
      texto: achado[1]!.trim(),
      expressao: leitura.expressao,
      ...(leitura.siglas && { siglas: leitura.siglas }),
    });
    desde = achado.index + achado[0].length;
  }
  if (desde < texto.length) pedacos.push({ tipo: "texto", texto: texto.slice(desde) });

  return pedacos;
}

/** O texto tem alguma rolagem entre chaves que se lê? */
export function temRolagemNoTexto(texto: string, atributos?: ReadonlyArray<AtributoDaConta>): boolean {
  return pedacosComRolagens(texto, atributos).some((pedaco) => pedaco.tipo === "rolagem");
}

/**
 * O texto sem as chaves das rolagens, para onde não há botão: o celular, que
 * só rola o que o daemon lê da ficha. "Dano: {2d10+50}" lê "Dano: 2d10+50".
 * Com os `atributos` do personagem, a conta com sigla perde as chaves também,
 * escrita como o autor a escreveu: "Ataque: AGId20>+5".
 */
export function textoSemChaves(texto: string, atributos?: ReadonlyArray<AtributoDaConta>): string {
  return pedacosComRolagens(texto, atributos)
    .map((pedaco) => pedaco.texto)
    .join("");
}
