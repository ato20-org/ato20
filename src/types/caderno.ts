/**
 * O caderno de um jogador.
 *
 * Tipo compartilhado porque ele atravessa as duas portas do aplicativo: o
 * celular o lê por `/eu/notas`, atrás do token, e a janela do mestre o lê pelo
 * IPC, que só a máquina dele alcança. Uma cópia de cada lado seria a que um dia
 * discorda do Rust — o espelho é `vault::players::Nota`, e campo novo aqui
 * precisa de campo novo lá.
 */
export type Nota = {
  id: string;
  /** Uma linha, para reconhecer a nota na lista sem abri-la. */
  titulo: string;
  texto: string;
  /** As etiquetas, já limpas pelo daemon: sem repetida, sem vazia. */
  tags: string[];
  criadoEm: number;
  atualizadoEm: number;
  /**
   * O personagem de cujo caderno a nota é. Cada personagem tem o seu: quem
   * joga com dois não mistura o que o Corvo sabe com o que a Mira sabe.
   *
   * Ausente só na nota antiga de quem ainda não recebeu personagem; o primeiro
   * que ele receber a leva. Ver `vault::players::character_notes`.
   */
  personagemId?: string;
};
