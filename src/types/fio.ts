import type { FacesDado } from "@/types/dado";

/**
 * O fio da campanha, como o daemon o grava e o anuncia.
 *
 * Espelho de `src-tauri/src/vault/fio.rs`. O mesmo formato é a linha do
 * `chat.jsonl` e o evento do fluxo: quem lê o arquivo e quem escuta o daemon
 * aplicam a mesma coisa e chegam ao mesmo fio.
 */

/**
 * Quem disse. O nome é CONGELADO na linha: o jogador que trocou de nome, ou que
 * o Mestre tirou da mesa, continua tendo dito o que disse com o nome de então.
 */
export type AutorDoFio =
  | { tipo: "mestre" }
  | { tipo: "jogador"; id: string; nome: string }
  | { tipo: "plugin"; id: string; nome: string };

/**
 * Para quem, quando não é para a mesa inteira — o sussurro.
 *
 * `mestre` é o recado do jogador ao Mestre, e também a rolagem escondida: o
 * dado que fica no fio do Mestre e de mais ninguém.
 */
export type DestinoDoFio =
  | { tipo: "mestre" }
  | { tipo: "jogador"; id: string; nome: string };

export type DadoNoFio = {
  faces: FacesDado;
  /** O número GRAVADO, como em toda rolagem. Ver `valorDaRolagem`. */
  valor: number;
};

/**
 * Os dados, e o que o plugin disse sobre eles. O total não viaja: sai dos dados
 * e do modificador, na leitura. Ver `totalDaRolagem`.
 */
export type RolagemNoFio = {
  dados: DadoNoFio[];
  modificador?: number;
  rotulo?: string;
};

export type LinhaDoFio = {
  /** Na rolagem de jogador, o mesmo id da `RolagemDaMesa` da bandeja. */
  id: string;
  /** Relógio do DAEMON. Serve para escrever a hora, nunca para animar. */
  quando: number;
  autor: AutorDoFio;
  /** Ausente = a mesa inteira. */
  para?: DestinoDoFio;
  texto?: string;
  rolagem?: RolagemNoFio;
};

/**
 * Um evento do fluxo.
 *
 * `pronto` não existe no arquivo: é o daemon dizendo que o replay acabou e que
 * daqui em diante é o que acontece agora. Ver `FIO_PRONTO`.
 */
export type RegistroDoFio =
  | ({ tipo: "linha" } & LinhaDoFio)
  | { tipo: "apagada"; alvo: string; quando: number }
  | { tipo: "pronto" };
