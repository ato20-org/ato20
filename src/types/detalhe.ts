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
};

export type NovoDetalhe = {
  grupo: string;
  rotulo: string;
  tipo: TipoDeDetalhe;
  valor?: string | number;
  opcoes?: string[];
  descricao?: string;
};

/** Ausente não mexe. Texto vazio apaga o valor de texto e de escolha, e a descrição. */
export type PatchDetalhe = Partial<Omit<Detalhe, "id">>;

export type GrupoDeDetalhes = {
  id: string;
  nome: string;
  exibicao: ExibicaoDeGrupo;
};

export type PatchGrupo = Partial<Omit<GrupoDeDetalhes, "id">>;

/** Um detalhe de fábrica: nasce em cada ficha, e dali em diante é dela. */
export type ModeloDeDetalhe = Omit<Detalhe, "id"> & { id: string };

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
