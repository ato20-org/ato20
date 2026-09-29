import type { Escopo } from "@/lib/vault/configuracoes";

export type { Escopo };

/**
 * A conta pura das configurações: o que é um valor válido, e qual vale.
 *
 * Separada do store para ser testável sem navegador, como `lib/geometry`. É
 * aqui que mora a regra que o resto do aplicativo e os plugins dependem: a
 * campanha vence a máquina, a máquina vence o padrão, e um valor gravado que
 * não é do tipo declarado é ignorado em vez de quebrar a tela.
 */

export type TipoConfiguracao = "booleano" | "numero" | "texto" | "escolha";

/** Onde uma configuração pode ser gravada. `ambos` é o padrão do VSCode. */
export type EscopoConfiguracao = Escopo | "ambos";

/**
 * Uma configuração que alguém declarou: o aplicativo (`dono: "ato20"`) ou um
 * plugin (`dono` = id da extensão). Espelha `extensoes::Configuracao` no
 * Rust, mais o `dono`, que o manifesto não carrega porque é quem o leu.
 */
export type Definicao = {
  chave: string;
  titulo: string;
  descricao?: string;
  tipo: TipoConfiguracao;
  padrao: unknown;
  escopo: EscopoConfiguracao;
  /** As opções de uma `escolha`. */
  opcoes?: string[];
  /** O intervalo e o passo de um `numero`. */
  minimo?: number;
  maximo?: number;
  passo?: number;
  dono: string;
};

/** O valor é do tipo declarado, e dentro do que a definição permite? */
export function valido(definicao: Definicao, valor: unknown): boolean {
  switch (definicao.tipo) {
    case "booleano":
      return typeof valor === "boolean";
    case "texto":
      return typeof valor === "string";
    case "escolha":
      return typeof valor === "string" && (definicao.opcoes ?? []).includes(valor);
    case "numero":
      return (
        typeof valor === "number" &&
        Number.isFinite(valor) &&
        (definicao.minimo === undefined || valor >= definicao.minimo) &&
        (definicao.maximo === undefined || valor <= definicao.maximo)
      );
  }
}

/**
 * Em que escopos esta configuração pode ser gravada, do que vence para o que
 * perde. A campanha vence porque é a escolha mais específica: "nesta mesa o
 * zoom é maior" tem de valer sobre "nesta máquina o zoom é normal".
 */
export function escoposDe(definicao: Definicao): Escopo[] {
  if (definicao.escopo === "ambos") return ["campanha", "maquina"];

  return [definicao.escopo];
}

/** Onde gravar quando ninguém disse: o mais largo. É o "User" do VSCode. */
export function escopoPadrao(definicao: Definicao): Escopo {
  return definicao.escopo === "campanha" ? "campanha" : "maquina";
}

export type Valores = Record<Escopo, Record<string, unknown>>;

/**
 * O valor que vale, e de onde ele veio.
 *
 * Um valor gravado que NÃO é válido é pulado, e não devolvido nem apagado: o
 * arquivo pode ter sido editado à mão ou por uma versão que aceitava outro
 * intervalo, e a tela tem de abrir de todo jeito. Apagar corrigiria o arquivo
 * de quem só abriu o aplicativo.
 */
export function resolver(
  definicao: Definicao,
  valores: Valores,
): { valor: unknown; origem: Escopo | "padrao" } {
  for (const escopo of escoposDe(definicao)) {
    const valor = valores[escopo][definicao.chave];
    if (valor !== undefined && valido(definicao, valor)) return { valor, origem: escopo };
  }

  return { valor: definicao.padrao, origem: "padrao" };
}

/**
 * A linha de um erro de `JSON.parse`, quando o motor a entrega.
 *
 * O V8 diz "at position N" (e, nas versões novas, "line X column Y"); o
 * JavaScriptCore do WebKitGTK costuma dizer só o que estranhou, sem posição.
 * Devolve `null` quando não há como saber -- o editor mostra a mensagem crua,
 * que ainda é melhor que nada.
 */
export function linhaDoErro(texto: string, erro: unknown): number | null {
  const mensagem = erro instanceof Error ? erro.message : String(erro);

  const linha = /line (\d+)/i.exec(mensagem);
  if (linha) return Number(linha[1]);

  const posicao = /position (\d+)/i.exec(mensagem);
  if (posicao) {
    const ate = texto.slice(0, Number(posicao[1]));
    return ate.split("\n").length;
  }

  return null;
}
