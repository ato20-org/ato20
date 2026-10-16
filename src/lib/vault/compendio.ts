"use client";

import { call } from "@/lib/vault/bridge";
import type { Personagem } from "@/types/character";
import type { Item } from "@/types/inventory";

/**
 * O Compêndio: fichas e itens prontos, fora do jogo. Ver `compendio.rs`.
 *
 * Da CAMPANHA, os moldes moram no índice de personagens (`compendio: true`) e
 * se leem pelo `useCharactersStore`; os itens são o catálogo de sempre. Do
 * ATO20, tudo mora numa pasta da máquina e chega por aqui.
 */

/** Um molde novo, com o que a campanha põe em toda ficha. */
export function criarMolde(nome: string): Promise<Personagem> {
  return call<Personagem>("compendio_criar", { nome });
}

/**
 * O molde entra em jogo: uma ficha nova na lista de Personagens. O nome é o
 * do molde, numerado quando já há um em jogo ("Goblin 2").
 */
export function porEmJogo(id: string): Promise<Personagem> {
  return call<Personagem>("compendio_por_em_jogo", { id });
}

/** Uma cópia do personagem em jogo vira molde. O que está em jogo fica. */
export function guardarNoCompendio(id: string): Promise<Personagem> {
  return call<Personagem>("compendio_guardar", { id });
}

/** Um molde de item novo, no Compêndio da campanha. */
export function criarMoldeDeItem(nome: string): Promise<Item> {
  return call<Item>("compendio_criar_item", { nome });
}

/**
 * O molde de item entra no catálogo da campanha, como item que se dá e se põe
 * no mapa. Nome numerado quando já há um ("Espada 2").
 */
export function itemEmJogo(id: string): Promise<Item> {
  return call<Item>("compendio_item_em_jogo", { id });
}

/** Uma cópia do item do catálogo vira molde. O do catálogo fica. */
export function guardarItemNoCompendio(id: string): Promise<Item> {
  return call<Item>("compendio_guardar_item", { id });
}

/** O que o Compêndio do ATO20 tem. Serve a qualquer campanha desta máquina. */
export type CompendioDaMaquina = { personagens: Personagem[]; itens: Item[] };

export function listarCompendioDaMaquina(): Promise<CompendioDaMaquina> {
  return call<CompendioDaMaquina>("compendio_maquina");
}

/**
 * A miniatura de uma imagem do Compêndio do ATO20, como blob. Quem pede revoga.
 *
 * Blob, e não endereço do daemon: o daemon serve a campanha aberta, e a
 * imagem do goblin do ATO20 não está nela.
 */
export async function imagemDoCompendio(assetId: string): Promise<string> {
  const bytes = await call<ArrayBuffer>("compendio_maquina_imagem", { assetId });

  return URL.createObjectURL(new Blob([bytes]));
}

/** Quantos entraram do outro lado, e os ids novos dos personagens. */
export type Copiados = { personagens: string[]; itens: number };

/** Do ATO20 para a campanha: personagens como moldes, itens no catálogo. */
export function trazerDoCompendio(personagens: string[], itens: string[]): Promise<Copiados> {
  return call<Copiados>("compendio_trazer", { personagens, itens });
}

/** Da campanha para o ATO20. A campanha continua com o que tinha. */
export function levarAoCompendio(personagens: string[], itens: string[]): Promise<Copiados> {
  return call<Copiados>("compendio_levar", { personagens, itens });
}

/** De que lista é a coisa que ganha tags. Espelho de `compendio::TipoDeMolde`. */
export type TipoDeMolde = "personagem" | "item";

/**
 * As tags de um molde ou de um item da campanha. Devolve como ficaram: o Rust
 * limpa espaço, tira a repetida sem ligar para caixa e corta o excesso.
 */
export function definirTags(tipo: TipoDeMolde, id: string, tags: string[]): Promise<string[]> {
  return call<string[]>("compendio_tags", { tipo, id, tags });
}

/** As mesmas tags, no Compêndio do ATO20: a única coisa que se mexe lá sem trazer. */
export function definirTagsNoAto20(
  tipo: TipoDeMolde,
  id: string,
  tags: string[],
): Promise<string[]> {
  return call<string[]>("compendio_maquina_tags", { tipo, id, tags });
}

/** Tira do Compêndio do ATO20. As campanhas que já trouxeram ficam com a cópia. */
export function removerDoCompendio(personagens: string[], itens: string[]): Promise<void> {
  return call("compendio_maquina_remover", { personagens, itens });
}
