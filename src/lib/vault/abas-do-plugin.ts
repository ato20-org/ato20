"use client";

import type { TextoDePlugin } from "@/lib/extensoes/texto";
import type { MotivoDoRust } from "@/lib/vault/bestiario";
import { call } from "@/lib/vault/bridge";

/**
 * As abas que um plugin acrescenta ao Compêndio: os rituais de um sistema, os
 * talentos, as magias. Só de leitura, como o bestiário -- e o que se faz com um
 * verbete é DAR a um personagem, que o recebe como detalhe na ficha, no grupo
 * que a aba declara. Ver `abas_do_plugin.rs`.
 */

/** Um verbete, como o card o mostra. Espelho de `abas_do_plugin::Resumo`. */
export type VerbeteDoPlugin = {
  id: string;
  nome: string;
  tags: string[];
  fonte?: string | null;
  /** O arquivo da pasta do plugin que o card desenha. Ver `imagemDoBestiario`. */
  imagem?: string | null;
  /** O id da aura do card, do mesmo plugin: a do verbete, ou a da coleção. */
  aura?: string | null;
  /** A linha curta que vai na ficha, ao lado do nome. */
  resumo?: string | null;
};

/** Uma coleção de uma aba. Espelho de `abas_do_plugin::Listada`. */
export type ColecaoDeVerbetesDoPlugin = {
  extensao: string;
  id: string;
  titulo: TextoDePlugin;
  /** O id da aura da pasta da coleção, do mesmo plugin. */
  aura?: string | null;
  verbetes: VerbeteDoPlugin[];
  /** O arquivo que quebrou depois de instalado. As outras coleções seguem. */
  erro?: MotivoDoRust | null;
};

/** Uma aba de um plugin ligado, com as coleções. Espelho de `abas_do_plugin::AbaListada`. */
export type AbaDoPlugin = {
  extensao: string;
  id: string;
  titulo: TextoDePlugin;
  colecoes: ColecaoDeVerbetesDoPlugin[];
};

/** As abas dos plugins ligados. Não depende de campanha aberta. */
export function listarAbasDosPlugins(): Promise<AbaDoPlugin[]> {
  return call<AbaDoPlugin[]>("abas_listar");
}

/** Qual verbete, de qual coleção, de qual aba, de qual plugin. */
export type QualVerbete = { extensaoId: string; abaId: string; colecaoId: string; verbeteId: string };

/** Um par da ficha do verbete: "Elemento", "Sangue". */
export type CampoDoVerbete = { rotulo: string; valor: string };

/** O verbete inteiro, para a janela de leitura. Espelho de `abas_do_plugin::VerbeteCompleto`. */
export type VerbeteCompletoDoPlugin = {
  verbete: VerbeteDoPlugin & { campos: CampoDoVerbete[]; descricao?: string | null };
  /** O id da aura, do mesmo plugin: a do verbete, ou a da coleção. */
  aura?: string | null;
  /** O grupo da ficha onde o verbete entra ao ser dado. */
  grupo: string;
};

/** Lê o verbete inteiro, sem dar a ninguém. */
export function verbeteDoPlugin(qual: QualVerbete): Promise<VerbeteCompletoDoPlugin> {
  return call<VerbeteCompletoDoPlugin>("abas_verbete", qual);
}

/** O que voltou de dar um verbete. Espelho de `abas_do_plugin::Dado`. */
export type VerbeteDado = {
  /** Falso quando a ficha já tinha o verbete: dar de novo não duplica. */
  entrou: boolean;
  /** O grupo não coube no molde da campanha: o detalhe aparece no fim da ficha. */
  grupoDeFora: boolean;
  /** O grupo como a campanha o escreve. */
  grupo: string;
};

/** O verbete entra na ficha do personagem, como detalhe. */
export function darVerbete(qual: QualVerbete, personagemId: string): Promise<VerbeteDado> {
  return call<VerbeteDado>("abas_dar", { ...qual, personagemId });
}
