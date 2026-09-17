"use client";

import { open } from "@tauri-apps/plugin-dialog";

import { call, daemonAddr } from "@/lib/vault/bridge";

/**
 * A estante: os livros de regras desta máquina.
 *
 * Fora da campanha de propósito, e é a diferença que explica este arquivo
 * existir ao lado de `assets.ts`. O manual de um SISTEMA serve todas as mesas
 * daquele sistema — guardado dentro de uma campanha, o mesmo PDF de oitenta
 * megabytes seria copiado uma vez por mesa e viajaria em cada zip exportado.
 *
 * A consequência boa é que o livro abre com a mesa FECHADA: o mestre consulta
 * uma regra na porta do aplicativo, antes de escolher a campanha da noite. Ver
 * `estante.rs` e a rota `/livro/{id}` no Rust.
 */

/** Um livro na estante. */
export type Livro = {
  id: string;
  titulo: string;
  /** O nome do arquivo escolhido, para a tela dizer de onde ele veio. */
  arquivo: string;
  tamanho: number;
  /**
   * Quantas páginas o documento tem.
   *
   * `null` entre a importação e a primeira abertura: quem conta as páginas é o
   * leitor, na tela — o Rust copia o arquivo sem abri-lo. A lista mostra o
   * livro sem o total em vez de esconder o livro.
   */
  paginas: number | null;
  /** Onde o mestre parou. Conta de 1, como página de livro. */
  pagina: number;
  abertoEm: number;
};

/** Um marcador de página: a página que UMA campanha quer neste livro. */
export type Marcador = {
  id: string;
  livroId: string;
  pagina: number;
  rotulo: string;
  criadoEm: number;
};

/** O que a importação devolve: o que entrou e o que ficou de fora. */
export type EstanteImport = {
  aceitos: Livro[];
  recusados: string[];
};

export function listarLivros(): Promise<Livro[]> {
  return call<Livro[]>("estante_list");
}

/**
 * Abre o diálogo nativo e traz os PDFs escolhidos para a estante.
 *
 * `null` quando o mestre cancelou — diferente de uma lista vazia, que seria
 * "escolheu e nada entrou". Mesmo contrato de `importAssets`.
 *
 * Só PDF no filtro, e o Rust recusa de novo na entrada: o leitor é pdf.js, e um
 * EPUB aceito aqui daria um livro na estante que não abre.
 */
export async function importarLivros(): Promise<EstanteImport | null> {
  const escolhidos = await open({
    multiple: true,
    title: "Escolha os livros de regras",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (!escolhidos) return null;

  const paths = Array.isArray(escolhidos) ? escolhidos : [escolhidos];
  if (paths.length === 0) return null;

  return importarLivrosDe(paths);
}

/**
 * Traz PDFs para a estante por CAMINHO, sem diálogo.
 *
 * É o que o arquivo solto na porta usa: o sistema já entregou os caminhos, e
 * abrir um seletor para confirmar o que a mão acabou de largar seria perguntar
 * duas vezes. O diálogo acima desagua aqui.
 */
export function importarLivrosDe(paths: string[]): Promise<EstanteImport> {
  return call<EstanteImport>("estante_import", { paths });
}

/**
 * Marca onde o mestre parou.
 *
 * `paginas` vai preenchido na PRIMEIRA marcação de cada abertura, quando o
 * leitor já contou o documento, e ausente nas seguintes: o Rust usa um
 * `coalesce`, então mandar o total em cada virada de página só repetiria a
 * mesma escrita.
 */
export function marcarPagina(id: string, pagina: number, paginas?: number): Promise<void> {
  return call("estante_pagina", { id, pagina, paginas: paginas ?? null });
}

export function removerLivro(id: string): Promise<void> {
  return call("estante_remover", { id });
}

/**
 * Abre o PDF no programa da máquina, fora do aplicativo.
 *
 * É o clique da estante na porta: ali não há campanha aberta, e montar o leitor
 * fora da mesa é outra feature. O leitor interno continua sendo o da janela
 * Estante, dentro da mesa.
 */
export function abrirLivroNoSistema(id: string): Promise<void> {
  return call("estante_abrir", { id });
}

/**
 * Os marcadores da campanha aberta neste livro.
 *
 * Falha com `sem-campanha` quando não há mesa aberta, e isso é o contrato: o
 * livro continua abrindo e sendo lido, e é a tira de marcadores que diz que
 * marcar página pede uma campanha. Ver `isNoCampaign`.
 */
export function listarMarcadores(livroId: string): Promise<Marcador[]> {
  return call<Marcador[]>("marcador_list", { livroId });
}

/** Marca a página atual. Devolve o marcador criado, já com id e rótulo. */
export function marcar(livroId: string, pagina: number, rotulo: string): Promise<Marcador> {
  return call<Marcador>("marcador_add", { livroId, pagina, rotulo });
}

export function renomearMarcador(id: string, rotulo: string): Promise<void> {
  return call("marcador_rotulo", { id, rotulo });
}

export function removerMarcador(id: string): Promise<void> {
  return call("marcador_remover", { id });
}

/**
 * Onde o leitor busca os bytes de um livro, e com que cabeçalho.
 *
 * COM token, ao contrário de `/asset/{id}`. A diferença não é de risco de
 * escrita, é de PÚBLICO: a rota do acervo é aberta porque a TV precisa dela, e
 * o material da cena é justamente o que a mesa tem de ver. Um manual de regras
 * é do mestre, e a porta do daemon está na rede local.
 *
 * Devolve o par pronto para o `getDocument` do pdf.js — ele repassa os
 * cabeçalhos em cada pedido de Range, que é o que faz a página 214 de um manual
 * de trezentas abrir sem baixar as outras.
 */
export async function livroFonte(id: string): Promise<{
  url: string;
  httpHeaders: Record<string, string>;
}> {
  const { url, token } = await daemonAddr();

  return { url: `${url}/livro/${id}`, httpHeaders: { "x-ato20-token": token } };
}
