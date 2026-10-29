"use client";

import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { call } from "@/lib/vault/bridge";
import type { Condicao, MoldeDeCondicao, PatchCondicao, Personagem } from "@/types/character";
import type { DefinicaoDeEfeito } from "@/types/efeito";
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
export type CompendioDaMaquina = {
  personagens: Personagem[];
  itens: Item[];
  condicoes: MoldeDeCondicao[];
  efeitos: DefinicaoDeEfeito[];
  /** As sugestões já entraram. Ver `semearCompendioDaMaquina`. */
  semeado: boolean;
};

/** O que se traz, se guarda ou se apaga, de cada lista. Ausente = nenhum. */
export type SelecaoDoCompendio = {
  personagens?: string[];
  itens?: string[];
  condicoes?: string[];
  efeitos?: string[];
};

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
export type Copiados = { personagens: string[]; itens: number; condicoes: number; efeitos: number };

/**
 * Do ATO20 para a campanha: tudo como molde, no Compêndio dela. As imagens das
 * fichas e dos itens entram no acervo da campanha, e as telas abertas releem.
 * Ver `trazerDoBestiario`.
 */
export async function trazerDoCompendio(selecao: SelecaoDoCompendio): Promise<Copiados> {
  const copiados = await call<Copiados>("compendio_trazer", { selecao });

  invalidarAcervo("image");

  return copiados;
}

/** Da campanha para o ATO20. A campanha continua com o que tinha. */
export function levarAoCompendio(selecao: SelecaoDoCompendio): Promise<Copiados> {
  return call<Copiados>("compendio_levar", { selecao });
}

/** De que lista é a coisa que ganha tags. Espelho de `compendio::TipoDeMolde`. */
export type TipoDeMolde = "personagem" | "item" | "condicao" | "efeito";

/**
 * As tags de um molde ou de um item da campanha. Devolve como ficaram: o Rust
 * limpa espaço, tira a repetida sem ligar para caixa e corta o excesso.
 */
export function definirTags(tipo: TipoDeMolde, id: string, tags: string[]): Promise<string[]> {
  return call<string[]>("compendio_tags", { tipo, id, tags });
}

/**
 * A aura de um personagem -- molde ou em jogo -- ou de um item da campanha,
 * `{plugin}/{aura}`, ou `null` para tirar. Ver `compendio::definir_aura`.
 */
export function definirAura(tipo: "personagem" | "item", id: string, aura: string | null): Promise<void> {
  return call<void>("compendio_aura", { tipo, id, aura });
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
export function removerDoCompendio(selecao: SelecaoDoCompendio): Promise<void> {
  return call("compendio_maquina_remover", { selecao });
}

/** Uma condição sugerida: sem id nem "escondido". Ver `SUGESTOES`. */
export type CondicaoSugerida = Pick<Condicao, "nome" | "cor" | "icone" | "efeito">;

/**
 * Põe as sugestões no Compêndio do ATO20, UMA vez por máquina. Devolve se pôs
 * agora. Ver `compendio::semear`.
 */
export function semearCompendioDaMaquina(
  condicoes: CondicaoSugerida[],
  efeitos: DefinicaoDeEfeito[],
): Promise<boolean> {
  return call<boolean>("compendio_maquina_semear", { condicoes, efeitos });
}

/** A biblioteca de condições da campanha: as que não estão no menu. */
export function listarCondicoesDoCompendio(): Promise<MoldeDeCondicao[]> {
  return call<MoldeDeCondicao[]>("compendio_condicoes");
}

export function criarCondicaoDoCompendio(
  nome: string,
  cor: string,
  icone: string,
): Promise<MoldeDeCondicao> {
  return call<MoldeDeCondicao>("compendio_condicao_criar", { nome, cor, icone });
}

export function editarCondicaoDoCompendio(
  id: string,
  patch: PatchCondicao,
): Promise<MoldeDeCondicao> {
  return call<MoldeDeCondicao>("compendio_condicao_editar", { id, patch });
}

export function apagarCondicaoDoCompendio(id: string): Promise<void> {
  return call("compendio_condicao_apagar", { id });
}

/**
 * Da biblioteca para o menu do token. O efeito da campanha que ela usa entra em
 * jogo junto. Recusa com o motivo quando o menu está cheio ou já tem o nome.
 */
export function condicaoNoMenu(id: string): Promise<Condicao> {
  return call<Condicao>("compendio_condicao_no_menu", { id });
}

/** Do menu para a biblioteca. As fichas que já têm a condição ficam com ela. */
export function guardarCondicaoNoCompendio(modeloId: string): Promise<MoldeDeCondicao> {
  return call<MoldeDeCondicao>("compendio_condicao_guardar", { modeloId });
}

/** Um molde de efeito em branco. Quem pede põe a área, se for de área. */
export function criarMoldeDeEfeito(): Promise<DefinicaoDeEfeito> {
  return call<DefinicaoDeEfeito>("compendio_efeito_criar");
}

/** O molde de efeito entra em jogo. Recusa quando os 32 estão cheios. */
export function efeitoEmJogo(id: string): Promise<DefinicaoDeEfeito> {
  return call<DefinicaoDeEfeito>("compendio_efeito_em_jogo", { id });
}

/** O efeito em jogo volta ao Compêndio. Recusa se uma condição do menu o usa. */
export function guardarEfeitoNoCompendio(id: string): Promise<DefinicaoDeEfeito> {
  return call<DefinicaoDeEfeito>("compendio_efeito_guardar", { id });
}
