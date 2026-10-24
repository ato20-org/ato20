import type { LinhaDoFio } from "@/types/fio";

/**
 * O histórico da campanha: o que aconteceu na mesa, um acontecimento por linha
 * do `historico.jsonl`.
 *
 * Espelho de `src-tauri/src/vault/historico.rs`, que só confere a casca (`tipo`,
 * `id`, `quando`) e grava -- o formato de cada acontecimento é daqui. Quem
 * escreve é o Mestre, que vê o antes e o depois de cada mudança nos stores
 * (ver `escriba.ts`), e o Rust, nos gestos de mochila, que só ele enxerga
 * inteiros (ver `inventory.rs`). Campo novo num tipo que o Rust também escreve
 * (`item`) precisa de campo novo lá.
 *
 * Os NOMES vão congelados na linha, como no fio: o goblin que virou "Chefe
 * goblin" apanhou com o nome de então, e a cena renomeada continua tendo sido
 * vista com o nome daquela noite. O id vai junto para a janela abrir a ficha.
 *
 * A conversa e as rolagens não moram aqui: a janela as lê do fio e as intercala
 * pela hora. Ver `LeituraDoHistorico`.
 */

/** O que todo registro tem. `quando` é o relógio desta máquina, em ms. */
type Casca = { id: string; quando: number };

/** A cena que a mesa passou a ver. `null` = a mesa ficou sem cena no ar. */
export type CenaNoAr = Casca & {
  tipo: "cena";
  cenaId: string | null;
  cena: string | null;
};

/** O combate: começou (com quem), virou a rodada, acabou. */
export type Combate = Casca & { tipo: "combate" } & (
    | { fase: "inicio"; ordem: string[] }
    | { fase: "rodada"; rodada: number }
    | { fase: "fim"; rodadas: number }
  );

/** O valor de um medidor de personagem: a vida que caiu, a sanidade que voltou. */
export type MedidorMudou = Casca & {
  tipo: "medidor";
  personagemId: string;
  personagem: string;
  medidor: string;
  cor: string;
  antes: number;
  depois: number;
  maximo: number;
};

/** Uma condição que entrou ou saiu, de um personagem ou de um objeto do mapa. */
export type CondicaoMudou = Casca & {
  tipo: "condicao";
  alvo: "personagem" | "objeto";
  /** O personagem, ou a peça do mapa. */
  alvoId: string;
  /** O nome do personagem, ou o da peça na lista de camadas. */
  nome: string;
  condicao: string;
  cor: string;
  ligada: boolean;
};

/** O que o Rust grava a cada gesto de mochila. Ver `inventory::no_historico`. */
export type AcaoNaMochila = "criado" | "dado" | "quantidade" | "passado" | "tirado";

export type ItemNaMochila = Casca & {
  tipo: "item";
  acao: AcaoNaMochila;
  itemId: string;
  item: string;
  /** Quem ficou com ele, ou de quem saiu (`tirado`). */
  personagemId: string;
  personagem: string;
  /** `criado`, `dado`, `passado` e `tirado`: quantas unidades. */
  quantidade?: number;
  /** `quantidade`: de quanto para quanto. */
  antes?: number;
  depois?: number;
  /** `passado`: de quem. */
  deId?: string;
  de?: string;
  /** A entrada está escondida do jogador. */
  escondido?: boolean;
  autor: "mestre" | "jogador";
};

/** O item da campanha que apareceu ou saiu do mapa da cena no ar. */
export type ItemNoMapa = Casca & {
  tipo: "item";
  acao: "no-mapa" | "fora-do-mapa";
  itemId: string;
  item: string;
  cenaId: string;
  cena: string;
};

/**
 * O que a mesa passou a ver: a imagem ou o item em evidência, o retrato que
 * entrou na fila, a área de névoa revelada, a porta aberta.
 */
export type Mostrado = Casca & {
  tipo: "mostrado";
  o:
    | "evidencia"
    | "item"
    | "retrato"
    | "nevoa-revelada"
    | "nevoa-escondida"
    | "porta-aberta"
    | "porta-fechada";
  /** O nome do que foi mostrado, quando há: a imagem, o item, o retrato. */
  nome?: string;
  /** Névoa e porta: a cena em que foi. */
  cena?: string;
};

/**
 * O efeito disparado na cena no ar: a bola de fogo, a flecha, o sopro.
 *
 * Quem disparou e em quem caiu são os tokens nos pontos do tiro -- o disparo
 * encaixa as pontas no centro dos personagens (ver `pontosDoDisparo`). Ausentes
 * quando a ponta caiu no chão, e não em alguém.
 */
export type DisparoFeito = Casca & {
  tipo: "disparo";
  efeito: string;
  /** A peça de onde saiu, e o personagem dela, quando é um token. */
  de?: string;
  deId?: string;
  /** A peça em que caiu, e o personagem dela, quando é um token. */
  em?: string;
  emId?: string;
  cena: string;
};

/** O que o mestre escreveu na linha do tempo. */
export type Marco = Casca & { tipo: "marco"; texto: string };

/** O marco `alvo` passou a dizer `texto`. Só acréscimo, como a lápide do fio. */
export type MarcoEditado = Casca & { tipo: "editado"; alvo: string; texto: string };

/** O marco `alvo` saiu da linha do tempo. */
export type MarcoApagado = Casca & { tipo: "apagado"; alvo: string };

export type RegistroDoHistorico =
  | CenaNoAr
  | Combate
  | MedidorMudou
  | CondicaoMudou
  | ItemNaMochila
  | ItemNoMapa
  | Mostrado
  | DisparoFeito
  | Marco
  | MarcoEditado
  | MarcoApagado;

/** O que `historico_ler` devolve: os dois arquivos, lidos de uma vez. */
export type LeituraDoHistorico = {
  registros: RegistroDoHistorico[];
  fio: LinhaDoFio[];
};
