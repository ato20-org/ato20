import {
  lerExpressaoDeRolagem,
  type AtributoDaConta,
  type ExpressaoDeRolagem,
} from "@/lib/mestre/expressao-de-rolagem";
import type { Atributo } from "@/types/character";
import { MAX_ROLAGEM, type Detalhe } from "@/types/detalhe";
import type { FormaDaRegua } from "@/types/scene";

/** As formas de régua que a ficha escreve entre chaves. Ver `lerReguaDoTexto`. */
export type FormaDaReguaNoTexto = Extract<FormaDaRegua, "linha" | "circulo">;

/** Uma régua escrita entre chaves: a forma, e quanto ela mede. */
export type ReguaDoTexto = {
  forma: FormaDaReguaNoTexto;
  /** O comprimento da linha, ou o raio do círculo. */
  metros: number;
};

/**
 * Um pedaço do texto: solto, ou uma rolagem ou uma régua que estavam entre
 * chaves.
 */
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
    }
  | ({
      tipo: "regua";
      /** Como o autor escreveu, sem as chaves: `9m`, `1,5°`. */
      texto: string;
    } & ReguaDoTexto);

/**
 * Uma rolagem entre chaves, numa linha só e do tamanho de uma `rolagem` de
 * detalhe: `{2d10+50}`, `{6d20>+45}`. Chave sem expressão dentro fica texto.
 */
const ENTRE_CHAVES = new RegExp(`\\{([^{}\\n]{1,${MAX_ROLAGEM}})\\}`, "g");

/**
 * O número escrito num texto: "5", "-2", "+3". Inteiro e de até nove
 * algarismos -- passar disso nenhuma conta aceita, e o teto é o que deixa o
 * Rust ler igual (`numero_do_detalhe`). "35%", "2,5" e "Combatente" não são.
 */
const NUMERO_ESCRITO = /^[+-]?\d{1,9}$/;

/** O que a menção lê de um detalhe: o rótulo, e o valor. O do plugin vem com `null`. */
export type DetalheDaConta = Pick<Detalhe, "rotulo"> & { valor?: Detalhe["valor"] | null };

/**
 * O que a conta lê da ficha: os atributos pela sigla, e os detalhes que guardam
 * número pelo rótulo, só com `@` -- "{1d20+@Furtividade}", "{@NEXd6}". Ver
 * `AtributoDaConta.soComArroba`.
 *
 * Detalhe de número, ou texto e escolha com um número escrito ("3"); a Classe
 * "Combatente" não entra, e o `@Classe` deixa as chaves como texto, como a
 * sigla que a ficha não tem. Os atributos vêm antes: com a sigla e o rótulo
 * iguais, a menção é o atributo. Espelho de `siglas_da_ficha`, em `serve.rs`.
 */
export function atributosDaConta(
  atributos: ReadonlyArray<Pick<Atributo, "sigla" | "valor" | "rolagem">> | undefined,
  detalhes: ReadonlyArray<DetalheDaConta> | null | undefined,
): AtributoDaConta[] {
  const daFicha: AtributoDaConta[] = (atributos ?? []).map(({ sigla, valor, rolagem }) => ({
    sigla,
    valor,
    ...(rolagem && { rolagem }),
  }));

  for (const { rotulo, valor } of detalhes ?? []) {
    const numero =
      typeof valor === "number"
        ? valor
        : typeof valor === "string" && NUMERO_ESCRITO.test(valor.trim())
          ? Number(valor.trim())
          : null;
    if (numero !== null && Number.isInteger(numero)) daFicha.push({ sigla: rotulo, valor: numero, soComArroba: true });
  }

  return daFicha;
}

/** Até quanto a régua da ficha mede, em metros. Ver `lerReguaDoTexto`. */
export const MAX_METROS_DA_REGUA = 300;

/**
 * O número e a unidade, e mais nada: `9m`, `1,5 m`, `3°`. O `º` (o ordinal)
 * vale como o `°` porque é o que o teclado brasileiro tem à mão, e na tela os
 * dois são o mesmo sinal: recusar um deles seria uma régua que não aparece sem
 * dizer por quê.
 */
const REGUA = /^(\d{1,3}(?:[.,]\d{1,2})?)\s*(m|°|º)$/i;

/**
 * A régua que o texto entre chaves pede: `m` é a régua reta -- "Deslocamento:
 * {9m}" --, e `°` o círculo, com o número no raio -- "Explosão: {6°}". `null`
 * quando não é régua.
 *
 * Com teto, e não por gosto: a régua desenha uma marca por metro (e o círculo
 * um anel), e um `{99999m}` escrito por engano seriam cem mil nós no palco de
 * quem clicou. Acima dele, as chaves ficam texto, como a conta que não se lê.
 */
export function lerReguaDoTexto(texto: string): ReguaDoTexto | null {
  const achado = REGUA.exec(texto.trim());
  if (!achado) return null;

  const metros = Number(achado[1]!.replace(",", "."));
  if (!(metros > 0) || metros > MAX_METROS_DA_REGUA) return null;

  return { forma: achado[2]!.toLowerCase() === "m" ? "linha" : "circulo", metros };
}

/**
 * O texto da ficha em pedaços: o que é texto, e as rolagens e réguas escritas
 * entre chaves, que a tela desenha como botões -- "Dano: {2d10+50} Sangue",
 * "Deslocamento: {9m}". Só vira botão o que o leitor de expressões ou o de
 * réguas lê; o resto, com as chaves e tudo, continua texto, como o autor
 * escreveu.
 *
 * `atributos` são os da ficha onde o texto mora: com eles, `{1d20+FOR}` lê a
 * FOR dela, e `{1d20+@Luta}` o detalhe Luta. A sigla que a ficha não tem deixa
 * as chaves como texto. Ver `atributosDaConta`.
 */
export function pedacosComRolagens(
  texto: string,
  atributos?: ReadonlyArray<AtributoDaConta>,
): PedacoDoTexto[] {
  const pedacos: PedacoDoTexto[] = [];
  let desde = 0;

  for (const achado of texto.matchAll(ENTRE_CHAVES)) {
    const escrito = achado[1]!.trim();
    const leitura = lerExpressaoDeRolagem(achado[1]!, atributos);
    const regua = leitura.ok ? null : lerReguaDoTexto(escrito);
    if (!leitura.ok && !regua) continue;

    if (achado.index > desde) pedacos.push({ tipo: "texto", texto: texto.slice(desde, achado.index) });
    pedacos.push(
      leitura.ok
        ? {
            tipo: "rolagem",
            texto: escrito,
            expressao: leitura.expressao,
            ...(leitura.siglas && { siglas: leitura.siglas }),
          }
        : { tipo: "regua", texto: escrito, ...regua! },
    );
    desde = achado.index + achado[0].length;
  }
  if (desde < texto.length) pedacos.push({ tipo: "texto", texto: texto.slice(desde) });

  return pedacos;
}

/** O texto tem alguma rolagem entre chaves que se lê? */
export function temRolagemNoTexto(texto: string, atributos?: ReadonlyArray<AtributoDaConta>): boolean {
  return pedacosComRolagens(texto, atributos).some((pedaco) => pedaco.tipo === "rolagem");
}

/** O texto tem alguma régua entre chaves? Ver `lerReguaDoTexto`. */
export function temReguaNoTexto(texto: string): boolean {
  return pedacosComRolagens(texto).some((pedaco) => pedaco.tipo === "regua");
}

/**
 * O número da régua como o autor o escreveu, sem a unidade: `1,5` de `1,5m`.
 * É o que o botão mostra -- a vírgula de quem escreveu, e não o ponto do
 * `Number`.
 */
export function numeroDaRegua(pedaco: Extract<PedacoDoTexto, { tipo: "regua" }>): string {
  return pedaco.texto.slice(0, -1).trim();
}

/**
 * O texto sem as chaves das rolagens e das réguas, para onde não há botão: o celular, que
 * só rola o que o daemon lê da ficha. "Dano: {2d10+50}" lê "Dano: 2d10+50".
 * Com os `atributos` do personagem, a conta com sigla perde as chaves também,
 * escrita como o autor a escreveu: "Ataque: AGId20>+5".
 */
export function textoSemChaves(texto: string, atributos?: ReadonlyArray<AtributoDaConta>): string {
  return pedacosComRolagens(texto, atributos)
    .map((pedaco) => pedaco.texto)
    .join("");
}
