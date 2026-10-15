import { semExtensao } from "@/lib/obsidian/caminhos";
import type { AssetKind } from "@/types/scene";

/**
 * O markdown de uma nota do Obsidian, reescrito no dialeto das notas do ATO20.
 *
 * O ATO20 lê uma linha por vez (ver `lib/markdown/linha.ts`) e não tem link de
 * nota para nota. Então:
 *
 * - `![[Poço.jpg|476]]` vira `/"Poço.jpg"|476`, a menção do arquivo do acervo.
 *   Sozinha na linha, ela já é a imagem na página, como no Obsidian.
 * - `[[Alvo|apelido]]` vira o texto `apelido`, e sem apelido, `Alvo`. O link
 *   se perde e o texto fica -- foi o escopo escolhido.
 * - O frontmatter vira linhas `**chave:** valor` no topo.
 * - O que o leitor do ATO20 não desenha vira o mais perto que ele desenha:
 *   h4 a h6 viram `###`, o callout vira citação com o título em negrito, e
 *   `==marca==` e `~~risco~~` ficam só com o texto.
 *
 * Tabela e cerca de código ficam como estão: viram texto linha a linha, e
 * nada do que está dentro da cerca é reescrito.
 */

/** O que um anexo virou no acervo: o nome com que a menção o acha. */
export type AnexoImportado = { nome: string; tipo: AssetKind };

export type ContextoDaNota = {
  /** O caminho do arquivo para onde o link aponta, ou `null`. */
  resolver: (alvo: string, deOnde: string) => string | null;
  /** O anexo já importado naquele caminho, ou `null` se o caminho é nota. */
  anexo: (caminho: string) => AnexoImportado | null;
};

/**
 * A menção de um arquivo do acervo, com aspas só quando o nome precisa --
 * espaço, ou pontuação no fim, que o leitor tiraria do nome. É o que o editor
 * escreve ao soltar um arquivo na nota.
 *
 * Nome com aspas não cabe numa menção: volta `null`, e quem chama escreve o
 * nome como texto.
 */
export function mencaoDoArquivo(nome: string): string | null {
  if (nome.includes('"')) return null;

  return /\s|[.,;:!?)\]}]$/u.test(nome) ? `/"${nome}"` : `/${nome}`;
}

/** O alvo, o trecho depois do `#` e os parâmetros depois do `|`. */
function partesDoLink(dentro: string): { alvo: string; parametros: string[] } {
  const [antes, ...parametros] = dentro.split("|");
  const alvo = (antes ?? "").split("#")[0]!.trim();
  return { alvo, parametros };
}

/** A largura do `|476` ou do `|476x300`, no teto de quatro dígitos do ATO20. */
function larguraDe(parametros: readonly string[]): number | undefined {
  for (const parametro of parametros) {
    const casou = /^\s*(\d+)(?:x\d+)?\s*$/u.exec(parametro);
    if (casou) return Math.min(Number(casou[1]), 9999);
  }
  return undefined;
}

/** O texto que um link vira quando não aponta para nada que o ATO20 mostre. */
function textoDoLink(dentro: string): string {
  const [antes, ...parametros] = dentro.split("|");
  const apelido = parametros.find((parametro) => !/^\s*\d+(?:x\d+)?\s*$/u.test(parametro));
  if (apelido?.trim()) return apelido.trim();

  const [alvo, secao] = (antes ?? "").split("#");
  if (alvo?.trim()) return semExtensao(alvo.trim());
  return (secao ?? "").replace(/^\^/u, "").trim();
}

/**
 * Marca onde começa e onde termina uma prévia dentro da linha, enquanto ela é
 * reescrita. Um caractere de controle, que nenhuma nota digita. Ver
 * `separarPrevias`.
 */
const PREVIA = "\u0001";

/**
 * Um embed ou uma imagem local: a menção, se o alvo é imagem ou som do
 * acervo, ou o texto do link. A menção sai marcada, para `separarPrevias`
 * decidir se ela fica na linha ou desce para uma só dela.
 */
function embed(
  alvo: string,
  largura: number | undefined,
  textoSenao: string,
  deOnde: string,
  contexto: ContextoDaNota,
): string {
  const caminho = contexto.resolver(alvo, deOnde);
  const anexo = caminho ? contexto.anexo(caminho) : null;

  // Só imagem e som: são os que a menção `/` resolve. PDF e vídeo ficam com
  // o nome, que ainda diz ao mestre o que estava ali.
  if (anexo && (anexo.tipo === "image" || anexo.tipo === "audio")) {
    const mencao = mencaoDoArquivo(anexo.nome);
    if (mencao)
      return `${PREVIA}${largura && anexo.tipo === "image" ? `${mencao}|${largura}` : mencao}${PREVIA}`;
  }

  return textoSenao;
}

/** O `%20` do endereço vira espaço; um `%` solto, que não decodifica, fica. */
function decodificar(endereco: string): string {
  try {
    return decodeURI(endereco);
  } catch {
    return endereco;
  }
}

/** Uma linha fora da cerca de código. */
function converterLinha(linha: string, deOnde: string, contexto: ContextoDaNota): string {
  let saida = linha;

  // Callout: `> [!aviso]- Título` vira `> **Título**`, ou o tipo sem título.
  saida = saida.replace(
    /^((?:>\s*)+)\[!([^\]]+)\][+-]?\s*(.*)$/u,
    (_, citacao: string, tipo: string, titulo: string) =>
      `${citacao.trimEnd()} **${titulo.trim() || tipo.trim()}**`,
  );

  // h4 a h6 viram h3: o leitor só tem três níveis.
  saida = saida.replace(/^#{4,6}(\s)/u, "###$1");

  // `![[...]]` antes de `[[...]]`: o embed contém o link.
  saida = saida.replace(/!\[\[([^\]]+)\]\]/gu, (_, dentro: string) => {
    const { alvo, parametros } = partesDoLink(dentro);
    return embed(alvo, larguraDe(parametros), textoDoLink(dentro), deOnde, contexto);
  });

  saida = saida.replace(/\[\[([^\]]+)\]\]/gu, (_, dentro: string) => textoDoLink(dentro));

  // `![alt|476](imagem.png)`: a imagem em markdown. Externa vira link, que o
  // leitor abre no navegador; local vira a menção, como o embed.
  saida = saida.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu,
    (_, alt: string, endereco: string) => {
      const [descricao, ...parametros] = alt.split("|");
      if (/^https?:\/\//iu.test(endereco)) return `[${descricao?.trim() || endereco}](${endereco})`;

      const alvo = decodificar(endereco.replace(/^<|>$/gu, ""));
      return embed(alvo, larguraDe(parametros), descricao?.trim() || semExtensao(alvo), deOnde, contexto);
    },
  );

  // `[texto](Outra nota.md)`: link local para nota não tem destino, fica o texto.
  saida = saida.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/gu,
    (inteiro, texto: string, endereco: string) =>
      /^[a-z][a-z0-9+.-]*:/iu.test(endereco) ? inteiro : texto,
  );

  saida = saida.replace(/==([^=]+)==/gu, "$1").replace(/~~([^~]+)~~/gu, "$1");

  // O `^id` de bloco no fim da linha é endereço interno do Obsidian.
  saida = saida.replace(/\s\^[A-Za-z0-9-]+$/u, "");

  return separarPrevias(saida);
}

/**
 * Onde cada prévia fica.
 *
 * No Obsidian o `![[foto.jpg]]` é a imagem em qualquer lugar da linha, até
 * colado na palavra: `trabalham![[DANB.jpg]]`. No ATO20 a imagem é a linha que
 * só tem a menção, e a menção só abre no começo ou depois de espaço -- colada,
 * ela seria o texto `trabalham/DANB.jpg`. Então a prévia que divide a linha
 * com texto desce para uma linha só dela, entre o texto de antes e o de
 * depois.
 *
 * Fica na linha quando a linha é só prévias (uma é a imagem, várias são a
 * galeria) ou quando o que vem antes é só o marcador de uma lista ou de uma
 * citação: ali ela vira o chip no item, e o item não se parte em dois.
 */
function separarPrevias(linha: string): string {
  if (!linha.includes(PREVIA)) return linha;

  const pedacos = linha.split(PREVIA);
  const textos = pedacos.filter((_, indice) => indice % 2 === 0);

  if (textos.every((texto) => !texto.trim()))
    return pedacos.filter((_, indice) => indice % 2 === 1).join(" ");

  const soMarcador = /^\s*(?:[-*+]|\d+[.)]|>)\s*$/u;
  if (pedacos.length === 3 && soMarcador.test(pedacos[0]!) && !pedacos[2]!.trim())
    return pedacos.join("");

  return pedacos
    .map((pedaco, indice) =>
      indice % 2 === 1 ? pedaco : indice === 0 ? pedaco.trimEnd() : pedaco.trim(),
    )
    .filter(Boolean)
    .join("\n");
}

/** O valor de uma linha de YAML, sem aspas e sem colchete de lista. */
function valorDoYaml(valor: string): string {
  const limpo = valor.trim().replace(/^(["'])(.*)\1$/u, "$2");
  const lista = /^\[(.*)\]$/u.exec(limpo);
  if (!lista) return limpo;

  return lista[1]!
    .split(",")
    .map((item) => item.trim().replace(/^(["'])(.*)\1$/u, "$2"))
    .filter(Boolean)
    .join(", ");
}

/**
 * O frontmatter vira linhas legíveis no topo da nota. Só o YAML de chave e
 * valor e a lista com `-`; o resto fica como veio.
 */
function semFrontmatter(linhas: string[]): string[] {
  if (linhas[0]?.trim() !== "---") return linhas;

  const fim = linhas.findIndex((linha, indice) => indice > 0 && /^(---|\.\.\.)\s*$/u.test(linha));
  if (fim < 0) return linhas;

  const convertidas = linhas.slice(1, fim).flatMap((linha) => {
    if (!linha.trim()) return [];

    const item = /^\s*-\s+(.*)$/u.exec(linha);
    if (item) return [`- ${valorDoYaml(item[1]!)}`];

    const par = /^([^\s:#][^:]*):\s*(.*)$/u.exec(linha);
    if (!par) return [linha];

    const valor = valorDoYaml(par[2]!);
    return [valor ? `**${par[1]!.trim()}:** ${valor}` : `**${par[1]!.trim()}:**`];
  });

  const resto = linhas.slice(fim + 1);
  const separa = convertidas.length > 0 && resto[0]?.trim() ? [""] : [];

  return [...convertidas, ...separa, ...resto];
}

/** A nota inteira. `deOnde` é o caminho dela, para os links relativos. */
export function converterNota(texto: string, deOnde: string, contexto: ContextoDaNota): string {
  // O comentário `%% ... %%` é do Obsidian e não aparece lá: também não aqui.
  const semComentario = texto.replace(/\r\n?/gu, "\n").replace(/%%[\s\S]*?%%/gu, "");

  let naCerca = false;

  return semFrontmatter(semComentario.split("\n"))
    .map((linha) => {
      if (/^\s*(```|~~~)/u.test(linha)) {
        naCerca = !naCerca;
        return linha;
      }
      return naCerca ? linha : converterLinha(linha, deOnde, contexto);
    })
    .join("\n");
}
