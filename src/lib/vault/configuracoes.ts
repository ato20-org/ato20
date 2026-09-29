"use client";

import { call } from "@/lib/vault/bridge";

/**
 * O `configuracoes.json` de cada escopo, pelo IPC.
 *
 * O objeto inteiro, nos dois sentidos: quem sabe o que vale é a tela (ver
 * `lib/configuracoes/registro.ts`), e o Rust só lê e grava um JSON opaco. Ver
 * `configuracoes.rs`.
 */

export type Escopo = "maquina" | "campanha";

export function lerConfiguracoes(escopo: Escopo): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>("configuracoes_ler", { escopo });
}

export function gravarConfiguracoes(
  escopo: Escopo,
  valor: Record<string, unknown>,
): Promise<void> {
  return call<void>("configuracoes_gravar", { escopo, valor });
}

/** Abre o arquivo no editor da máquina, como o "Open Settings (JSON)". */
export function abrirArquivoDeConfiguracoes(escopo: Escopo): Promise<void> {
  return call<void>("configuracoes_abrir_arquivo", { escopo });
}
