import { call } from "@/lib/vault/bridge";
import type { LinhaDoFio } from "@/types/fio";
import type { RegistroDoHistorico } from "@/types/historico";

/** A resposta de `historico_ler`. Ver `historico::Leitura` no Rust. */
export type LidoDoHistorico = {
  registros: RegistroDoHistorico[];
  /** Só na leitura inteira, sem `desde`. */
  fio?: LinhaDoFio[];
  /** Até onde o arquivo foi lido: o `desde` da próxima. */
  tamanho: number;
};

/** Acrescenta ao `historico.jsonl` da campanha aberta, todos ou nenhum. */
export function acrescentarAoHistorico(registros: RegistroDoHistorico[]): Promise<void> {
  return call("historico_acrescentar", { registros });
}

/** Tudo, com o fio; ou, com `desde`, só o que entrou no histórico depois. */
export function lerHistorico(desde?: number): Promise<LidoDoHistorico> {
  return call("historico_ler", desde === undefined ? {} : { desde });
}
