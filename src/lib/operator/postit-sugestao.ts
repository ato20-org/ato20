/**
 * O marcador que está sendo digitado agora, e como completá-lo.
 *
 * Puro e separado de `postit-texto.ts` de propósito, embora as duas partes
 * falem dos mesmos sinais: aquele arquivo lê texto PARADO — o que já foi
 * escrito, para desenhar —, e este lê texto em MOVIMENTO, do ponto de vista do
 * cursor. As regras divergem no ponto que mais importa: para desenhar,
 * `@Tha` é um nome que não resolve nada; para sugerir, é justamente o pedido
 * de ajuda.
 *
 * Existe porque o vínculo é por NOME (ver `Postit.texto`). Sem sugestão, esse
 * desenho cobra do mestre lembrar como ele escreveu o nome do arquivo três
 * semanas atrás — e `/porao-final-2.jpg` não é o tipo de coisa que se lembra
 * no meio de uma cena. Com sugestão, ele digita `/por`, escolhe, e o nome sai
 * escrito certo.
 */

/** Os mesmos sinais de `postit-texto.ts`. */
export type Sinal = "@" | "/" | ">";

/** O que o mestre pode escolher da lista. */
export type Sugestao = {
  /** O nome que vai para o texto. */
  nome: string;
  /** Uma palavra à direita, para escolher entre dois nomes parecidos. */
  detalhe?: string;
};

/**
 * O pedaço do texto que a lista vai substituir.
 *
 * `inicio` aponta para o SINAL, não para a primeira letra do nome: escolher da
 * lista reescreve o marcador inteiro, e é isso que permite trocar `@thalor`
 * por `@"Thalor Pé-de-Ferro"` — com acento e com aspas — sem o mestre digitar
 * disso.
 */
export type Fragmento = {
  sinal: Sinal;
  /** O que já foi digitado depois do sinal. Vazio é normal: o sinal sozinho. */
  prefixo: string;
  inicio: number;
};

function eSinal(char: string | undefined): char is Sinal {
  return char === "@" || char === "/" || char === ">";
}

/**
 * Mesma regra de `postit-texto.ts`: marcador abre em início de linha ou depois
 * de espaço. Duplicada em duas linhas em vez de exportada de lá — são dois
 * arquivos com ciclos de vida diferentes, e a regra é curta o bastante para
 * que a cópia seja mais honesta que um acoplamento entre eles.
 */
function abreMarcador(texto: string, indice: number): boolean {
  if (indice === 0) return true;

  const anterior = texto[indice - 1];
  return anterior === " " || anterior === "\n" || anterior === "\t";
}

/**
 * Qual marcador o cursor está dentro, se algum.
 *
 * Olha só a linha do cursor: marcador não atravessa quebra de linha, e limitar
 * a busca é o que impede um `@` três linhas acima de reabrir a lista quando o
 * mestre está escrevendo outra coisa.
 *
 * Aceita nome com espaço enquanto as aspas estão abertas — `@"João P` ainda é
 * um marcador em construção. É o único caso em que espaço não encerra o nome, e
 * sem ele a lista fecharia na barra de espaço de todo nome composto, que é
 * exatamente quando ela é mais útil.
 */
export function fragmentoNoCursor(texto: string, cursor: number): Fragmento | null {
  const inicioLinha = texto.lastIndexOf("\n", cursor - 1) + 1;

  // De trás para frente: vale o marcador mais próximo do cursor. Numa linha com
  // `@Thalor e /por`, quem está sendo digitado é o segundo.
  //
  // O espaço NÃO interrompe a varredura, e isso é deliberado: ele pode estar
  // dentro de aspas abertas (`@"João P`), que é marcador em construção. Quem
  // decide se o espaço encerrou o nome é a conferência lá embaixo, que já tem o
  // pedaço inteiro na mão e sabe se as aspas estão abertas.
  for (let i = cursor - 1; i >= inicioLinha; i -= 1) {
    const char = texto[i];

    if (!eSinal(char) || !abreMarcador(texto, i)) continue;

    const cru = texto.slice(i + 1, cursor);

    if (cru.startsWith('"')) {
      // Aspas ainda abertas: o nome composto está em construção, e o espaço
      // dentro dele não encerra nada. Fechada, o marcador está pronto e não há
      // mais o que sugerir.
      if (cru.slice(1).includes('"')) return null;

      return { sinal: char, prefixo: cru.slice(1), inicio: i };
    }

    // Sem aspas, espaço encerra o nome: `@Thalor sabe` com o cursor depois de
    // "sabe" não é um marcador em construção.
    if (/[\s]/.test(cru)) return null;

    return { sinal: char, prefixo: cru, inicio: i };
  }

  return null;
}

/**
 * Escreve a escolha no lugar do que estava sendo digitado.
 *
 * Devolve o texto novo e onde o cursor tem de ficar — depois do espaço que vem
 * junto. O espaço não é enfeite: sem ele, a próxima tecla continuaria dentro do
 * marcador recém-escolhido e a lista reabriria propondo trocar o que acabou de
 * ser escolhido.
 *
 * Nome com espaço sai entre aspas, que é a única forma que `parsePostit` lê de
 * volta. É o ganho concreto de ter lista: ninguém digita as aspas à mão.
 */
export function aplicaSugestao(
  texto: string,
  fragmento: Fragmento,
  cursor: number,
  nome: string,
): { texto: string; cursor: number } {
  const escrito = /[\s]/.test(nome) ? `${fragmento.sinal}"${nome}"` : `${fragmento.sinal}${nome}`;

  const antes = texto.slice(0, fragmento.inicio);
  const depois = texto.slice(cursor);

  // Um espaço só: se o mestre já digitou o espaço seguinte — o que acontece
  // quando ele volta o cursor para corrigir um marcador no meio da frase —, não
  // entra outro.
  const separador = depois.startsWith(" ") ? "" : " ";

  return {
    texto: `${antes}${escrito}${separador}${depois}`,
    cursor: fragmento.inicio + escrito.length + separador.length,
  };
}

/**
 * O que falta do nome destacado, para escrever em cinza à frente do cursor.
 *
 * É o fantasma do VS Code: ele NÃO está no texto do postit, não vai para o
 * arquivo da cena e não viaja para lugar nenhum — só aparece. Gravar a cada
 * seta seria escrever no vault e republicar a cena uma vez por tecla de
 * navegação, para desfazer em seguida se o mestre mudasse de ideia.
 *
 * Devolve vazio em dois casos, e os dois são recusas deliberadas:
 *
 * - o nome não COMEÇA com o que foi digitado. `filtraSugestoes` também casa
 *   quem apenas contém — digitando `por` a lista mostra "mapa-do-porao.jpg" —,
 *   e para esse caso não existe fantasma honesto: o que falta não está à frente
 *   do cursor, está em volta dele;
 * - o cursor não está no fim da linha. No meio de uma frase o fantasma cairia
 *   sobre as palavras seguintes, porque o texto do campo não se desloca para
 *   abrir espaço para algo que não está nele.
 *
 * O corte é por COMPRIMENTO do que foi digitado, e não pelo texto: `@porao`
 * casa "Porão" sem acento e com caixa diferente, e cortar por comprimento é o
 * que devolve o pedaço certo do nome de verdade.
 */
export function fantasmaDe(
  nome: string,
  prefixo: string,
  /** O caractere logo depois do cursor. `undefined` = fim do texto. */
  seguinte: string | undefined,
  normalizar: (texto: string) => string,
): string {
  if (seguinte !== undefined && seguinte !== "\n") return "";
  if (!normalizar(nome).startsWith(normalizar(prefixo))) return "";

  return nome.slice(prefixo.length);
}

/** Quantas linhas a lista mostra. Ver o comentário em `filtraSugestoes`. */
export const LIMITE_SUGESTOES = 6;

/**
 * Ordena os candidatos pelo que foi digitado.
 *
 * Quem começa com o prefixo vem primeiro, e depois quem só o contém: digitando
 * `/por` o arquivo "porao.jpg" interessa mais que "mapa-do-porao.jpg", e os
 * dois interessam mais que nada.
 *
 * Teto de seis, e é decisão de leitura e não de custo: a lista flutua sobre o
 * mapa, e uma lista de trinta arquivos cobriria a cena que o mestre está
 * anotando. Prefixo mais específico é o que reduz a lista — é o mesmo contrato
 * de qualquer completar-com-Tab.
 *
 * `normalizar` vem de fora para este arquivo não depender de nada: quem chama
 * passa o `normaliza` do projeto, que é o mesmo da busca de jogador e de
 * personagem.
 */
export function filtraSugestoes(
  candidatos: Sugestao[],
  prefixo: string,
  normalizar: (texto: string) => string,
): Sugestao[] {
  const alvo = normalizar(prefixo);

  // Sinal recém-digitado, sem nome nenhum: mostra o começo da lista em vez de
  // nada. É o momento em que o mestre menos sabe o que existe — e ver quatro
  // nomes ali é o que o ensina que o `/` serve para alguma coisa.
  if (alvo.length === 0) return candidatos.slice(0, LIMITE_SUGESTOES);

  const comeca: Sugestao[] = [];
  const contem: Sugestao[] = [];

  for (const candidato of candidatos) {
    const nome = normalizar(candidato.nome);

    if (nome.startsWith(alvo)) comeca.push(candidato);
    else if (nome.includes(alvo)) contem.push(candidato);
  }

  return [...comeca, ...contem].slice(0, LIMITE_SUGESTOES);
}
