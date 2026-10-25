"use client";

import type { TextoDePlugin } from "@/lib/extensoes/texto";
import type { MotivoDoRust } from "@/lib/vault/bestiario";
import { call } from "@/lib/vault/bridge";
import type { AtributoDoItem, Item } from "@/types/inventory";

/**
 * Os itens dos plugins: as armas, as proteções e o resto que um plugin traz
 * pronto para o Compêndio. Só de leitura, como o bestiário -- trazer COPIA o
 * item para a campanha, e é a cópia que se edita. A imagem do card vem por
 * `imagemDoBestiario`, que serve qualquer imagem da pasta do plugin. Ver
 * `itens_do_plugin.rs` e `compendio::trazer_item_do_plugin`.
 */

/** Um item, como o card o mostra. Espelho de `itens_do_plugin::Resumo`. */
export type ItemDoPlugin = {
  id: string;
  nome: string;
  tags: string[];
  fonte?: string | null;
  /** O arquivo da pasta do plugin que o card desenha. */
  imagem?: string | null;
  /** O id da aura do card, do mesmo plugin: a do item, ou a da coleção. */
  aura?: string | null;
  /** Os pares do item, na ordem dele. O card mostra os dois primeiros. */
  atributos: AtributoDoItem[];
};

/** Uma coleção de itens de um plugin ligado. Espelho de `itens_do_plugin::Listada`. */
export type ColecaoDeItensDoPlugin = {
  extensao: string;
  id: string;
  titulo: TextoDePlugin;
  sistema?: string | null;
  /** O id da aura da pasta da coleção, do mesmo plugin. */
  aura?: string | null;
  itens: ItemDoPlugin[];
  /** O arquivo que quebrou depois de instalado. As outras coleções seguem. */
  erro?: MotivoDoRust | null;
};

/** As coleções de itens dos plugins ligados. Não depende de campanha aberta. */
export function listarItensDosPlugins(): Promise<ColecaoDeItensDoPlugin[]> {
  return call<ColecaoDeItensDoPlugin[]>("itens_do_plugin_listar");
}

/** Qual item, de qual coleção, de qual plugin. */
export type QualItem = { extensaoId: string; colecaoId: string; itemId: string };

/**
 * O item inteiro, para a prévia: a descrição e os medidores, que o card não
 * mostra. Espelho de `itens_do_plugin::ItemCompleto`.
 */
export type ItemCompletoDoPlugin = {
  item: {
    id: string;
    nome: string;
    descricao?: string | null;
    tags: string[];
    fonte?: string | null;
    imagem?: string | null;
    atributos: Array<Pick<AtributoDoItem, "nome" | "valor" | "escondido">>;
    medidores: Array<{ nome: string; maximo: number; cor?: string | null }>;
  };
  /** O id da aura, do mesmo plugin: a do item, ou a da coleção. */
  aura?: string | null;
};

/** Lê o item inteiro, sem trazer nada para a campanha. */
export function itemDoPlugin(qual: QualItem): Promise<ItemCompletoDoPlugin> {
  return call<ItemCompletoDoPlugin>("itens_do_plugin_item", qual);
}

/** O que voltou de trazer um item. Espelho de `compendio::TrazidoItemDoPlugin`. */
export type TrazidoItemDoPlugin = {
  /** O molde no Compêndio da campanha. */
  item: Item;
  /** Já estava lá: trazer de novo devolve o mesmo. */
  jaHavia: boolean;
  /** A imagem que não veio, com o motivo. O item entrou sem ela. */
  imagensDeFora: MotivoDoRust[];
};

/** O item entra no Compêndio da campanha, como molde. */
export function trazerItemDoPlugin(qual: QualItem): Promise<TrazidoItemDoPlugin> {
  return call<TrazidoItemDoPlugin>("itens_do_plugin_trazer", qual);
}

/**
 * O item entra no catálogo da campanha: sai do molde que ele deixou no
 * Compêndio, trazido agora se ainda não estava. Volta o molde e o item novo.
 */
export function itemDoPluginEmJogo(qual: QualItem): Promise<{ trazido: TrazidoItemDoPlugin; item: Item }> {
  return call<{ trazido: TrazidoItemDoPlugin; item: Item }>("itens_do_plugin_em_jogo", qual);
}
