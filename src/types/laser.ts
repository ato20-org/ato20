/**
 * O laser do mestre como viaja no quadro. Ver `LiveState.laser`.
 *
 * O rastro INTEIRO que ainda está vivo, e não só o ponto novo: o quadro sai a
 * 10 Hz pelo transporte que guarda só o último, e uma amostra que se perde no
 * meio não pode abrir um buraco no risco. Cada quadro diz tudo, e quem recebe
 * troca o que tinha pelo que chegou.
 *
 * Os pontos levam a IDADE, e não a hora: o relógio do celular não é o do
 * Mestre, e uma hora absoluta acenderia o rastro no passado ou no futuro
 * conforme o aparelho. Idade mais a hora de chegada dá a hora local.
 */
export type LaserNaMesa = {
  /** A cena em que o mestre riscou. Cada tela desenha só o da cena que tem. */
  cenaId: string;
  /**
   * O relógio do Mestre (`Date.now`) quando o quadro foi montado.
   *
   * É também a identidade da amostra: o mesmo `agora` chegando de novo é o
   * mesmo rastro reenviado -- por um ping, um retrato, o batimento -- e quem
   * recebe não o reacende como se fosse novo.
   */
  agora: number;
  /**
   * Os riscos ainda vivos, o mais velho primeiro. Cada um achatado como
   * `x, y, idade, x, y, idade...`: posição em unidades de cena, idade em ms
   * contados de `agora` para trás.
   */
  riscos: number[][];
  /** O botão ainda está apertado: a ponta do último risco não envelhece. */
  aceso: boolean;
};
