/**
 * O idioma da interface, decidido UMA vez, na carga do módulo.
 *
 * O texto é constante enquanto a tela vive: `t.cenas.nova` é a leitura de um
 * campo de objeto, sem hook, sem context e sem assinatura de store. Trocar de
 * idioma recarrega a tela, e isso é a regra inteira. Um store reativo poria
 * uma assinatura em cada componente que tem texto -- quase todos -- para uma
 * ação que o mestre faz uma vez na vida, e o palco paga cada assinatura a cada
 * quadro em que alguma coisa acorda.
 *
 * Decidir na carga do módulo é o que deixa o idioma valer também fora do
 * React: toasts disparados de `lib/`, as definições de configuração declaradas
 * no `import`, os nomes que a campanha grava ("Cena 1"). Por isso o idioma
 * precisa ser conhecido de forma SÍNCRONA, e cada tela tem de onde lê-lo sem
 * esperar IPC nem rede -- ver `decidir`.
 *
 * Sem dependência de nada do aplicativo: o celular e a TV importam isto, e um
 * import do vault arrastaria o bridge do Tauri para tela que não tem Tauri.
 */

export const IDIOMAS = ["pt-BR", "en"] as const;

export type Idioma = (typeof IDIOMAS)[number];

/**
 * O que o mestre escolhe em Configurações. `sistema` segue o idioma do sistema
 * operacional, e é o padrão: quem instala num Windows em inglês já abre em
 * inglês, sem procurar a chave num idioma que não lê.
 */
export const ESCOLHAS_DE_IDIOMA = ["sistema", ...IDIOMAS] as const;

export type EscolhaDeIdioma = (typeof ESCOLHAS_DE_IDIOMA)[number];

/**
 * O nome de cada idioma escrito nele mesmo. Nunca traduzido: quem não lê
 * português procura "English", e não "Inglês".
 */
export const NOME_DO_IDIOMA: Record<Idioma, string> = {
  "pt-BR": "Português (Brasil)",
  en: "English",
};

/**
 * A chave do Mestre, no registro de configurações e no espelho do
 * `localStorage`. O arquivo é a verdade; o espelho existe porque o arquivo
 * chega por IPC, depois do primeiro quadro -- o mesmo par do zoom.
 */
export const CHAVE_DO_MESTRE = "ato20.idioma";

/**
 * A escolha do jogador, guardada no celular dele. Chave própria porque o
 * celular pode abrir a mesa pela mesma origem da máquina do mestre (o
 * navegador do notebook, testando), e a escolha de um não deve virar a do
 * outro.
 */
export const CHAVE_DO_JOGADOR = "ato20.idioma.jogador";

/** O parâmetro da URL do convite e do espectador: `?codigo=X&idioma=en`. */
export const PARAMETRO_DE_IDIOMA = "idioma";

/** Qual tela está rodando. Cada uma decide o idioma por uma regra. */
export type Tela = "mestre" | "jogador" | "espectador";

/** Um idioma conhecido a partir de um código qualquer: `en-US`, `pt`, `PT-br`. */
export function normalizar(bruto: unknown): Idioma | null {
  if (typeof bruto !== "string") return null;

  const codigo = bruto.trim().toLowerCase();
  if (codigo.startsWith("pt")) return "pt-BR";
  if (codigo.startsWith("en")) return "en";

  return null;
}

/**
 * O idioma do sistema, pela lista de preferência do navegador.
 *
 * O primeiro que o aplicativo fala vence. Ninguém da lista falamos, inglês: um
 * espanhol ou um alemão lê inglês com mais chance do que português.
 */
export function doSistema(linguas: readonly string[]): Idioma {
  for (const lingua of linguas) {
    const conhecido = normalizar(lingua);
    if (conhecido) return conhecido;
  }

  return "en";
}

/** A escolha do mestre virada idioma. `sistema` pergunta ao sistema. */
export function resolverEscolha(
  escolha: EscolhaDeIdioma,
  linguas: readonly string[],
): Idioma {
  return escolha === "sistema" ? doSistema(linguas) : escolha;
}

/** A escolha gravada, se for uma que existe. Lixo vale `null`. */
export function lerEscolha(bruto: unknown): EscolhaDeIdioma | null {
  return ESCOLHAS_DE_IDIOMA.find((escolha) => escolha === bruto) ?? null;
}

/** A tela pelo caminho. O Mestre é a raiz, e tudo que não é as outras duas. */
export function telaDe(caminho: string): Tela {
  if (caminho.startsWith("/jogador")) return "jogador";
  if (caminho.startsWith("/espectador")) return "espectador";

  return "mestre";
}

/**
 * A regra de cada tela, do que vence para o que perde.
 *
 * - **Espectador**: a URL, sempre. A TV mostra a mesa do mestre e não tem
 *   quem escolha nada nela; o idioma vem no link que o Mestre abre, e quando o
 *   mestre troca, o quadro avisa e ela recarrega no novo.
 * - **Jogador**: o que ELE escolheu no celular, depois a URL do convite, que
 *   traz o idioma do mestre. Um jogador de fora numa mesa brasileira troca uma
 *   vez e o celular lembra.
 * - **Mestre**: o espelho da configuração, e o sistema na primeira abertura.
 */
export function decidir({
  tela,
  daUrl,
  salvo,
  linguas,
}: {
  tela: Tela;
  daUrl: string | null;
  salvo: string | null;
  linguas: readonly string[];
}): Idioma {
  const url = normalizar(daUrl);

  switch (tela) {
    case "espectador":
      return url ?? doSistema(linguas);
    case "jogador":
      return normalizar(salvo) ?? url ?? doSistema(linguas);
    case "mestre":
      return resolverEscolha(lerEscolha(salvo) ?? "sistema", linguas);
  }
}

/** `localStorage` pode não existir, ou recusar: modo privado, cota, sandbox. */
function lerSalvo(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function detectar(): Idioma {
  // O `next build` pré-renderiza as páginas, e lá não há janela. Português é
  // o que o HTML estático leva; quem pré-renderiza texto visível tem de
  // contar com isso -- ver `suppressHydrationWarning` no splash do Mestre.
  //
  // Num worker também não há janela, mas o `typeof window` não avisa: o
  // Turbopack troca por constante no pacote do cliente, e o worker é pacote do
  // cliente. Daí o `document` lido de verdade -- sem ele, o forno do fogo
  // morria na carga, calado, e nenhuma condição desenhava (1.2.0).
  if (typeof window === "undefined" || !("document" in globalThis)) return "pt-BR";

  const tela = telaDe(location.pathname);
  const idioma = decidir({
    tela,
    daUrl: new URLSearchParams(location.search).get(PARAMETRO_DE_IDIOMA),
    salvo: lerSalvo(tela === "jogador" ? CHAVE_DO_JOGADOR : CHAVE_DO_MESTRE),
    linguas: navigator.languages?.length ? navigator.languages : [navigator.language],
  });

  // O `lang` do documento acompanha: leitor de tela pronuncia pelo `lang`, e a
  // hifenização do CSS também. O layout traz `pt-BR` do build.
  document.documentElement.lang = idioma;

  return idioma;
}

/** O idioma desta tela, até ela recarregar. */
export const idioma: Idioma = detectar();

/**
 * O dicionário do idioma ativo.
 *
 * Cada área de texto declara o português, o inglês tipado pelo português (chave
 * faltando quebra o `tsc`), e exporta `escolher({ "pt-BR": pt, en })`.
 */
export function escolher<T>(dicionarios: Record<Idioma, T>): T {
  return dicionarios[idioma];
}
