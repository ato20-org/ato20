/**
 * Os marcadores de um postit: `**negrito**`, `@personagem`, `/arquivo`, `>cena`.
 *
 * Puro e sem React de propósito. A camada que desenha o postit precisa dos
 * hooks que resolvem nome em personagem, arquivo e cena; a separação de onde o
 * texto QUEBRA é outra coisa, e é a única parte com regra suficiente para
 * errar sozinha.
 *
 * ## `@` é personagem, não a pessoa
 *
 * O `@` marca o PERSONAGEM — `@Thalor`, não `@Álvaro`. É o nome que a anotação
 * de um mapa usa: quem entra na sala, quem o guarda reconhece, quem tem a
 * chave. O nome de quem joga aparece junto na sugestão, para escolher entre
 * dois personagens parecidos, mas o que vai para o texto é o personagem.
 *
 * ## Por que é por nome, e não por id
 *
 * O postit guarda o texto como o mestre digitou — `@Thalor` e não
 * `@[Thalor](uuid)`. A consequência aceita: renomear o personagem desfaz a
 * marcação, e `@Thalor` volta a ser texto sem vínculo. O que se ganha é o
 * postit continuar sendo TEXTO: o mestre apaga um caractere e o vínculo morre
 * ali, sem estrutura órfã dentro do arquivo da cena, e escrever um postit é
 * digitar, não operar um editor.
 *
 * ## O nome vai até o espaço
 *
 * `@Thalor sabe do alçapão` marca "Thalor" e deixa o resto como texto. Nome
 * composto pede aspas: `@"Thalor Pé-de-Ferro"`. É a regra que cabe num postit
 * escrito no meio da sessão — sem aspas, `/mapa do porão` teria de decidir
 * sozinho se "do porão" é parte do nome do arquivo, e erraria metade das vezes
 * nos dois sentidos.
 */

/** Um pedaço do texto, já classificado. */
export type Token =
  | { tipo: "texto"; valor: string }
  | { tipo: "bold"; valor: string }
  | { tipo: "quebra" }
  /**
   * Uma referência. `valor` é o nome CRU, como está escrito — resolver é de
   * quem desenha, que é quem tem a lista de personagens, de arquivos e de
   * cenas.
   *
   * `bruto` guarda o marcador inteiro, com o sinal e as aspas: é o que se
   * mostra quando o nome não resolve, para o mestre ver o que escreveu e
   * corrigir em vez de ver o nome sem o `@` e não entender por que não pintou.
   */
  | { tipo: "personagem" | "arquivo" | "cena"; valor: string; bruto: string };

/** Que tipo de referência cada sinal abre. */
const SINAIS = {
  "@": "personagem",
  "/": "arquivo",
  ">": "cena",
} as const;

type Sinal = keyof typeof SINAIS;

function eSinal(char: string): char is Sinal {
  return char === "@" || char === "/" || char === ">";
}

/**
 * Se um sinal nesta posição abre marcador ou é só um caractere.
 *
 * A regra é o que vem ANTES: marcador começa em início de linha ou depois de
 * espaço. Sem isso, `a/b`, `e-mail@casa` e `x>y` viravam referência, e o
 * mestre que escreve "3/4 do caminho" veria "4 do caminho" pintado de azul
 * procurando um arquivo chamado "4".
 */
function abreMarcador(texto: string, indice: number): boolean {
  if (indice === 0) return true;

  const anterior = texto[indice - 1];
  return anterior === " " || anterior === "\n" || anterior === "\t";
}

/**
 * Lê o nome que vem depois do sinal.
 *
 * Devolve `null` quando não há nome nenhum — um `@` solto no fim da frase, ou
 * `> ` seguido de espaço. Nesse caso o sinal é texto: o mestre está digitando,
 * e um marcador vazio piscando enquanto ele digita é pior que nada.
 */
function leNome(texto: string, inicio: number): { nome: string; fim: number } | null {
  if (texto[inicio] === '"') {
    const fecha = texto.indexOf('"', inicio + 1);

    // Aspas sem par: acontece a cada tecla enquanto o mestre digita o nome
    // composto. Trata como texto até ele fechar, em vez de comer o resto do
    // postit como se fosse um nome de trinta palavras.
    if (fecha < 0) return null;

    const nome = texto.slice(inicio + 1, fecha);
    return nome.length > 0 ? { nome, fim: fecha + 1 } : null;
  }

  let fim = inicio;
  while (fim < texto.length && !/[\s]/.test(texto[fim])) fim += 1;

  const nome = texto.slice(inicio, fim);
  if (nome.length === 0) return null;

  // Pontuação final não é do nome: "vai pro >Porão." aponta para a cena
  // "Porão", não para "Porão.". Só no fim, e só a que fecha frase — hífen e
  // sublinhado são nome de arquivo de verdade.
  const limpo = nome.replace(/[.,;:!?)\]}]+$/u, "");
  if (limpo.length === 0) return null;

  return { nome: limpo, fim: inicio + limpo.length };
}

/**
 * Separa o texto do postit em pedaços classificados.
 *
 * `**negrito**` não atravessa quebra de linha: um asterisco duplo esquecido no
 * fim de uma linha deixaria o resto do postit em negrito, e é mais provável
 * que o mestre tenha esquecido de fechar do que tenha querido três linhas
 * inteiras em negrito.
 *
 * Marcador dentro de negrito não aninha: `**@Thalor**` sai como negrito com o
 * texto `@Thalor`. Aninhar pediria uma árvore, e o ganho seria um nome que é
 * link E é negrito ao mesmo tempo — algo que ninguém pede num papel colado no
 * mapa.
 */
export function parsePostit(texto: string): Token[] {
  const tokens: Token[] = [];

  // Acumula texto comum e só o empurra quando algo o interrompe. Sem isso cada
  // caractere viraria um token, e um postit de duzentas letras renderizaria
  // duzentos `<span>`.
  let corrido = "";

  function fechaCorrido() {
    if (corrido.length > 0) {
      tokens.push({ tipo: "texto", valor: corrido });
      corrido = "";
    }
  }

  let i = 0;

  while (i < texto.length) {
    const char = texto[i];

    if (char === "\n") {
      fechaCorrido();
      tokens.push({ tipo: "quebra" });
      i += 1;
      continue;
    }

    if (char === "*" && texto[i + 1] === "*") {
      const fecha = texto.indexOf("**", i + 2);
      const quebra = texto.indexOf("\n", i + 2);

      // Fecha na mesma linha: é negrito. Senão os dois asteriscos são texto —
      // e são, literalmente, o que o mestre tem na tela enquanto digita o
      // primeiro par.
      if (fecha > i + 1 && (quebra < 0 || fecha < quebra)) {
        const valor = texto.slice(i + 2, fecha);

        if (valor.length > 0) {
          fechaCorrido();
          tokens.push({ tipo: "bold", valor });
          i = fecha + 2;
          continue;
        }
      }
    }

    if (eSinal(char) && abreMarcador(texto, i)) {
      const lido = leNome(texto, i + 1);

      if (lido) {
        fechaCorrido();
        tokens.push({
          tipo: SINAIS[char],
          valor: lido.nome,
          bruto: texto.slice(i, lido.fim),
        });
        i = lido.fim;
        continue;
      }
    }

    corrido += char;
    i += 1;
  }

  fechaCorrido();

  return tokens;
}
