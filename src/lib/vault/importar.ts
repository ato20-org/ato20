"use client";

import { call } from "@/lib/vault/bridge";

/** Um `.md` ou um `.canvas`: o caminho relativo, com `/`, e o texto. */
export type ArquivoDeFora = { caminho: string; texto: string };

/** Imagem, som, vídeo ou PDF. */
export type AnexoDeFora = { caminho: string; absoluto: string };

/** O que se escolheu importar, lido e separado pelo Rust. Ver `src-tauri/src/importar.rs`. */
export type LeituraDeFora = {
  /** O nome da pasta escolhida. Vazio para arquivos soltos, que entram na raiz. */
  nome: string;
  /** A pasta tem `.obsidian`. */
  obsidian: boolean;
  notas: ArquivoDeFora[];
  boards: ArquivoDeFora[];
  anexos: AnexoDeFora[];
  ignorados: string[];
};

/** Lê uma pasta de notas ou um vault do Obsidian. Só lê. */
export function lerPasta(pasta: string): Promise<LeituraDeFora> {
  return call<LeituraDeFora>("importar_ler_pasta", { pasta });
}

/** Lê arquivos soltos. Só lê. */
export function lerArquivos(caminhos: string[]): Promise<LeituraDeFora> {
  return call<LeituraDeFora>("importar_ler_arquivos", { caminhos });
}

/** O que um caminho arrastado do sistema é. */
export type IdentidadeDeFora = {
  caminho: string;
  nome: string;
  tipo: "pasta" | "vault" | "arquivo";
};

/** Diz o que cada caminho é, sem ler nada dentro. Para o rótulo do arrasto. */
export function identificar(caminhos: string[]): Promise<IdentidadeDeFora[]> {
  return call<IdentidadeDeFora[]>("importar_identificar", { caminhos });
}
