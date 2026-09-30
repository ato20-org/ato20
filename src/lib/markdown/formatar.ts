/**
 * O que a barra do editor escreve: as marcas do Markdown, postas e tiradas por
 * botão, para quem não sabe (ou não lembra) as regras de digitação.
 *
 * O texto continua sendo o Markdown. A barra não guarda estilo nenhum por fora
 * dele: `**negrito**` é o que vai para o arquivo, é o que a mesa lê, e é o que
 * quem aprendeu pelo botão passa a digitar direto.
 *
 * Tudo aqui é de UMA linha, como o editor -- ver `lib/markdown/linha.ts`. E
 * puro: a linha e a seleção entram, a linha e a seleção saem, e quem chama
 * decide onde o cursor fica.
 */

/** O bloco que um botão da barra põe na linha. */
export type BlocoDaBarra = "h1" | "h2" | "h3" | "item" | "numero" | "tarefa" | "citacao";

/** A marca de dentro da linha. */
export type MarcaDaBarra = "negrito" | "italico" | "codigo";

const MARCA: Record<MarcaDaBarra, string> = {
  negrito: "**",
  italico: "*",
  codigo: "`",
};

/**
 * O prefixo que a linha já tem, e de que bloco ele é.
 *
 * Os mesmos padrões de `bloco()`, com duas diferenças que importam para quem
 * TROCA o prefixo: o recuo das listas é guardado, para uma lista aninhada
 * continuar aninhada ao virar numerada; e a citação pede espaço depois do
 * `>`, porque `>Porão` é uma menção de cena, e virar título não pode comer o
 * sinal dela.
 */
export function prefixoDe(linha: string): {
  tipo: BlocoDaBarra | "paragrafo";
  prefixo: string;
  recuo: string;
} {
  const titulo = /^(#{1,3})\s+/.exec(linha);
  if (titulo)
    return {
      tipo: `h${titulo[1]!.length}` as BlocoDaBarra,
      prefixo: titulo[0],
      recuo: "",
    };

  const tarefa = /^(\s*)[-*]\s+\[[ xX]\]\s+/.exec(linha);
  if (tarefa) return { tipo: "tarefa", prefixo: tarefa[0], recuo: tarefa[1]! };

  const item = /^(\s*)[-*]\s+/.exec(linha);
  if (item) return { tipo: "item", prefixo: item[0], recuo: item[1]! };

  const numero = /^(\s*)\d+[.)]\s+/.exec(linha);
  if (numero) return { tipo: "numero", prefixo: numero[0], recuo: numero[1]! };

  const citacao = /^(\s*)>(\s+|$)/.exec(linha);
  if (citacao) return { tipo: "citacao", prefixo: citacao[0], recuo: citacao[1]! };

  return { tipo: "paragrafo", prefixo: "", recuo: "" };
}

/**
 * A linha com o bloco pedido.
 *
 * Botão do bloco que a linha já é TIRA o prefixo -- é o mesmo botão que liga e
 * desliga, como em qualquer editor. De um bloco para outro, troca: `- item`
 * vira `1. item`, e não `1. - item`.
 *
 * A numerada continua a conta da linha de cima quando ela também é numerada:
 * é o que o Enter já faz no fim de um item, e o botão tem de concordar.
 *
 * `antes` e `depois` são o tamanho do prefixo velho e do novo, para quem chama
 * levar o cursor junto com o texto.
 */
export function comBloco(
  linha: string,
  alvo: BlocoDaBarra,
  anterior?: string,
): { linha: string; antes: number; depois: number } {
  const atual = prefixoDe(linha);
  const resto = linha.slice(atual.prefixo.length);

  if (atual.tipo === alvo) return { linha: resto, antes: atual.prefixo.length, depois: 0 };

  // O recuo só atravessa de lista para lista: título e citação não aninham.
  const lista = (tipo: string) => tipo === "item" || tipo === "numero" || tipo === "tarefa";
  const recuo = lista(atual.tipo) && lista(alvo) ? atual.recuo : "";

  const novo = (() => {
    switch (alvo) {
      case "h1":
        return "# ";
      case "h2":
        return "## ";
      case "h3":
        return "### ";
      case "item":
        return `${recuo}- `;
      case "tarefa":
        return `${recuo}- [ ] `;
      case "citacao":
        return "> ";
      case "numero": {
        const acima = anterior === undefined ? null : /^\s*(\d+)[.)]\s+/.exec(anterior);
        return `${recuo}${acima ? Number(acima[1]) + 1 : 1}. `;
      }
    }
  })();

  return { linha: novo + resto, antes: atual.prefixo.length, depois: novo.length };
}

/** Onde o cursor vai quando o prefixo da linha muda de `antes` para `depois`. */
export function cursorDepoisDoBloco(cursor: number, antes: number, depois: number): number {
  return cursor < antes ? depois : cursor - antes + depois;
}

/** Letra, número e o que costuma ficar DENTRO de uma palavra: hífen, apóstrofo. */
const DE_PALAVRA = /[\p{L}\p{N}_'-]/u;

/** A palavra em que o cursor está, ou `null` entre duas palavras. */
function palavraEm(linha: string, posicao: number): { inicio: number; fim: number } | null {
  let inicio = posicao;
  let fim = posicao;
  while (inicio > 0 && DE_PALAVRA.test(linha[inicio - 1]!)) inicio -= 1;
  while (fim < linha.length && DE_PALAVRA.test(linha[fim]!)) fim += 1;
  return inicio === fim ? null : { inicio, fim };
}

/**
 * O trecho sem os espaços das pontas.
 *
 * Duplo clique numa palavra seleciona o espaço depois dela em muita
 * plataforma, e `**texto **` não é negrito em Markdown nenhum: a marca tem de
 * encostar na letra.
 */
function semEspacos(linha: string, inicio: number, fim: number): { inicio: number; fim: number } {
  while (inicio < fim && /\s/.test(linha[inicio]!)) inicio += 1;
  while (fim > inicio && /\s/.test(linha[fim - 1]!)) fim -= 1;
  return { inicio, fim };
}

/**
 * A marca está logo FORA do trecho: `**|texto|**`.
 *
 * O itálico é um asterisco só, e o negrito são dois: sem olhar o vizinho,
 * pedir itálico dentro de `**texto**` leria o segundo asterisco do negrito
 * como o itálico e o desfaria pela metade.
 */
function envolta(linha: string, inicio: number, fim: number, marca: string): boolean {
  if (linha.slice(inicio - marca.length, inicio) !== marca) return false;
  if (linha.slice(fim, fim + marca.length) !== marca) return false;
  if (marca !== "*") return true;
  return linha[inicio - 2] !== "*" && linha[fim + 1] !== "*";
}

/**
 * A linha com a marca posta ou tirada no trecho `[inicio, fim)`.
 *
 * Sem seleção, a marca vai na palavra sob o cursor -- é o que o Ctrl+B faz no
 * editor de texto que todo mundo conhece. Sem palavra, entra o par vazio com o
 * cursor no meio, para o que for digitado já sair marcado.
 *
 * Marca que já está lá sai: a barra liga e desliga, e o trecho que volta é o
 * mesmo texto, agora sem ela.
 */
export function comMarca(
  linha: string,
  inicio: number,
  fim: number,
  qual: MarcaDaBarra,
): { linha: string; inicio: number; fim: number } {
  const marca = MARCA[qual];
  const parVazio = (onde: number) => ({
    linha: linha.slice(0, onde) + marca + marca + linha.slice(onde),
    inicio: onde + marca.length,
    fim: onde + marca.length,
  });

  if (inicio === fim) {
    const palavra = palavraEm(linha, inicio);
    if (!palavra) return parVazio(inicio);
    ({ inicio, fim } = palavra);
  }

  ({ inicio, fim } = semEspacos(linha, inicio, fim));
  // Só espaço selecionado: não há o que marcar, e o par entra onde ele começa.
  if (inicio === fim) return parVazio(inicio);

  if (envolta(linha, inicio, fim, marca))
    return {
      linha:
        linha.slice(0, inicio - marca.length) +
        linha.slice(inicio, fim) +
        linha.slice(fim + marca.length),
      inicio: inicio - marca.length,
      fim: fim - marca.length,
    };

  // A seleção pegou a marca junto: `|**texto**|`.
  const trecho = linha.slice(inicio, fim);
  if (
    trecho.length > marca.length * 2 &&
    trecho.startsWith(marca) &&
    trecho.endsWith(marca) &&
    (marca !== "*" || !trecho.startsWith("**"))
  )
    return {
      linha: linha.slice(0, inicio) + trecho.slice(marca.length, -marca.length) + linha.slice(fim),
      inicio,
      fim: fim - marca.length * 2,
    };

  return {
    linha: linha.slice(0, inicio) + marca + trecho + marca + linha.slice(fim),
    inicio: inicio + marca.length,
    fim: fim + marca.length,
  };
}

/** O endereço que o link ganha até o mestre colar o dele. */
const ENDERECO = "https://";

/**
 * A linha com um link `[texto](https://)` no trecho.
 *
 * Com texto -- selecionado, ou a palavra sob o cursor --, volta selecionado o
 * ENDEREÇO: o passo seguinte é colar o dele. Sem texto nenhum, entra
 * `[link](https://)` com o "link" selecionado, que é o que falta escrever.
 */
export function comLink(
  linha: string,
  inicio: number,
  fim: number,
): { linha: string; inicio: number; fim: number } {
  if (inicio === fim) {
    const palavra = palavraEm(linha, inicio);
    if (palavra) ({ inicio, fim } = palavra);
  }
  ({ inicio, fim } = semEspacos(linha, inicio, fim));

  const texto = linha.slice(inicio, fim);

  if (texto === "") {
    const link = `[link](${ENDERECO})`;
    return {
      linha: linha.slice(0, inicio) + link + linha.slice(fim),
      inicio: inicio + 1,
      fim: inicio + 1 + "link".length,
    };
  }

  const antesDoEndereco = inicio + texto.length + "[](".length;
  return {
    linha: `${linha.slice(0, inicio)}[${texto}](${ENDERECO})${linha.slice(fim)}`,
    inicio: antesDoEndereco,
    fim: antesDoEndereco + ENDERECO.length,
  };
}

/** Uma linha de lista -- item, tarefa, numerada --, com o recuo que tiver. */
const DE_LISTA = /^\s*(?:[-*]\s|\d+[.)]\s)/;

/**
 * O recuo de UMA linha, posto ou tirado.
 *
 * Lista recua de dois espaços: é o aninhamento, e é o que o Enter continua.
 * Texto recua de uma tabulação. Título não recua: `\t# Título` deixaria de ser
 * título. Desrecuar tira o que houver no começo -- uma tabulação, ou até dois
 * espaços --, e a linha sem recuo fica como está.
 */
function recuoDaLinha(linha: string, sentido: 1 | -1): { linha: string; delta: number } {
  if (sentido === 1) {
    if (/^#{1,3}\s/.test(linha)) return { linha, delta: 0 };
    const unidade = DE_LISTA.test(linha) ? "  " : "\t";
    return { linha: unidade + linha, delta: unidade.length };
  }
  const tirar = linha.startsWith("\t") ? 1 : /^ {1,2}/.exec(linha)?.[0].length ?? 0;
  return { linha: linha.slice(tirar), delta: -tirar };
}

/**
 * O Tab e o Shift+Tab do editor, no texto e na seleção `[inicio, fim)`.
 *
 * Tab RECUA a linha do cursor, esteja ele onde estiver nela: é o recuo de
 * quem escreve um texto, e não a tabulação no meio da frase. Numa lista, o
 * recuo é o aninhamento do item. Shift+Tab desfaz.
 *
 * Com a seleção atravessando linhas, recua ou desrecua TODAS elas, e a seleção
 * continua cobrindo as mesmas palavras. O cursor anda junto com o texto.
 *
 * É a mesma função no editor ao vivo, que passa a linha ativa sozinha, e no
 * texto cru, que passa o arquivo inteiro.
 */
export function comRecuo(
  texto: string,
  inicio: number,
  fim: number,
  sentido: 1 | -1,
): { texto: string; inicio: number; fim: number } {
  const comeco = texto.lastIndexOf("\n", inicio - 1) + 1;
  const varias = texto.slice(inicio, fim).includes("\n");

  // Seleção que termina no começo de uma linha não a leva junto: é o que se
  // tem ao selecionar linhas inteiras arrastando até a de baixo.
  const ultimo = varias && fim > 0 && texto[fim - 1] === "\n" ? fim - 1 : fim;
  const final = texto.indexOf("\n", ultimo);
  const trecho = texto.slice(comeco, final < 0 ? texto.length : final);

  let primeiro = 0;
  let total = 0;
  const linhas = trecho.split("\n").map((linha, indice) => {
    const feito = recuoDaLinha(linha, sentido);
    if (indice === 0) primeiro = feito.delta;
    total += feito.delta;
    return feito.linha;
  });

  const depois = final < 0 ? "" : texto.slice(final);
  return {
    texto: texto.slice(0, comeco) + linhas.join("\n") + depois,
    // O cursor anda com o recuo, sem cair para antes do começo da linha.
    inicio: Math.max(comeco, inicio + primeiro),
    fim: Math.max(comeco, fim + (varias ? total : primeiro)),
  };
}
