/**
 * Sem acento e sem caixa, para comparar o que foi digitado.
 *
 * "Álvaro" tem de ser achável digitando "alvaro": num celular a mão pesada
 * pula o acento, e no teclado do mestre no meio da sessão também.
 *
 * Vive aqui e não em cada tela porque a busca de jogador e a de personagem são
 * a mesma pergunta pelos dois lados — a primeira acha pelo nome do personagem,
 * a segunda pelo nome de quem joga. Duas cópias divergiriam no dia em que uma
 * delas passasse a tratar hífen ou "ç".
 */
export function normaliza(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
