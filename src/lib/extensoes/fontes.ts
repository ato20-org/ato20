/**
 * As fontes de retrato ao vivo, sem nada do aplicativo em volta.
 *
 * Módulo PURO e separado de `manifesto.ts` por causa do bundle: aquele importa
 * o diálogo nativo do Tauri, e estas funções são usadas por
 * `geometry/portrait.ts` — que o Jogador e o Espectador carregam. Juntos, o
 * celular de cada jogador baixaria o seletor de arquivos do sistema para
 * resolver uma interpolação de string.
 *
 * É a mesma razão que mantém a lógica de geometria fora dos componentes.
 */

/**
 * Uma fonte de retrato ao vivo: como montar a URL de um serviço, e em que
 * tamanho a página dele foi desenhada.
 *
 * Declarativa, sem uma linha de JS, e é o que ela tem de melhor: o que varia
 * entre um serviço e outro é um molde de URL e duas medidas.
 *
 * `largura` e `altura` são o que separa isto de "cole um link". Página de
 * overlay é desenhada para o canvas do OBS e tem layout de pixel FIXO — medido
 * no C.R.I.S.: pontos de quebra em 1023, 1260 e 1280, e a 420px de largura
 * aparece só um canto do card. Então o quadro renderiza no tamanho de projeto e
 * a tela o ESCALA para caber no retrato, que é o que o OBS faz.
 *
 * Espelho de `extensoes::FonteRetrato`, que é quem valida.
 */
export type FonteRetrato = {
  fonte: string;
  rotulo: string;
  /** O molde da URL, com `{codigo}` onde entra o que o mestre cola. */
  modelo: string;
  /** O nome do campo que o mestre preenche — "Código do agente". */
  campo: string;
  largura: number;
  altura: number;
  exemplo: string | null;
};

/**
 * O canvas de quem não declarou nenhum.
 *
 * Existe para a URL colada à mão, sem extensão nenhuma instalada: 1920×1080 é o
 * canvas de OBS, que é o que uma página de overlay quase sempre assume.
 */
export const CANVAS_PADRAO = { largura: 1920, altura: 1080 };

/**
 * As fontes que as extensões HABILITADAS oferecem.
 *
 * Desabilitar a extensão tira a fonte do menu, e é o que se espera — mas NÃO
 * apaga a URL já gravada na ficha: ela é a URL inteira, e continua desenhando.
 * O que se perde é o atalho de montar outra.
 */
export function fontesDeRetrato(
  // Forma estrutural, e nao o tipo `Extensao`: importa-lo aqui fecharia um
  // ciclo com `manifesto.ts`, que reexporta este arquivo.
  extensoes: ReadonlyArray<{ habilitada: boolean; retratos?: FonteRetrato[] }>,
): FonteRetrato[] {
  return extensoes
    .filter((extensao) => extensao.habilitada)
    .flatMap((extensao) => extensao.retratos ?? []);
}

/** Monta a URL de um código, pelo molde da fonte. */
export function urlDaFonte(fonte: FonteRetrato, codigo: string): string {
  return fonte.modelo.replace("{codigo}", encodeURIComponent(codigo.trim()));
}

/**
 * De que fonte veio esta URL, se de alguma.
 *
 * Compara pelo pedaço FIXO do molde — o que vem antes do `{codigo}`. Bastaria
 * comparar o domínio, mas duas fontes do mesmo serviço (retrato e barra de
 * vida, digamos) teriam o mesmo domínio e canvas diferentes.
 *
 * Serve a duas perguntas: que canvas usar ao desenhar, e que rótulo mostrar na
 * ficha para o mestre reconhecer o que colou.
 */
export function fonteDaUrl(
  url: string,
  fontes: FonteRetrato[],
): FonteRetrato | null {
  const prefixos = fontes
    .map((fonte) => ({ fonte, prefixo: fonte.modelo.split("{codigo}")[0] }))
    // Mais específico primeiro: `.../stream/` tem de ganhar de `.../`.
    .sort((a, b) => b.prefixo.length - a.prefixo.length);

  return prefixos.find(({ prefixo }) => url.startsWith(prefixo))?.fonte ?? null;
}

/** O canvas em que esta URL deve ser renderizada. */
export function canvasDaUrl(
  url: string,
  fontes: FonteRetrato[],
): { largura: number; altura: number } {
  const fonte = fonteDaUrl(url, fontes);

  return fonte
    ? { largura: fonte.largura, altura: fonte.altura }
    : CANVAS_PADRAO;
}

/** Uma extensão instalada: o que ela diz de si, mais o que a máquina decidiu. */
