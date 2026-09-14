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
};
