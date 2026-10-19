"use client";

import type { TextoDePlugin } from "@/lib/extensoes/texto";
import { call } from "@/lib/vault/bridge";
import type { Personagem } from "@/types/character";

/**
 * O bestiário dos plugins: as fichas prontas que um plugin traz para o
 * Compêndio. Só de leitura -- trazer COPIA a ficha para a campanha, e é a cópia
 * que se edita. Ver `bestiario.rs` e `compendio::trazer_do_plugin`.
 */

/** Um motivo nos dois idiomas, como o Rust manda. Ver `error::Texto`. */
export type MotivoDoRust = { pt: string; en: string };

/** Uma ficha, como o card a mostra. Espelho de `bestiario::Resumo`. */
export type FichaDoPlugin = {
  id: string;
  nome: string;
  tags: string[];
  fonte?: string | null;
  /** O arquivo da pasta do plugin que o card desenha. Ver `imagemDoBestiario`. */
  imagem?: string | null;
  /** O id da aura do card, do mesmo plugin: a da ficha, ou a da coleção. */
  aura?: string | null;
};

/** Uma coleção de um plugin ligado. Espelho de `bestiario::Listada`. */
export type ColecaoDoPlugin = {
  extensao: string;
  id: string;
  titulo: TextoDePlugin;
  sistema?: string | null;
  /** O id da aura da pasta da coleção, do mesmo plugin. */
  aura?: string | null;
  fichas: FichaDoPlugin[];
  /** O arquivo que quebrou depois de instalado. As outras coleções seguem. */
  erro?: MotivoDoRust | null;
};

type ListadaNoRust = Omit<ColecaoDoPlugin, "fichas"> & { moldes: FichaDoPlugin[] };

/** As coleções dos plugins ligados. Não depende de campanha aberta. */
export async function listarBestiarioDosPlugins(): Promise<ColecaoDoPlugin[]> {
  const listadas = await call<ListadaNoRust[]>("bestiario_listar");

  return listadas.map(({ moldes, ...colecao }) => ({ ...colecao, fichas: moldes }));
}

/**
 * A miniatura de uma imagem da pasta do plugin, como blob. Quem pede revoga.
 * Blob, e não o protocolo do plugin, pela razão do Compêndio do ATO20: no
 * Mestre de desenvolvimento a página não alcança `ato20-ext://`.
 */
export async function imagemDoBestiario(extensaoId: string, caminho: string): Promise<string> {
  const bytes = await call<ArrayBuffer>("bestiario_imagem", { extensaoId, caminho });

  return URL.createObjectURL(new Blob([bytes]));
}

/** O que voltou de trazer uma ficha. Espelho de `compendio::TrazidoDoPlugin`. */
export type TrazidoDoPlugin = {
  /** O molde no Compêndio da campanha. */
  molde: Personagem;
  /** Já estava lá: trazer de novo devolve o mesmo. */
  jaHavia: boolean;
  /** Os grupos que não couberam no molde da campanha. */
  gruposDeFora: string[];
  /** As imagens que não vieram, com o motivo. A ficha entrou sem elas. */
  imagensDeFora: MotivoDoRust[];
};

/** Qual ficha, de qual coleção, de qual plugin. */
export type QualFicha = { extensaoId: string; colecaoId: string; moldeId: string };

/** A ficha entra no Compêndio da campanha, como molde. */
export function trazerDoBestiario(ficha: QualFicha): Promise<TrazidoDoPlugin> {
  return call<TrazidoDoPlugin>("bestiario_trazer", ficha);
}

/**
 * A ficha entra em jogo: sai do molde que ela deixou na campanha, trazido
 * agora se ainda não estava. Volta o molde e o personagem novo.
 */
export function porEmJogoDoBestiario(
  ficha: QualFicha,
): Promise<{ trazido: TrazidoDoPlugin; personagem: Personagem }> {
  return call<{ trazido: TrazidoDoPlugin; personagem: Personagem }>("bestiario_por_em_jogo", ficha);
}
