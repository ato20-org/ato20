import { call } from "@/lib/vault/bridge";
import type { DefinicaoDeEfeito } from "@/types/efeito";

/**
 * Os efeitos da campanha, no disco. Ver `vault/efeitos.rs`: o Rust guarda o
 * efeito como o editor o escreve, e confere só a casca.
 */

export function listarEfeitosDaCampanha(): Promise<DefinicaoDeEfeito[]> {
  return call<DefinicaoDeEfeito[]>("efeitos_list");
}

/** Um efeito em branco, com id da campanha. */
export function criarEfeitoDaCampanha(): Promise<DefinicaoDeEfeito> {
  return call<DefinicaoDeEfeito>("efeito_criar");
}

/** Grava o efeito inteiro e devolve como ficou, com título e dica aparados. */
export function salvarEfeitoDaCampanha(efeito: DefinicaoDeEfeito): Promise<DefinicaoDeEfeito> {
  return call<DefinicaoDeEfeito>("efeito_salvar", { efeito });
}

export function apagarEfeitoDaCampanha(id: string): Promise<void> {
  return call("efeito_apagar", { id });
}
