import { call } from "@/lib/vault/bridge";
import type {
  Detalhe,
  GrupoDeDetalhes,
  ModeloDeDetalhe,
  MoldeDeDetalhes,
  NovoDetalhe,
  PatchDetalhe,
  PatchGrupo,
} from "@/types/detalhe";

/** Os detalhes da ficha. Ver `vault/detalhes.rs`. */

export function listarDetalhes(id: string): Promise<Detalhe[]> {
  return call<Detalhe[]>("detalhes_list", { id });
}

export function criarDetalhe(id: string, novo: NovoDetalhe): Promise<Detalhe> {
  return call<Detalhe>("detalhe_criar", { id, novo });
}

/** Devolve o detalhe como ficou depois do ajuste ao tipo. */
export function editarDetalhe(id: string, detalheId: string, patch: PatchDetalhe): Promise<Detalhe> {
  return call<Detalhe>("detalhe_editar", { id, detalheId, patch });
}

export function removerDetalhe(id: string, detalheId: string): Promise<void> {
  return call("detalhe_remover", { id, detalheId });
}

export function reordenarDetalhes(id: string, ordem: string[]): Promise<Detalhe[]> {
  return call<Detalhe[]>("detalhes_reordenar", { id, ordem });
}

export function lerMoldeDeDetalhes(): Promise<MoldeDeDetalhes> {
  return call<MoldeDeDetalhes>("detalhes_da_campanha");
}

export function criarGrupoDeDetalhes(patch: PatchGrupo): Promise<GrupoDeDetalhes> {
  return call<GrupoDeDetalhes>("grupo_de_detalhes_criar", { patch });
}

/** Renomear alcança as fichas: `fichas` diz quantas mudaram. */
export function editarGrupoDeDetalhes(
  grupoId: string,
  patch: PatchGrupo,
): Promise<{ grupo: GrupoDeDetalhes; fichas: number }> {
  return call("grupo_de_detalhes_editar", { grupoId, patch });
}

export function removerGrupoDeDetalhes(grupoId: string): Promise<void> {
  return call("grupo_de_detalhes_remover", { grupoId });
}

export function reordenarGruposDeDetalhes(ordem: string[]): Promise<MoldeDeDetalhes> {
  return call<MoldeDeDetalhes>("grupos_de_detalhes_reordenar", { ordem });
}

/**
 * Cria o modelo, só no molde: as fichas que já existem só o ganham por
 * `aplicarDetalhesEmTodos`. O personagem novo nasce com ele.
 */
export function criarModeloDeDetalhe(novo: NovoDetalhe): Promise<ModeloDeDetalhe> {
  return call<ModeloDeDetalhe>("detalhe_da_campanha_criar", { novo });
}

export function aplicarDetalhesEmTodos(): Promise<{ modelo: null; alcancados: number }> {
  return call("detalhes_da_campanha_aplicar_em_todos");
}

/** As opções de uma escolha alcançam as fichas: `fichas` diz quantas mudaram. */
export function editarModeloDeDetalhe(
  modeloId: string,
  patch: PatchDetalhe,
): Promise<{ modelo: ModeloDeDetalhe; fichas: number }> {
  return call("detalhe_da_campanha_editar", { modeloId, patch });
}

export function removerModeloDeDetalhe(modeloId: string): Promise<void> {
  return call("detalhe_da_campanha_remover", { modeloId });
}

export function reordenarModelosDeDetalhe(ordem: string[]): Promise<MoldeDeDetalhes> {
  return call<MoldeDeDetalhes>("detalhes_da_campanha_reordenar", { ordem });
}
