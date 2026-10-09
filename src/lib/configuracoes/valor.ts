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

/**
 * `lista` é uma lista de textos -- quem fica de fora da live, por exemplo. Não
 * tem controle na lista gerada, porque um interruptor por item só existe para
 * quem sabe o que os itens são: quem a edita é o painel do plugin (ou a tela
 * dona dela), e o arquivo aberto à mão.
 */
export type TipoConfiguracao = "booleano" | "numero" | "texto" | "escolha" | "lista";

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
  /**
   * O que a tela mostra no lugar de cada opção. A opção é o valor gravado no
   * arquivo e não muda com o idioma; o rótulo muda. Opção sem rótulo aparece
   * crua.
   */
  rotulos?: Record<string, string>;
  /** O intervalo e o passo de um `numero`. */
  minimo?: number;
  maximo?: number;
  passo?: number;
  /**
   * Fora da lista de Ajustes: quem escreve é o próprio aplicativo, por um
   * gesto com nome (aplicar um sistema), e um campo de texto cru na lista
   * seria um segundo jeito, torto, de fazer o mesmo. Segue no arquivo, no zip
   * e no editor de JSON.
   */
  oculta?: boolean;
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
    case "lista":
      return Array.isArray(valor) && valor.every((item) => typeof item === "string");
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
