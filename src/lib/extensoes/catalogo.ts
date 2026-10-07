import type { TextoDePlugin } from "@/lib/extensoes/texto";

/**
 * O catálogo de plugins: a vitrine do site, lida pela aba Catálogo da tela de
 * Plugins.
 *
 * Quem escreve a lista é o site (`next.ato20`, `public/plugins.json`), e o
 * aplicativo só lê. Fora do pacote de propósito: entrar na lista não pede
 * versão nova do ATO20, e a lista que a pessoa vê é a de hoje, e não a do dia
 * em que o pacote foi feito.
 *
 * Busca quando a aba abre, e uma vez por sessão: nada disso pesa na abertura
 * do Mestre, e quem nunca abre o catálogo não fala com a rede.
 */

/**
 * Onde a lista mora. A variável existe para testar contra o site local
 * (`pnpm dev` no `next.ato20`, porta 3011) antes de publicar a mudança lá.
 */
export const URL_DO_CATALOGO =
  process.env.NEXT_PUBLIC_CATALOGO_DE_PLUGINS ??
  "https://ato20.valbmig.com.br/plugins.json";

/** A forma do arquivo que este aplicativo lê. Espelho de `FORMATO` no site. */
export const FORMATO_DO_CATALOGO = 1;

export type PluginDoCatalogo = {
  id: string;
  nome: TextoDePlugin;
  descricao: TextoDePlugin;
  autor: string;
  repositorio: string;
  /** URL absoluta, já resolvida contra o endereço da lista. */
  icone: string | null;
  /** URL absoluta, 16:9. */
  capa: string | null;
  executaCodigo: boolean;
  apiVersao: number;
  tags: string[];
};

export type Catalogo =
  | { tipo: "lista"; plugins: PluginDoCatalogo[] }
  /** O site mudou a forma do arquivo, e este aplicativo é anterior a ela. */
  | { tipo: "formatoNovo" };

type Bruto = Record<string, unknown>;

function ehObjeto(valor: unknown): valor is Bruto {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function ehTexto(valor: unknown): valor is TextoDePlugin {
  if (typeof valor === "string") return valor.trim() !== "";

  return ehObjeto(valor) && Object.values(valor).some((cada) => typeof cada === "string");
}

/**
 * Uma imagem da lista, absoluta. O site escreve `/plugins/{id}/icone.png`,
 * relativo a ele, e a webview resolveria isso contra o PRÓPRIO endereço.
 * Só `http(s)`: o arquivo vem da rede, e um `file://` ali seria a lista
 * apontando para o disco de quem abre.
 */
function endereco(valor: unknown, base: string): string | null {
  if (typeof valor !== "string" || valor === "") return null;

  try {
    const url = new URL(valor, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Um plugin da lista, ou `null` quando ele não serve.
 *
 * Tolerante, ao contrário do build do site, que recusa a lista inteira: lá a
 * recusa chega a quem escreveu, e aqui chegaria a quem só queria ver os
 * plugins. Entrada estragada some, e as outras aparecem.
 *
 * Sem `executaCodigo`, o pior caso: o selo de código é o aviso de confiança, e
 * na dúvida ele aparece.
 */
function lerPlugin(item: unknown, base: string): PluginDoCatalogo | null {
  if (!ehObjeto(item)) return null;

  const { id, nome, descricao, autor, repositorio, apiVersao, tags } = item;

  if (typeof id !== "string" || id === "") return null;
  if (!ehTexto(nome)) return null;
  if (typeof autor !== "string") return null;
  // Só GitHub, e só https: o botão do card entrega este endereço ao navegador
  // do sistema, e ele vem da rede.
  if (typeof repositorio !== "string" || !repositorio.startsWith("https://github.com/")) {
    return null;
  }
  if (typeof apiVersao !== "number" || !Number.isInteger(apiVersao)) return null;

  return {
    id,
    nome,
    descricao: ehTexto(descricao) ? descricao : "",
    autor,
    repositorio,
    icone: endereco(item.icone, base),
    capa: endereco(item.capa, base),
    executaCodigo: item.executaCodigo !== false,
    apiVersao,
    tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string") : [],
  };
}

/** Lê o JSON do site. Lança quando nem a casca serve: isso é falha de rede ou de servidor, e não de entrada. */
export function lerCatalogo(bruto: unknown, base: string): Catalogo {
  if (!ehObjeto(bruto) || typeof bruto.formato !== "number" || !Array.isArray(bruto.plugins)) {
    throw new Error("catálogo ilegível");
  }
  if (bruto.formato !== FORMATO_DO_CATALOGO) return { tipo: "formatoNovo" };

  const vistos = new Set<string>();
  const plugins = bruto.plugins.flatMap((item) => {
    const plugin = lerPlugin(item, base);
    if (!plugin || vistos.has(plugin.id)) return [];

    vistos.add(plugin.id);
    return [plugin];
  });

  return { tipo: "lista", plugins };
}

let pedido: Promise<Catalogo> | null = null;
let lido: Catalogo | null = null;

/**
 * O catálogo, buscado uma vez por sessão. Falhou, esquece: o "tentar de novo"
 * precisa de um pedido novo, e não da mesma promessa rejeitada.
 *
 * Dez segundos de teto: sem rede, o `fetch` da webview pode esperar o tempo
 * que o sistema quiser, e a aba ficaria em "buscando" para sempre.
 */
export function buscarCatalogo(): Promise<Catalogo> {
  pedido ??= fetch(URL_DO_CATALOGO, { signal: AbortSignal.timeout(10_000) })
    .then((resposta) => {
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      return resposta.json();
    })
    .then((bruto) => (lido = lerCatalogo(bruto, URL_DO_CATALOGO)))
    .catch((causa) => {
      pedido = null;
      throw causa;
    });

  return pedido;
}

/** O que já voltou nesta sessão, para reabrir a aba sem passar por "buscando". */
export function catalogoJaLido(): Catalogo | null {
  return lido;
}
