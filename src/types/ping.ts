/**
 * Os tipos de ping, na ordem em que a roda os põe, a partir do topo e no
 * sentido do relógio.
 *
 * A MESMA lista de `TIPOS_DE_PING` no daemon (`serve.rs`): é o que o daemon
 * aceita do celular, e um tipo que só um dos lados conhece é um ping recusado
 * ou um ícone que nenhuma tela desenha.
 *
 * O "olhe aqui" vem no topo porque é o que mais se usa, e no celular o topo é
 * o único lado que a mão não cobre.
 */
export const TIPOS_DE_PING = [
  "olhe",
  "alerta",
  "perigo",
  "atacar",
  "ir",
  "duvida",
] as const;

export type TipoDePing = (typeof TIPOS_DE_PING)[number];

/**
 * Um ping no mapa: alguém da mesa apontando um lugar para todo mundo.
 *
 * É EVENTO, como a rolagem, e viaja do mesmo jeito: do celular sobe ao daemon,
 * que o assina com o jogador do token e o passa à janela do mestre; o Mestre
 * o põe no quadro publicado, e a TV e os celulares o desenham. O ping do
 * mestre nasce direto na janela dele. Ver `LiveState.pings`.
 */
export type Ping = {
  id: string;
  tipo: TipoDePing;
  /**
   * A cena em que foi marcado.
   *
   * Cada tela desenha só o ping da cena que ela tem: o mestre que aponta no
   * mapa que está montando não pode acender um ícone no meio da taverna que a
   * TV mostra, no mesmo ponto de outra cena.
   */
  cenaId: string;
  /** O ponto marcado, em unidades de cena. */
  x: number;
  y: number;
  /** O jogador do token, ou `AUTOR_MESTRE`. */
  autorId: string;
  /** O nome escrito embaixo do ícone. */
  autor: string;
  /** Quando nasceu, no relógio da máquina do mestre. */
  quando: number;
};

/** O `autorId` dos pings do mestre. Nenhum jogador tem este id: os deles são UUID. */
export const AUTOR_MESTRE = "mestre";
