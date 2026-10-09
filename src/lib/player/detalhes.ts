"use client";

import { t } from "@/lib/i18n/jogador";
import { authorized, fail } from "@/lib/player/session";
import type { Lance, RolagemDaMesa } from "@/types/dado";
import type { Detalhe, GrupoDeDetalhes } from "@/types/detalhe";

/**
 * Os detalhes da ficha, do lado do celular: Classe, Defesa, os poderes.
 *
 * Só leitura, como os medidores: quem escreve a ficha é o mestre. Atrás do
 * token E do vínculo, como todo `/eu/personagens` -- ver `ligado`, no daemon.
 */

/**
 * Um detalhe como o celular o recebe: sem as opções da escolha, que só servem
 * a quem edita. A `rolagem` só vem no detalhe que ROLA -- o molde liga o d20
 * dele e a ficha tem a expressão --, e é o que diz à tela onde pôr o botão.
 */
export type DetalheDoJogador = Omit<Detalhe, "opcoes">;

export type FichaDeDetalhes = {
  /** Na ordem do molde. Ver `gruposDaFicha`. */
  grupos: GrupoDeDetalhes[];
  detalhes: DetalheDoJogador[];
};

/** O que volta de uma rolagem: o lance, e um dado da mesa por dado que caiu. */
export type RolagemDoDetalhe = {
  lance: Lance;
  rolagens: RolagemDaMesa[];
};

export async function detalhesDoPersonagem(
  codigo: string,
  id: string,
): Promise<FichaDeDetalhes> {
  const response = await fetch(`/eu/personagens/${encodeURIComponent(id)}/detalhes`, {
    headers: authorized(codigo),
  });

  if (!response.ok) throw await fail(response, t.erros.lerDetalhes);

  return (await response.json()) as FichaDeDetalhes;
}

/**
 * Rola um detalhe do próprio personagem.
 *
 * O corpo vai VAZIO: a expressão e o rótulo saem da ficha, no daemon, e é ele
 * que sorteia. Um celular que mandasse a expressão poderia rolar `1d20+50` com
 * o nome da Luta do personagem. Ver `roll_detail`.
 *
 * Sem retentativa, pela razão de `rolarDado`: repetir sozinho uma chamada que
 * pode ter chegado jogaria duas vezes para um toque.
 */
export async function rolarDetalhe(
  codigo: string,
  personagemId: string,
  detalheId: string,
): Promise<RolagemDoDetalhe> {
  const response = await fetch(
    `/eu/personagens/${encodeURIComponent(personagemId)}/detalhes/${encodeURIComponent(detalheId)}/rolar`,
    { method: "POST", headers: authorized(codigo) },
  );

  if (!response.ok) throw await fail(response, t.erros.dadoNaoChegou);

  return (await response.json()) as RolagemDoDetalhe;
}
