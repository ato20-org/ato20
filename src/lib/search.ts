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

/**
 * Onde o termo aparece no texto, sem acento nem caixa, em índices do TEXTO
 * ORIGINAL -- todas as vezes, sem sobrepor.
 *
 * O termo já vem normalizado. O texto é normalizado aqui caractere por
 * caractere, com o índice de origem de cada pedaço: `normaliza` tira o acento
 * decompondo, e um texto que chegou decomposto encolheria na conta -- o
 * destaque sairia deslocado do achado.
 *
 * É o que a busca de Arquivos e o Ctrl+F da nota perguntam, e o que faz os dois
 * concordarem sobre o que é achado.
 */
export function ocorrencias(texto: string, termo: string): Array<{ inicio: number; fim: number }> {
  if (termo === "") return [];

  let normal = "";
  const origem: number[] = [];
  let indice = 0;

  for (const caractere of texto) {
    const pedaco = normaliza(caractere);
    for (let i = 0; i < pedaco.length; i += 1) origem.push(indice);
    normal += pedaco;
    indice += caractere.length;
  }

  const achados: Array<{ inicio: number; fim: number }> = [];
  for (let onde = normal.indexOf(termo); onde >= 0; onde = normal.indexOf(termo, onde + termo.length)) {
    const ultimo = origem[onde + termo.length - 1]!;
    // O fim é o começo do caractere seguinte ao último achado.
    achados.push({
      inicio: origem[onde]!,
      fim: ultimo + (texto.codePointAt(ultimo)! > 0xffff ? 2 : 1),
    });
  }
  return achados;
}
