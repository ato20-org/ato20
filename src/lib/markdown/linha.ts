/**
 * Markdown do documento, UMA LINHA por vez.
 *
 * Por linha e não por arquivo, de propósito: o editor do cartão é uma prévia
 * ao vivo em que a linha sob o cursor mostra o texto cru e as outras aparecem
 * desenhadas, como no Obsidian. Um analisador que precisasse do arquivo
 * inteiro para decidir o que uma linha é -- bloco de código, tabela --
 * obrigaria a redesenhar tudo a cada tecla. O que fica de fora por isso é
 * justamente o que atravessa linhas: cerca de código, tabela, parágrafo
 * dobrado. Cada linha é um bloco; a quebra é a quebra.
 *
 * Sem dependência: o que um caderno de mestre pede cabe em cem linhas, e uma
 * biblioteca de Markdown inteira pesaria no pacote que a TV também carrega.
 */

import type { Token } from "@/lib/mencoes/texto";
import { parsePostit, type TipoNoPostit } from "@/lib/mestre/postit-mencoes";

export type Bloco =
  | { tipo: "titulo"; nivel: 1 | 2 | 3; conteudo: string }
  /**
   * `recuo` é o nível de aninhamento da lista, e só existe acima de zero: cada
   * tabulação ou par de espaços no começo é um nível -- o Tab do editor recua
   * de dois. Ver `nivelDoRecuo`.
   */
  | { tipo: "item"; conteudo: string; recuo?: number }
  | { tipo: "numero"; numero: string; conteudo: string; recuo?: number }
  | { tipo: "tarefa"; feita: boolean; conteudo: string; recuo?: number }
  | { tipo: "citacao"; conteudo: string }
  | { tipo: "regua" }
  | { tipo: "vazio" }
  /** `recuo` como o da lista: o Tab do editor recua o texto de uma tabulação. */
  | { tipo: "paragrafo"; conteudo: string; recuo?: number }
  /**
   * A linha que é SÓ uma menção -- `/porao.jpg`, `@Thalor`, `>Porão` -- e
   * que por isso vira a prévia da coisa em vez do chip: a imagem, o retrato,
   * o mapa. Menção no meio da frase continua chip; a linha sozinha é o mestre
   * pondo a coisa na página, como o `![[ ]]` do Obsidian, sem sinal a mais.
   *
   * `largura` é o `|320` do fim, em pixel na fonte padrão da nota -- ver
   * `LARGURA_BASE`. Só a imagem usa. `alinhamento` é o `|centro` ou o
   * `|direita` do fim, e sem ele a prévia fica à esquerda, como o texto.
   *
   * `senao` é o que a linha seria sem a prévia, e é o que se desenha quando o
   * nome não resolve: a mesa, que não tem vínculo nenhum, um som, que não tem
   * o que mostrar, ou um `>Frase` que não é cena nenhuma e sempre foi citação.
   */
  | {
      tipo: "embed";
      mencao: Mencao;
      largura?: number;
      alinhamento?: Alinhamento;
      senao: BlocoDeTexto;
    }
  /**
   * A linha que é só MENÇÕES, mais de uma, separadas por espaço: as prévias
   * lado a lado, numa fileira que quebra quando não cabe. `/mapa.png|240
   * /retrato.png|160` são duas imagens, cada uma com a largura dela. É o que
   * soltar uma imagem sobre a linha de outra escreve.
   *
   * O alinhamento é da FILEIRA, escrito no fim como na linha de uma prévia só.
   */
  | {
      tipo: "galeria";
      itens: ItemDaGaleria[];
      alinhamento?: Alinhamento;
      senao: BlocoDeTexto;
    };

/** Uma prévia da fileira: a menção, sem os ajustes, e a largura dela. */
export type ItemDaGaleria = { mencao: Mencao; largura?: number };

type BlocoDeTexto = Exclude<Bloco, { tipo: "embed" | "galeria" }>;

/** Onde a prévia fica na linha. Esquerda é o padrão, e não se escreve. */
export type Alinhamento = "esquerda" | "centro" | "direita";

type Mencao = Exclude<Token<TipoNoPostit>, { tipo: "texto" | "bold" | "quebra" }>;

/**
 * A fonte da nota em que `|320` é 320 pixels. A largura é guardada assim e
 * desenhada em `em`: o cartão do quadro escolhe a fonte conforme o zoom, e a
 * imagem tem de ocupar do texto a mesma parte que ocupava no editor.
 */
export const LARGURA_BASE = 16;

/**
 * Um ajuste do fim da linha de prévia: a largura (`|320`, quatro dígitos no
 * máximo, porque é pixel e não id) ou o alinhamento (`|centro`, `|direita`).
 */
const AJUSTE = /\|(\d{1,4}|esquerda|centro|direita)\s*$/;

/**
 * Os ajustes do fim da linha, em qualquer ordem, e o que sobra antes deles.
 * Dois do mesmo tipo: vale o último escrito, que é o que o mestre mudou.
 */
export function ajustesDe(linha: string): {
  resto: string;
  largura?: number;
  alinhamento?: Alinhamento;
} {
  let resto = linha;
  let largura: number | undefined;
  let alinhamento: Alinhamento | undefined;

  for (let achado = AJUSTE.exec(resto); achado; achado = AJUSTE.exec(resto)) {
    const valor = achado[1]!;
    if (/^\d/.test(valor)) largura ??= Number(valor);
    else alinhamento ??= valor as Alinhamento;
    resto = resto.slice(0, achado.index);
  }

  return {
    resto,
    ...(largura === undefined ? {} : { largura }),
    ...(alinhamento === undefined || alinhamento === "esquerda" ? {} : { alinhamento }),
  };
}

/** O que a linha é, decidido pelo começo dela. */
export function bloco(linha: string): Bloco {
  const comum = blocoComum(linha);
  if (comum.tipo === "vazio" || comum.tipo === "regua") return comum;

  const { resto, largura, alinhamento } = ajustesDe(linha);
  const ajustada = resto !== linha;
  const corpo = resto.trim();

  // Pelo parser das menções, e não por uma expressão daqui: nome entre aspas,
  // pontuação final e o espaço que abre marcador já são regra de lá, e a
  // prévia tem de concordar com o chip sobre o que é uma menção.
  const tokens = parsePostit(corpo);
  const mencao = tokens.length === 1 ? tokens[0] : undefined;
  if (!mencao || mencao.tipo === "texto" || mencao.tipo === "bold" || mencao.tipo === "quebra")
    return galeriaDe(linha, comum) ?? comum;

  return {
    tipo: "embed",
    mencao,
    ...(largura === undefined ? {} : { largura }),
    ...(alinhamento === undefined ? {} : { alinhamento }),
    // Sem o `|320` nem o `|centro`: onde a prévia não resolve, eles não dizem
    // nada a ninguém.
    senao: ajustada ? blocoComum(resto) : comum,
  };
}

/** Os ajustes que ficam depois de uma menção da fileira, e o espaço até a próxima. */
const SO_AJUSTES = /^(?:\|(?:\d{1,4}|esquerda|centro|direita))*\s*$/;

/**
 * A fileira, se a linha for só menções -- duas ou mais -- com os ajustes de
 * cada uma. Qualquer outra coisa na linha, e ela é texto com chips.
 *
 * O nome sem aspas vai até o espaço, então o `|240` de `/mapa.png|240` chega
 * DENTRO do nome, e sai dele aqui; com aspas, chega no texto depois delas.
 */
function galeriaDe(linha: string, comum: BlocoDeTexto): Extract<Bloco, { tipo: "galeria" }> | null {
  const itens: ItemDaGaleria[] = [];
  let alinhamento: Alinhamento | undefined;

  const ajustar = (item: ItemDaGaleria, texto: string) => {
    const ajustes = ajustesDe(texto);
    if (ajustes.largura !== undefined) item.largura = ajustes.largura;
    if (ajustes.alinhamento !== undefined) alinhamento = ajustes.alinhamento;
    return ajustes.resto;
  };

  for (const token of parsePostit(linha.trim())) {
    if (token.tipo === "texto") {
      const ultimo = itens[itens.length - 1];
      if (!ultimo || !SO_AJUSTES.test(token.valor)) return null;
      ajustar(ultimo, token.valor.trimEnd());
      continue;
    }
    if (token.tipo === "bold" || token.tipo === "quebra") return null;

    const item: ItemDaGaleria = { mencao: token };
    const nome = ajustar(item, token.valor);
    const tirado = token.valor.length - nome.length;
    item.mencao = { ...token, valor: nome, bruto: token.bruto.slice(0, token.bruto.length - tirado) };
    itens.push(item);
  }

  if (itens.length < 2) return null;
  return {
    tipo: "galeria",
    itens,
    ...(alinhamento === undefined ? {} : { alinhamento }),
    senao: comum,
  };
}

/**
 * A fileira escrita de volta: cada menção com a largura dela, separadas por
 * espaço, e o alinhamento colado na última. É como a alça e os botões de uma
 * imagem da fileira gravam, e reescrever inteira é seguro porque a linha não
 * tem nada além delas.
 */
function escreverGaleria(itens: ItemDaGaleria[], alinhamento: Alinhamento | undefined): string {
  return itens
    .map(({ mencao, largura }, indice) => {
      const ultimo = indice === itens.length - 1;
      return (
        mencao.bruto +
        (largura === undefined ? "" : `|${Math.round(largura)}`) +
        (ultimo && alinhamento && alinhamento !== "esquerda" ? `|${alinhamento}` : "")
      );
    })
    .join(" ");
}

/**
 * A linha com os ajustes trocados: é o que a alça da imagem e os botões de
 * alinhamento gravam. O que não vem continua como estava. Sempre na mesma
 * ordem, colados no nome -- `/foto.png|320|centro` --, e esquerda não se
 * escreve, porque é o que a linha já é sem nada.
 */
export function comAjuste(
  linha: string,
  mudar: { largura?: number; alinhamento?: Alinhamento },
  /** Na fileira, de qual prévia é a largura. O alinhamento é da fileira toda. */
  item = 0,
): string {
  const b = bloco(linha);
  if (b.tipo === "galeria") {
    const itens = b.itens.map((atual, indice) =>
      indice === item && mudar.largura !== undefined ? { ...atual, largura: mudar.largura } : atual,
    );
    return escreverGaleria(itens, mudar.alinhamento ?? b.alinhamento);
  }

  const atual = ajustesDe(linha);
  const largura = mudar.largura ?? atual.largura;
  const alinhamento = mudar.alinhamento ?? atual.alinhamento;

  return (
    atual.resto.trimEnd() +
    (largura === undefined ? "" : `|${Math.round(largura)}`) +
    (alinhamento === undefined || alinhamento === "esquerda" ? "" : `|${alinhamento}`)
  );
}

/** A linha com a largura trocada: é o que a alça da imagem grava ao soltar. */
export function comLargura(linha: string, largura: number): string {
  return comAjuste(linha, { largura });
}

function blocoComum(linha: string): BlocoDeTexto {
  if (linha.trim() === "") return { tipo: "vazio" };
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(linha)) return { tipo: "regua" };

  const titulo = /^(#{1,3})\s+(.*)$/.exec(linha);
  if (titulo)
    return {
      tipo: "titulo",
      nivel: titulo[1]!.length as 1 | 2 | 3,
      conteudo: titulo[2]!,
    };

  const tarefa = /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/.exec(linha);
  if (tarefa)
    return {
      tipo: "tarefa",
      feita: tarefa[2] !== " ",
      conteudo: tarefa[3]!,
      ...comRecuo(tarefa[1]!),
    };

  const item = /^(\s*)[-*]\s+(.*)$/.exec(linha);
  if (item) return { tipo: "item", conteudo: item[2]!, ...comRecuo(item[1]!) };

  const numero = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(linha);
  if (numero)
    return {
      tipo: "numero",
      numero: numero[2]!,
      conteudo: numero[3]!,
      ...comRecuo(numero[1]!),
    };

  const citacao = /^\s*>\s?(.*)$/.exec(linha);
  if (citacao) return { tipo: "citacao", conteudo: citacao[1]! };

  // O recuo sai do conteúdo e vira nível: desenhado como texto, a tabulação
  // no começo seria um espaço só, e o recuo que o mestre deu sumiria.
  const recuo = /^\s+/.exec(linha)?.[0] ?? "";
  return recuo && nivelDoRecuo(recuo) > 0
    ? { tipo: "paragrafo", conteudo: linha.slice(recuo.length), ...comRecuo(recuo) }
    : { tipo: "paragrafo", conteudo: linha };
}

/**
 * Quantos níveis o começo da linha recua: uma tabulação é um, dois espaços são
 * um. Dois e não quatro, porque é o que o Tab do editor escreve; quem cola uma
 * lista de outro lugar com quatro vê os níveis em dobro, e continua lendo a
 * hierarquia certa.
 */
export function nivelDoRecuo(comeco: string): number {
  let nivel = 0;
  let espacos = 0;
  for (const caractere of comeco) {
    if (caractere === "\t") nivel += 1;
    else espacos += 1;
  }
  return nivel + Math.floor(espacos / 2);
}

/** O `recuo` do bloco, só quando há: sem ele a lista de sempre continua igual. */
function comRecuo(comeco: string): { recuo?: number } {
  const nivel = nivelDoRecuo(comeco);
  return nivel > 0 ? { recuo: nivel } : {};
}

export type Trecho =
  | { tipo: "texto"; valor: string }
  | { tipo: "negrito"; valor: string }
  | { tipo: "italico"; valor: string }
  | { tipo: "codigo"; valor: string }
  | { tipo: "link"; valor: string; url: string }
  /**
   * `@personagem`, `/arquivo` ou `>cena`: as mesmas menções do postit, com o
   * mesmo parser. É o que faz a nota apontar para o que existe na campanha.
   */
  | { tipo: "mencao"; token: Token<TipoNoPostit> };

/**
 * Um trecho com o lugar dele no texto CRU do conteúdo: `[inicio, fim)` é tudo o
 * que ele ocupa, marcas incluídas; `dentro` é onde começa o que aparece na tela,
 * e `visivel` quantos caracteres aparecem. `**altar**` em 4 tem inicio 4, fim
 * 13, dentro 6 e visivel 5.
 *
 * A menção é ÁTOMO (`visivel` nulo): o chip desenha o nome resolvido, que não
 * é o que foi digitado -- `@thalor` aparece "Thalor" --, e um ponto dentro dele
 * não tem caractere cru correspondente. Vale o começo ou o fim dela.
 *
 * É o que deixa o editor traduzir um clique ou uma seleção no texto desenhado
 * para o cru. Ver `pontoNoCru`.
 */
export type TrechoComPosicao = {
  trecho: Trecho;
  inicio: number;
  fim: number;
  dentro: number;
  visivel: number | null;
};

/**
 * Os trechos da linha com as posições. `trechos()` é isto sem elas: os dois
 * saem da mesma conta, e a tela não pode discordar do mapa dela.
 */
export function trechosComPosicao(conteudo: string): TrechoComPosicao[] {
  const saida: TrechoComPosicao[] = [];
  let cursor = 0;

  for (const token of parsePostit(conteudo)) {
    if (token.tipo === "quebra") {
      cursor += 1;
      continue;
    }
    if (token.tipo === "texto") {
      for (const simples of trechosSimples(token.valor)) {
        saida.push({ ...simples, inicio: cursor + simples.inicio, fim: cursor + simples.fim, dentro: cursor + simples.dentro });
      }
      cursor += token.valor.length;
      continue;
    }
    if (token.tipo === "bold") {
      const fim = cursor + token.valor.length + 4;
      saida.push({
        trecho: { tipo: "negrito", valor: token.valor },
        inicio: cursor,
        fim,
        dentro: cursor + 2,
        visivel: token.valor.length,
      });
      cursor = fim;
      continue;
    }
    const fim = cursor + token.bruto.length;
    saida.push({ trecho: { tipo: "mencao", token }, inicio: cursor, fim, dentro: cursor, visivel: null });
    cursor = fim;
  }

  return saida;
}

/**
 * Os trechos de dentro de uma linha: as menções e o `**negrito**` pelo parser
 * do postit, e por cima dos pedaços de texto que sobram, `*itálico*`,
 * `` `código` `` e `[texto](url)`. Sem aninhar: negrito com itálico dentro sai
 * como negrito com asteriscos, e é o custo aceito de um analisador que cabe
 * numa tela.
 */
export function trechos(conteudo: string): Trecho[] {
  return trechosComPosicao(conteudo).map((posicionado) => posicionado.trecho);
}

function trechosSimples(conteudo: string): TrechoComPosicao[] {
  const saida: TrechoComPosicao[] = [];
  const re = /(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|((?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w]))|((?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w))/g;
  let cursor = 0;

  const texto = (inicio: number, fim: number): TrechoComPosicao => ({
    trecho: { tipo: "texto", valor: conteudo.slice(inicio, fim) },
    inicio,
    fim,
    dentro: inicio,
    visivel: fim - inicio,
  });

  for (const m of conteudo.matchAll(re)) {
    const inicio = m.index ?? 0;
    const fim = inicio + m[0].length;
    if (inicio > cursor) saida.push(texto(cursor, inicio));

    // Em todos, o que aparece começa um caractere depois da marca de abrir:
    // a crase, o colchete, o asterisco, o sublinhado.
    const marcado = (trecho: Trecho, valor: string): TrechoComPosicao => ({
      trecho,
      inicio,
      fim,
      dentro: inicio + 1,
      visivel: valor.length,
    });

    if (m[2] !== undefined) saida.push(marcado({ tipo: "codigo", valor: m[2] }, m[2]));
    else if (m[4] !== undefined) saida.push(marcado({ tipo: "link", valor: m[4], url: m[5]! }, m[4]));
    else if (m[7] !== undefined) saida.push(marcado({ tipo: "italico", valor: m[7] }, m[7]));
    else if (m[9] !== undefined) saida.push(marcado({ tipo: "italico", valor: m[9] }, m[9]));

    cursor = fim;
  }

  if (cursor < conteudo.length) saida.push(texto(cursor, conteudo.length));

  return saida;
}
