/**
 * Um SVG de plugin, lido para uma árvore que a mesa sabe desenhar.
 *
 * O estilo de medidor de um plugin é um arquivo `.svg` com variáveis --
 * `{fracao}`, `{atual}`, `{maximo}`, `{cor}`, `{largura}`, `{altura}` -- no lugar
 * dos números. Ele NÃO é injetado como HTML em lugar nenhum: o Mestre o lê uma
 * vez para esta árvore, passando por uma lista fechada de elementos e
 * atributos, e é a árvore que viaja para a TV e para o celular, que a desenham
 * com o React. É o mesmo caminho do Markdown (`linha.ts` + `markdown-view`):
 * texto vira dado tipado, e dado tipado vira elemento -- nada do que o plugin
 * escreveu chega a um `innerHTML`.
 *
 * A lista é o que separa isto de "cole um SVG". Sem `script`, sem
 * `foreignObject`, sem `on*`, sem `href` (nem `use`, nem `image`): nada que
 * execute, nada que busque de fora. `style` também fica de fora -- a animação
 * é por `animate`/`animateTransform` só em `opacity` e `transform`, que é o
 * que o palco já anima nos efeitos de condição sem custar layout.
 *
 * Pura, e testada sem navegador: quem fala com o `DOMParser` é `lerModeloSvg`,
 * uma casca fina em volta de `filtrarSvg`.
 */

/** Um nó lido, antes do filtro. É o que o DOM entrega, reduzido ao mínimo. */
export type NoBruto = {
  tag: string;
  atributos: Record<string, string>;
  filhos: Array<NoBruto | string>;
};

/** Um nó que passou. A mesma forma; a diferença é a promessa. */
export type NoSvg = NoBruto & { filhos: Array<NoSvg | string> };

const TAGS = new Set([
  "svg",
  "g",
  "defs",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "path",
  "text",
  "tspan",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "animate",
  "animatetransform",
]);

/** Só `text` e `tspan` carregam texto: em qualquer outro nó ele é ruído. */
const COM_TEXTO = new Set(["text", "tspan"]);

const ATRIBUTOS = new Set([
  "id",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "d",
  "points",
  "viewbox",
  "preserveaspectratio",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "transform",
  "transform-origin",
  "clip-path",
  "mask",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "gradienttransform",
  "attributename",
  "values",
  "from",
  "to",
  "dur",
  "begin",
  "repeatcount",
  "keytimes",
  "calcmode",
  "type",
  "additive",
]);

/** As duas propriedades que uma animação pode mexer. Ver o cabeçalho. */
const ANIMAVEIS = new Set(["opacity", "transform"]);

/**
 * Um valor de atributo serve?
 *
 * `url(#id)` passa -- é como `fill` aponta para um gradiente do próprio
 * arquivo. Qualquer outro `url(` é busca de fora, e cai. `javascript:` e
 * `data:` não têm lugar em atributo nenhum desta lista, mas custam duas
 * linhas recusar.
 */
function valorSeguro(valor: string): boolean {
  const baixo = valor.toLowerCase();
  if (/javascript:|data:|expression\(/.test(baixo)) return false;

  const urls = baixo.match(/url\(([^)]*)\)/g) ?? [];

  return urls.every((url) => /^url\(\s*['"]?#/.test(url));
}

/**
 * Filtra a árvore pela lista. Nó fora da lista SOME com os filhos: um `g`
 * desconhecido que fosse achatado poderia trazer para dentro o que ele
 * envolvia. Devolve `null` quando a raiz não é um `svg`.
 */
export function filtrarSvg(raiz: NoBruto): NoSvg | null {
  if (raiz.tag.toLowerCase() !== "svg") return null;

  return filtrar(raiz);
}

function filtrar(no: NoBruto): NoSvg | null {
  const tag = no.tag.toLowerCase();
  if (!TAGS.has(tag)) return null;

  const atributos: Record<string, string> = {};
  for (const [nome, valor] of Object.entries(no.atributos)) {
    const chave = nome.toLowerCase();
    if (!ATRIBUTOS.has(chave) || !valorSeguro(valor)) continue;

    atributos[chave] = valor;
  }

  // Animação só do que não custa layout. Uma que mire `width` sai inteira, e
  // não só o atributo: sem `attributeName` ela animaria coisa nenhuma.
  if (tag === "animate" || tag === "animatetransform") {
    const alvo = atributos.attributename?.toLowerCase();
    if (!alvo || !ANIMAVEIS.has(alvo)) return null;
  }

  const filhos: Array<NoSvg | string> = [];
  for (const filho of no.filhos) {
    if (typeof filho === "string") {
      if (COM_TEXTO.has(tag) && filho.trim()) filhos.push(filho);
      continue;
    }

    const passou = filtrar(filho);
    if (passou) filhos.push(passou);
  }

  return { tag, atributos, filhos };
}

/** O que o modelo pode pedir. Tudo número ou cor, já pronto para o atributo. */
export type VariaveisDoMedidor = {
  fracao: number;
  atual: number;
  maximo: number;
  cor: string;
  largura: number;
  altura: number;
};

/**
 * Troca `{variavel}` pelo valor, em atributos e texto.
 *
 * Aceita conta simples dentro das chaves -- `{fracao * 100}`, `{largura - 4}`
 * -- porque uma barra que enche é `width="{fracao * largura}"`, e sem isso o
 * SVG precisaria de JS para a coisa mais básica que ele existe para fazer. A
 * conta é só número, variável e os quatro operadores, avaliada à mão: nada de
 * `eval`. O que não casa fica como está, para o autor ver o erro no desenho.
 */
export function preencher(no: NoSvg, variaveis: VariaveisDoMedidor): NoSvg {
  const trocar = (texto: string) =>
    texto.replace(/\{([^{}]+)\}/g, (inteiro, expressao: string) => {
      const valor = avaliar(expressao.trim(), variaveis);

      return valor === null ? inteiro : valor;
    });

  return {
    tag: no.tag,
    atributos: Object.fromEntries(
      Object.entries(no.atributos).map(([nome, valor]) => [nome, trocar(valor)]),
    ),
    filhos: no.filhos.map((filho) =>
      typeof filho === "string" ? trocar(filho) : preencher(filho, variaveis),
    ),
  };
}

/**
 * Uma expressão de quatro operações sobre as variáveis. `null` para o que não
 * é isso -- e o chamador deixa o texto original no lugar.
 */
function avaliar(expressao: string, variaveis: VariaveisDoMedidor): string | null {
  if (expressao === "cor") return variaveis.cor;

  const fichas = expressao.match(/\d+(?:\.\d+)?|[a-z]+|[-+*/()]/g);
  if (!fichas || fichas.join("") !== expressao.replace(/\s+/g, "")) return null;

  let posicao = 0;

  const primario = (): number | null => {
    const ficha = fichas[posicao++];
    if (ficha === undefined) return null;
    if (ficha === "(") {
      const dentro = soma();
      if (fichas[posicao++] !== ")") return null;
      return dentro;
    }
    if (ficha === "-") {
      const valor = primario();
      return valor === null ? null : -valor;
    }
    if (/^\d/.test(ficha)) return Number(ficha);
    if (ficha in variaveis && ficha !== "cor") return variaveis[ficha as keyof VariaveisDoMedidor] as number;

    return null;
  };

  const produto = (): number | null => {
    let valor = primario();
    while (valor !== null && (fichas[posicao] === "*" || fichas[posicao] === "/")) {
      const operador = fichas[posicao++];
      const direita = primario();
      if (direita === null) return null;
      valor = operador === "*" ? valor * direita : direita === 0 ? 0 : valor / direita;
    }
    return valor;
  };

  const soma = (): number | null => {
    let valor = produto();
    while (valor !== null && (fichas[posicao] === "+" || fichas[posicao] === "-")) {
      const operador = fichas[posicao++];
      const direita = produto();
      if (direita === null) return null;
      valor = operador === "+" ? valor + direita : valor - direita;
    }
    return valor;
  };

  const resultado = soma();
  if (resultado === null || posicao !== fichas.length || !Number.isFinite(resultado)) return null;

  // Três casas bastam para atributo de SVG, e cortam o `0.30000000000000004`.
  return String(Math.round(resultado * 1000) / 1000);
}

/**
 * Lê o texto de um `.svg` para a árvore filtrada. Só onde há `DOMParser` --
 * o Mestre. `null` para o que não é SVG ou não sobrou nada.
 */
export function lerModeloSvg(texto: string): NoSvg | null {
  if (typeof DOMParser === "undefined") return null;

  const documento = new DOMParser().parseFromString(texto, "image/svg+xml");
  const raiz = documento.documentElement;
  if (!raiz || raiz.tagName.toLowerCase() === "parsererror") return null;

  return filtrarSvg(deDom(raiz));
}

function deDom(elemento: Element): NoBruto {
  return {
    tag: elemento.tagName,
    atributos: Object.fromEntries(
      Array.from(elemento.attributes).map((atributo) => [atributo.name, atributo.value]),
    ),
    filhos: Array.from(elemento.childNodes).flatMap((no): Array<NoBruto | string> => {
      if (no.nodeType === 3) return [no.textContent ?? ""];
      if (no.nodeType === 1) return [deDom(no as Element)];

      return [];
    }),
  };
}
