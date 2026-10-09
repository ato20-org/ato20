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
 * um sistema pedir. Tirar o maior, explodir, rolar de novo: regra de sistema,
 * que mora em plugin.
 */
export type ExpressaoDeRolagem = {
  /** Na ordem em que foram escritos, um por termo: `2d6+1d4` são dois. */
  dados: Jogada[];
  modificador: number;
};

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

export type LeituraDaExpressao =
  | { ok: true; expressao: ExpressaoDeRolagem }
  | { ok: false; erro: ErroDaExpressao };

/** O teto do modificador. Espelha `MODIFICADOR_MAX`, em `vault/fio.rs`. */
export const MAX_MODIFICADOR = 10_000;

type No =
  | { tipo: "numero"; valor: number }
  | { tipo: "dado"; quantidade: number; faces: number }
  | { tipo: "negativo"; de: No }
  | { tipo: "conta"; operador: "+" | "-" | "*" | "/"; a: No; b: No };

type Simbolo =
  | { tipo: "numero"; valor: number }
  | { tipo: "dado"; quantidade: number; faces: number }
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
 * Os dados se SOMAM, e o resto é conta: `+ - * /` com a precedência de
 * sempre, e parênteses. A divisão arredonda para BAIXO, que é a regra do
 * Tormenta e do D&D ("arredonde para baixo") -- e a única que dá o mesmo
 * número a quem faz a conta de cabeça na mesa. `×` e `÷` valem como `*` e `/`.
 */
export function lerExpressaoDeRolagem(texto: string): LeituraDaExpressao {
  if (texto.trim() === "") return { ok: false, erro: "vazia" };

  try {
    const simbolos = simbolosDe(texto);
    const leitor = new Leitor(simbolos);
    const arvore = leitor.soma();
    if (!leitor.acabou()) throw new ErroDeLeitura("sintaxe");

    const expressao: ExpressaoDeRolagem = { dados: [], modificador: 0 };
    somar(arvore, 1, expressao);

    if (expressao.dados.length === 0) throw new ErroDeLeitura("sem-dado");
    const total = expressao.dados.reduce((soma, jogada) => soma + jogada.quantidade, 0);
    if (total > MAX_DADOS_POR_JOGADA) throw new ErroDeLeitura("muitos-dados");
    if (Math.abs(expressao.modificador) > MAX_MODIFICADOR) throw new ErroDeLeitura("modificador-grande");

    return { ok: true, expressao };
  } catch (causa) {
    if (causa instanceof ErroDeLeitura) return { ok: false, erro: causa.motivo };
    throw causa;
  }
}

/** A forma curta: `2d20+1d4+10`, `1d20-2`, `2d6`. */
export function textoDaExpressao({ dados, modificador }: ExpressaoDeRolagem): string {
  return dados.map(({ quantidade, faces }) => `${quantidade}d${faces}`).join("+") + textoDoModificador(modificador);
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

function jogadaDe({ quantidade, faces }: { quantidade: number; faces: number }): Jogada {
  const tipo = TIPOS_DADO.find((atual) => atual.faces === faces);
  if (!tipo) throw new ErroDeLeitura("faces");
  if (quantidade < 1) throw new ErroDeLeitura("sintaxe");
  if (quantidade > MAX_DADOS_POR_JOGADA) throw new ErroDeLeitura("muitos-dados");

  return { quantidade, faces: tipo.faces };
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

function simbolosDe(texto: string): Simbolo[] {
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

    // Número, ou dado: `20`, `d20`, `2d6`, `2 d 6`.
    const casou = /^(\d*)\s*([dD])\s*(\d+)|^(\d+)/.exec(entrada.slice(i));
    if (!casou) throw new ErroDeLeitura("sintaxe");

    if (casou[2]) {
      simbolos.push({
        tipo: "dado",
        quantidade: casou[1] === "" ? 1 : Number(casou[1]),
        faces: Number(casou[3]),
      });
    } else {
      simbolos.push({ tipo: "numero", valor: Number(casou[4]) });
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
    if (simbolo.tipo === "dado") return { tipo: "dado", quantidade: simbolo.quantidade, faces: simbolo.faces };
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
