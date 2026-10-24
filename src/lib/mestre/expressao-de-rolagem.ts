import { MAX_DADOS_POR_JOGADA, type Jogada } from "@/lib/mestre/notacao-de-dados";
import { TIPOS_DADO } from "@/types/dado";

/**
 * Uma expressão de rolagem: os dados que caem na mesa, e o modificador que se
 * soma a eles. `1d20+5-2*5/2` é um d20 e `+0`; `2d6+1d4+3` são dois d6, um d4
 * e `+3`.
 *
 * É o "dados somados + modificador" que o fio já sabe mostrar (`RolagemNoFio`),
 * e a forma é essa de propósito: dado multiplicado (`1d20*2`) ou subtraído
 * (`1d20-1d4`) pediria outro jeito de anunciar a rolagem, e fica para quando
 * um sistema pedir. Ficar com o maior ou o menor de um termo é o único que a
 * expressão escreve (`6d20>`, ver `Manter`): o dado que não conta cai mesmo
 * assim, marcado `descartado`, e a soma o pula. Explodir e rolar de novo são
 * regra de sistema, que mora em plugin.
 */
export type ExpressaoDeRolagem = {
  /** Na ordem em que foram escritos, um por termo: `2d6+1d4` são dois. */
  dados: TermoDeDados[];
  modificador: number;
};

/**
 * Quantos dados de um termo contam: todos (a soma, ausente), ou só o MAIOR ou o
 * MENOR. `6d20>` são seis d20 e fica o maior -- o teste do Ordem, um d20 por
 * ponto de atributo --; `2d20<`, dois e fica o menor -- a desvantagem.
 * Escrito logo depois do dado. Num dado só não muda nada, e some na leitura.
 */
export type Manter = "maior" | "menor";

/** Um termo de dados da expressão: a jogada, e quais dados dela contam. */
export type TermoDeDados = Jogada & { manter?: Manter };

/** Por que a expressão não serve. A tela diz cada um com a frase dele. */
export type ErroDaExpressao =
  | "vazia"
  | "sintaxe"
  | "sem-dado"
  | "dado-fora-da-soma"
  | "faces"
  | "muitos-dados"
  | "divisao-por-zero"
  | "modificador-grande";

/**
 * Um atributo que a conta pode ler pela sigla: `{1d20+FOR}`, `{AGId20>+5}`, e
 * com a menção, `{1d20+@FOR}`. Só a ficha onde o texto mora passa os dela --
 * ver `AtributosDasRolagens`.
 *
 * Com `rolagem`, o atributo É um dado (a AGI d8), e a sigla na conta rola ele:
 * `{AGI+2}` é 1d8+2. Ver `Atributo.rolagem`.
 *
 * Com `soComArroba`, é um DETALHE da ficha que guarda número, pelo rótulo na
 * `sigla`: `{1d20+@Furtividade}`. Só com o `@`, porque rótulo é palavra de
 * frase -- "Luta", "Vida" --, e a conta escrita antes de a ficha ganhar o
 * detalhe não pode mudar de leitura. Ver `atributosDaConta`.
 */
export type AtributoDaConta = { sigla: string; valor: number; rolagem?: string; soComArroba?: boolean };

export type LeituraDaExpressao =
  | {
      ok: true;
      expressao: ExpressaoDeRolagem;
      /** As siglas que a conta leu, com o valor que valeram. Ausente = nenhuma. */
      siglas?: AtributoDaConta[];
    }
  | { ok: false; erro: ErroDaExpressao };

/** O teto do modificador. Espelha `MODIFICADOR_MAX`, em `vault/fio.rs`. */
export const MAX_MODIFICADOR = 10_000;

type No =
  | { tipo: "numero"; valor: number }
  | { tipo: "dado"; quantidade: number; faces: number; manter?: Manter }
  | { tipo: "negativo"; de: No }
  | { tipo: "conta"; operador: "+" | "-" | "*" | "/"; a: No; b: No };

type Simbolo =
  | { tipo: "numero"; valor: number }
  | { tipo: "dado"; quantidade: number; faces: number; manter?: Manter }
  | { tipo: "operador"; valor: "+" | "-" | "*" | "/" }
  | { tipo: "abre" }
  | { tipo: "fecha" };

class ErroDeLeitura extends Error {
  constructor(readonly motivo: ErroDaExpressao) {
    super(motivo);
  }
}

/**
 * Lê uma expressão como `1d20+5`, `2d4`, `1d20+5-2*5/2` ou `(3+1)*2+1d6`.
 *
 * Os dados se SOMAM -- ou, com `>` ou `<` logo depois, fica só o maior ou o
 * menor do termo (`6d20>+45`, ver `Manter`) --, e o resto é conta: `+ - * /` com a precedência de
 * sempre, e parênteses. A divisão arredonda para BAIXO, que é a regra do
 * Tormenta e do D&D ("arredonde para baixo") -- e a única que dá o mesmo
 * número a quem faz a conta de cabeça na mesa. `×` e `÷` valem como `*` e `/`.
 *
 * Com `atributos`, a sigla de cada um vale o número dele: como parcela
 * (`1d20+FOR`) e como quantidade de dados (`AGId20>+5`). Com `@` na frente, a
 * menção, vale também o detalhe da ficha pelo rótulo (`1d20+@Furtividade`).
 * Sem eles -- o campo de rolagem do detalhe, a paleta --, sigla é letra solta
 * e a leitura recusa, como sempre recusou: o leitor do daemon não sabe de
 * sigla, e os dois têm de aceitar as mesmas coisas. Ver `serve/expressao.rs`.
 */
export function lerExpressaoDeRolagem(
  texto: string,
  atributos?: ReadonlyArray<AtributoDaConta>,
): LeituraDaExpressao {
  if (texto.trim() === "") return { ok: false, erro: "vazia" };

  try {
    const usadas = new Map<string, AtributoDaConta>();
    const simbolos = simbolosDe(texto, siglasDaConta(atributos), usadas);
    const leitor = new Leitor(simbolos);
    const arvore = leitor.soma();
    if (!leitor.acabou()) throw new ErroDeLeitura("sintaxe");

    const expressao: ExpressaoDeRolagem = { dados: [], modificador: 0 };
    somar(arvore, 1, expressao);

    if (expressao.dados.length === 0) throw new ErroDeLeitura("sem-dado");
    const total = expressao.dados.reduce((soma, jogada) => soma + jogada.quantidade, 0);
    if (total > MAX_DADOS_POR_JOGADA) throw new ErroDeLeitura("muitos-dados");
    if (Math.abs(expressao.modificador) > MAX_MODIFICADOR) throw new ErroDeLeitura("modificador-grande");

    return usadas.size > 0 ? { ok: true, expressao, siglas: [...usadas.values()] } : { ok: true, expressao };
  } catch (causa) {
    if (causa instanceof ErroDeLeitura) return { ok: false, erro: causa.motivo };
    throw causa;
  }
}

/** A forma curta: `2d20+1d4+10`, `1d20-2`, `2d6`. */
export function textoDaExpressao({ dados, modificador }: ExpressaoDeRolagem): string {
  return (
    dados.map(({ quantidade, faces, manter }) => `${quantidade}d${faces}${sinalDeManter(manter)}`).join("+") +
    textoDoModificador(modificador)
  );
}

/** `>` para o maior, `<` para o menor, nada para a soma. */
export function sinalDeManter(manter: Manter | undefined): string {
  return manter === "maior" ? ">" : manter === "menor" ? "<" : "";
}

/** `+5`, `-2`, ou nada para zero: o modificador ao lado dos dados. */
export function textoDoModificador(modificador: number): string {
  if (modificador === 0) return "";

  return modificador > 0 ? `+${modificador}` : `${modificador}`;
}

/**
 * Espalha a árvore numa soma de termos com sinal. Dado só entra com sinal
 * positivo e direto na soma; dentro de conta, ou negativo, é recusado.
 */
function somar(no: No, sinal: 1 | -1, expressao: ExpressaoDeRolagem): void {
  if (no.tipo === "conta" && (no.operador === "+" || no.operador === "-")) {
    somar(no.a, sinal, expressao);
    somar(no.b, no.operador === "+" ? sinal : sinal === 1 ? -1 : 1, expressao);
    return;
  }
  if (no.tipo === "negativo") {
    somar(no.de, sinal === 1 ? -1 : 1, expressao);
    return;
  }
  if (no.tipo === "dado") {
    if (sinal < 0) throw new ErroDeLeitura("dado-fora-da-soma");
    expressao.dados.push(jogadaDe(no));
    return;
  }

  expressao.modificador += sinal * avaliar(no);
}

function jogadaDe({
  quantidade,
  faces,
  manter,
}: {
  quantidade: number;
  faces: number;
  manter?: Manter;
}): TermoDeDados {
  const tipo = TIPOS_DADO.find((atual) => atual.faces === faces);
  if (!tipo) throw new ErroDeLeitura("faces");
  if (quantidade < 1) throw new ErroDeLeitura("sintaxe");
  if (quantidade > MAX_DADOS_POR_JOGADA) throw new ErroDeLeitura("muitos-dados");

  // Num dado só, o maior e o menor são ele: a leitura é a mesma de `1d20`.
  return manter && quantidade > 1 ? { quantidade, faces: tipo.faces, manter } : { quantidade, faces: tipo.faces };
}

/** A conta de um pedaço sem dado. Dado aqui dentro é o que a soma não aceita. */
function avaliar(no: No): number {
  switch (no.tipo) {
    case "numero":
      return no.valor;
    case "dado":
      throw new ErroDeLeitura("dado-fora-da-soma");
    case "negativo":
      return -avaliar(no.de);
    case "conta": {
      const a = avaliar(no.a);
      const b = avaliar(no.b);
      if (no.operador === "+") return a + b;
      if (no.operador === "-") return a - b;
      if (no.operador === "*") return a * b;
      if (b === 0) throw new ErroDeLeitura("divisao-por-zero");
      return Math.floor(a / b);
    }
  }
}

/**
 * O que o dado de um atributo lê -- `d20-@NEX`: só o que é NÚMERO, os atributos
 * de número e os detalhes, e nunca ele mesmo (`sigla`). O dado de um atributo
 * não lê outro dado, e é isso que garante que nenhum chama o outro: `{AGI+2}`
 * abre a AGI uma vez, e para.
 */
export function nomesDoDadoDoAtributo<T extends AtributoDaConta>(nomes: ReadonlyArray<T>, sigla?: string): T[] {
  const propria = sigla?.trim().toLocaleUpperCase("pt-BR");

  return nomes.filter(
    (nome) =>
      !nome.rolagem && (nome.soComArroba || nome.sigla.trim().toLocaleUpperCase("pt-BR") !== propria),
  );
}

/**
 * As siglas que a conta procura, da mais comprida para a mais curta: com AG e
 * AGI na ficha, "AGI" é a AGI, e não a AG seguida de um I. Entre as do mesmo
 * tamanho, a ordem de quem passou -- os atributos antes dos detalhes.
 */
function siglasDaConta(atributos: ReadonlyArray<AtributoDaConta> | undefined): AtributoDaConta[] {
  return (atributos ?? [])
    .map((atributo) => ({ ...atributo, sigla: atributo.sigla.trim() }))
    .filter(({ sigla, valor, rolagem }) => sigla !== "" && (rolagem ? true : Number.isInteger(valor)))
    .sort((a, b) => b.sigla.length - a.sigla.length);
}

/**
 * A sigla que começa em `i`, sem diferenciar maiúscula: o livro escreve FOR, e
 * quem digita depressa escreve for. Os detalhes só depois do `@` (`mencao`).
 */
function siglaEm(
  entrada: string,
  i: number,
  siglas: ReadonlyArray<AtributoDaConta>,
  mencao: boolean,
): AtributoDaConta | undefined {
  return siglas.find(
    ({ sigla, soComArroba }) =>
      (mencao || !soComArroba) &&
      entrada.slice(i, i + sigla.length).toLocaleUpperCase("pt-BR") === sigla.toLocaleUpperCase("pt-BR"),
  );
}

function simbolosDe(
  texto: string,
  siglas: ReadonlyArray<AtributoDaConta>,
  usadas: Map<string, AtributoDaConta>,
): Simbolo[] {
  const simbolos: Simbolo[] = [];
  const entrada = texto.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  let i = 0;

  while (i < entrada.length) {
    const letra = entrada[i]!;

    if (/\s/.test(letra)) {
      i++;
      continue;
    }
    if ("+-*/".includes(letra)) {
      simbolos.push({ tipo: "operador", valor: letra as "+" | "-" | "*" | "/" });
      i++;
      continue;
    }
    if (letra === "(" || letra === ")") {
      simbolos.push({ tipo: letra === "(" ? "abre" : "fecha" });
      i++;
      continue;
    }

    // A menção: `@AGI`, `@Furtividade`. Colada no `@`, sem espaço, e o que
    // vem depois é nome e nada mais -- nem o dado disputa com ele.
    const mencao = letra === "@";

    // Número, ou dado: `20`, `d20`, `2d6`, `2 d 6`, e o dado com o que fica
    // dele: `6d20>`, `2d20 <`.
    const casou = mencao ? null : /^(\d*)\s*([dD])\s*(\d+)(?:\s*([<>]))?|^(\d+)/.exec(entrada.slice(i));

    // A sigla de um atributo, DEPOIS do dado: onde as duas leituras servem --
    // uma sigla "D" diante de `d20` --, o dado vence, e a conta escrita antes
    // de a ficha ter a sigla continua lendo o mesmo.
    const sigla = casou ? undefined : siglaEm(entrada, mencao ? i + 1 : i, siglas, mencao);
    if (sigla) {
      usadas.set(sigla.sigla, sigla);
      i += (mencao ? 1 : 0) + sigla.sigla.length;

      // Colada no dado, ela é a QUANTIDADE: `AGId20>` são tantos d20 quanto a
      // AGI. Zero ou menos não rola -- `jogadaDe` recusa --, e o que cada
      // sistema faz com atributo zero é regra dele, que mora em plugin.
      const dado = /^\s*[dD]\s*(\d+)(?:\s*([<>]))?/.exec(entrada.slice(i));

      // O atributo que É um dado entra como a expressão dele entre
      // parênteses: `{AGI+2}` com AGI d8 é `(1d8)+2`, e a soma o espalha como
      // qualquer termo. Dado não conta dados -- `AGId20` com AGI d8 não
      // diz nada --, e a expressão gravada só lê o que é número, para uma
      // não chamar a outra. Ver `nomesDoDadoDoAtributo`.
      if (sigla.rolagem) {
        if (dado) throw new ErroDeLeitura("sintaxe");
        simbolos.push(
          { tipo: "abre" },
          ...simbolosDe(sigla.rolagem, nomesDoDadoDoAtributo(siglas), usadas),
          { tipo: "fecha" },
        );
        continue;
      }

      if (dado) {
        simbolos.push({
          tipo: "dado",
          quantidade: sigla.valor,
          faces: Number(dado[1]),
          ...(dado[2] && { manter: dado[2] === ">" ? ("maior" as const) : ("menor" as const) }),
        });
        i += dado[0].length;
      } else {
        simbolos.push({ tipo: "numero", valor: sigla.valor });
      }
      continue;
    }

    if (!casou) throw new ErroDeLeitura("sintaxe");

    if (casou[2]) {
      simbolos.push({
        tipo: "dado",
        quantidade: casou[1] === "" ? 1 : Number(casou[1]),
        faces: Number(casou[3]),
        ...(casou[4] && { manter: casou[4] === ">" ? ("maior" as const) : ("menor" as const) }),
      });
    } else {
      simbolos.push({ tipo: "numero", valor: Number(casou[5]) });
    }
    i += casou[0].length;
  }

  return simbolos;
}

/** Descida recursiva: soma > produto > unário > átomo. */
class Leitor {
  private posicao = 0;

  constructor(private readonly simbolos: Simbolo[]) {}

  acabou(): boolean {
    return this.posicao >= this.simbolos.length;
  }

  soma(): No {
    let no = this.produto();
    for (let simbolo = this.olhar(); simbolo?.tipo === "operador" && (simbolo.valor === "+" || simbolo.valor === "-"); simbolo = this.olhar()) {
      this.posicao++;
      no = { tipo: "conta", operador: simbolo.valor, a: no, b: this.produto() };
    }
    return no;
  }

  private produto(): No {
    let no = this.unario();
    for (let simbolo = this.olhar(); simbolo?.tipo === "operador" && (simbolo.valor === "*" || simbolo.valor === "/"); simbolo = this.olhar()) {
      this.posicao++;
      no = { tipo: "conta", operador: simbolo.valor, a: no, b: this.unario() };
    }
    return no;
  }

  private unario(): No {
    const simbolo = this.olhar();
    if (simbolo?.tipo === "operador" && (simbolo.valor === "+" || simbolo.valor === "-")) {
      this.posicao++;
      const de = this.unario();
      return simbolo.valor === "-" ? { tipo: "negativo", de } : de;
    }
    return this.atomo();
  }

  private atomo(): No {
    const simbolo = this.simbolos[this.posicao++];
    if (!simbolo) throw new ErroDeLeitura("sintaxe");

    if (simbolo.tipo === "numero") return { tipo: "numero", valor: simbolo.valor };
    if (simbolo.tipo === "dado")
      return { tipo: "dado", quantidade: simbolo.quantidade, faces: simbolo.faces, manter: simbolo.manter };
    if (simbolo.tipo === "abre") {
      const dentro = this.soma();
      if (this.simbolos[this.posicao++]?.tipo !== "fecha") throw new ErroDeLeitura("sintaxe");
      return dentro;
    }

    throw new ErroDeLeitura("sintaxe");
  }

  private olhar(): Simbolo | undefined {
    return this.simbolos[this.posicao];
  }
}
