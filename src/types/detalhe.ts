/**
 * Os detalhes da ficha: Classe e Origem (Identidade), Furtividade (Perícias),
 * Golpe Pesado (Poderes). O app conhece o detalhe e o grupo, e não os nomes;
 * quem monta a ficha de cada sistema é a campanha, pelo molde. Ver
 * `vault/detalhes.rs`.
 */

export type TipoDeDetalhe = "texto" | "numero" | "escolha";

/** Como o grupo se desenha: rótulo e valor numa linha, ou nome e descrição. */
export type ExibicaoDeGrupo = "linhas" | "lista";

export type Detalhe = {
  id: string;
  rotulo: string;
  tipo: TipoDeDetalhe;
  /** O NOME do grupo: o personagem que viaja cai no grupo de mesmo nome. */
  grupo: string;
  /** Texto e escolha guardam texto; número guarda número. Ausente = vazio. */
  valor?: string | number;
  /** As escolhas possíveis. Só do tipo escolha. */
  opcoes?: string[];
  descricao?: string;
  /**
   * A expressão de rolagem DESTE personagem: `2d20+10`. Se o detalhe rola,
   * quem diz é o molde (`ModeloDeDetalhe.rolavel`), lido ao vivo. Ver
   * `expressao-de-rolagem.ts`.
   */
  rolagem?: string;
};

export type NovoDetalhe = {
  grupo: string;
  rotulo: string;
  tipo: TipoDeDetalhe;
  valor?: string | number;
  opcoes?: string[];
  descricao?: string;
};

/**
 * Ausente não mexe. Texto vazio apaga o valor de texto e de escolha, a
 * descrição e a rolagem. `rolavel` só vale no molde.
 */
export type PatchDetalhe = Partial<Omit<Detalhe, "id">> & { rolavel?: boolean };

export type GrupoDeDetalhes = {
  id: string;
  nome: string;
  exibicao: ExibicaoDeGrupo;
};

export type PatchGrupo = Partial<Omit<GrupoDeDetalhes, "id">>;

/**
 * Um detalhe de fábrica: nasce em cada ficha, e dali em diante é dela.
 *
 * `rolavel` é a exceção: é a FORMA do campo, e a ficha a lê do molde ao vivo,
 * pelo grupo e rótulo. Ligar o d20 aqui aparece na ficha que já existe.
 */
export type ModeloDeDetalhe = Omit<Detalhe, "id" | "rolagem"> & { id: string; rolavel?: boolean };

/** Um detalhe que rola, de algum personagem: o que a paleta lista. */
export type RolagemDaFicha = {
  personagemId: string;
  grupo: string;
  rotulo: string;
  rolagem: string;
};

export type MoldeDeDetalhes = {
  grupos: GrupoDeDetalhes[];
  modelos: ModeloDeDetalhe[];
};

/** Tetos do Rust (`vault/detalhes.rs`). */
export const MAX_GRUPOS = 16;
export const MAX_DETALHES = 200;
export const MAX_ROTULO = 40;
export const MAX_TEXTO = 80;
export const MAX_DESCRICAO_DETALHE = 2000;
export const MAX_OPCOES = 32;
export const MAX_NOME_DO_GRUPO = 24;
export const MAX_NUMERO_DETALHE = 99_999;
export const MAX_ROLAGEM = 60;

/** Grupo de uma ficha que o molde não conhece: aparece no fim, em linhas. */
export function grupoAvulso(nome: string): GrupoDeDetalhes {
  return { id: `avulso:${nome}`, nome, exibicao: "linhas" };
}

/**
 * O tipo de um detalhe novo no grupo: o do último que ele já tem (número nas
 * perícias, texto nos poderes), ou texto. Escolha vira texto, porque as
 * opções moram no molde.
 */
export function tipoDoNovo(...listas: Array<ReadonlyArray<{ tipo: TipoDeDetalhe }>>): TipoDeDetalhe {
  for (const lista of listas) {
    const ultimo = lista[lista.length - 1];
    if (ultimo) return ultimo.tipo === "escolha" ? "texto" : ultimo.tipo;
  }
  return "texto";
}

/** A mesma chave do Rust: sem espaço nas pontas e sem caixa. */
export function chaveDoNome(nome: string): string {
  return nome.trim().toLowerCase();
}
