import { call } from "@/lib/vault/bridge";

/** O que aconteceu com uma lista do sistema. Espelho de `vault::sistema::Juntados`. */
export type Juntados = {
  entraram: number;
  /** Já existiam com o mesmo nome, e ficaram como estavam. */
  jaHavia: number;
  /** Passariam do teto da campanha. */
  naoCouberam: string[];
};

export type SistemaAplicado = {
  atributos: Juntados;
  medidores: Juntados;
  grupos: Juntados;
  detalhes: Juntados;
  condicoes: Juntados;
  /** Personagens que já existiam e ganharam o que faltava. */
  alcancados: number;
  /**
   * O desenho dos atributos que o sistema traz. Quem o grava é a tela, no
   * registro da campanha -- ver `estiloDoSistema`. Ausente antes da API 11.
   */
  estiloDosAtributos?: string | null;
};

/**
 * Junta o sistema de um plugin ao padrão da campanha aberta. Ver
 * `vault/sistema.rs`. O Rust lê o sistema do disco pelo id: a tela só diz qual.
 */
export function aplicarSistema(
  extensaoId: string,
  sistemaId: string,
  nosPersonagens: boolean,
): Promise<SistemaAplicado> {
  return call<SistemaAplicado>("sistema_aplicar", { extensaoId, sistemaId, nosPersonagens });
}
