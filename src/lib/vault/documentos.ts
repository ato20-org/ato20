"use client";

import { call, daemonAddr, isDesktop } from "@/lib/vault/bridge";

/**
 * Os documentos do quadro: arquivos `.md` em `documentos/` na campanha.
 *
 * Só o mestre escreve, pela ponte. A mesa lê pelo daemon, em `/documento/`,
 * como lê os arquivos do acervo -- ver `documentoUrl`.
 */

/** Cria um arquivo vazio e devolve o nome dele, tirado do título. */
export function criarDocumento(titulo: string): Promise<string> {
  return call<string>("documento_create", { titulo });
}

export function lerDocumento(arquivo: string): Promise<string> {
  return call<string>("documento_read", { arquivo });
}

export function gravarDocumento(arquivo: string, texto: string): Promise<void> {
  return call("documento_write", { arquivo, texto });
}

export function apagarDocumento(arquivo: string): Promise<void> {
  return call("documento_delete", { arquivo });
}

/** A URL pela qual a mesa lê o texto. Relativa fora do desktop, como o asset. */
export async function documentoUrl(arquivo: string): Promise<string> {
  const caminho = `/documento/${encodeURIComponent(arquivo)}`;
  if (!isDesktop()) return caminho;
  const { url } = await daemonAddr();
  return `${url}${caminho}`;
}
