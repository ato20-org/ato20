"use client";

import { authorized, fail } from "@/lib/player/session";

/**
 * O que os plugins deixaram no personagem para o jogador ver, e o botão que
 * ele aperta.
 *
 * `dadosPublicos` traz só a metade PÚBLICA de cada plugin (ver
 * `dados_de_extensao::publicos`); a privada nunca sai do Mestre, e quem
 * separa é o daemon. `enviarAcao` sobe um clique: o celular não executa nada,
 * ele diz ao Mestre "o jogador apertou `atacar`", e o plugin lá decide.
 */

export async function dadosPublicos(
  codigo: string,
  personagemId: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `/eu/personagens/${encodeURIComponent(personagemId)}/extensoes`,
    { headers: authorized(codigo) },
  );

  if (!response.ok) throw await fail(response, "Não foi possível ler os dados dos plugins.");

  return (await response.json()) as Record<string, unknown>;
}

export async function enviarAcao(
  codigo: string,
  acao: { personagemId: string; extensaoId: string; acao: string; dados?: unknown },
): Promise<void> {
  const response = await fetch("/eu/acoes", {
    method: "POST",
    headers: { "content-type": "application/json", ...authorized(codigo) },
    body: JSON.stringify(acao),
  });

  if (!response.ok) throw await fail(response, "A mesa não recebeu a ação.");
}
