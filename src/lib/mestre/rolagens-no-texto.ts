import { lerExpressaoDeRolagem, type ExpressaoDeRolagem } from "@/lib/mestre/expressao-de-rolagem";
import { MAX_ROLAGEM } from "@/types/detalhe";

/** Um pedaço do texto: solto, ou uma rolagem que estava entre chaves. */
export type PedacoDoTexto =
  | { tipo: "texto"; texto: string }
  | { tipo: "rolagem"; texto: string; expressao: ExpressaoDeRolagem };

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
 */
export function pedacosComRolagens(texto: string): PedacoDoTexto[] {
  const pedacos: PedacoDoTexto[] = [];
  let desde = 0;

  for (const achado of texto.matchAll(ENTRE_CHAVES)) {
    const leitura = lerExpressaoDeRolagem(achado[1]!);
    if (!leitura.ok) continue;

    if (achado.index > desde) pedacos.push({ tipo: "texto", texto: texto.slice(desde, achado.index) });
    pedacos.push({ tipo: "rolagem", texto: achado[1]!.trim(), expressao: leitura.expressao });
    desde = achado.index + achado[0].length;
  }
  if (desde < texto.length) pedacos.push({ tipo: "texto", texto: texto.slice(desde) });

  return pedacos;
}

/** O texto tem alguma rolagem entre chaves que se lê? */
export function temRolagemNoTexto(texto: string): boolean {
  return pedacosComRolagens(texto).some((pedaco) => pedaco.tipo === "rolagem");
}

/**
 * O texto sem as chaves das rolagens, para onde não há botão: o celular, que
 * só rola o que o daemon lê da ficha. "Dano: {2d10+50}" lê "Dano: 2d10+50".
 */
export function textoSemChaves(texto: string): string {
  return pedacosComRolagens(texto)
    .map((pedaco) => pedaco.texto)
    .join("");
}
