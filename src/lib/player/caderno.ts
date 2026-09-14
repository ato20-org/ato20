"use client";

import { authorized, fail } from "@/lib/player/session";
import type { Nota } from "@/types/caderno";

/**
 * O caderno do jogador, do lado do celular dele.
 *
 * Todas as rotas ficam atrás do token, e o jogador nunca informa o próprio id:
 * ele vem da credencial. Não há id a trocar para alcançar o caderno de outro —
 * e o daemon responde 404 para a nota alheia, não 403, porque "existe mas não é
 * sua" confirmaria a nota a quem chutou o id.
 */

export type { Nota };

/** O que se pode mudar numa nota. Campo ausente é "não mexe neste". */
export type PatchNota = {
  titulo?: string;
  texto?: string;
  tags?: string[];
};

/**
 * Um personagem que o caderno pode mencionar com `@`.
 *
 * Só personagem COM JOGADOR, e a filtragem é do daemon — ver
 * `serve::table_characters`. A campanha tem os PNJ que ainda não apareceram, o
 * vilão que ninguém viu, o traidor que ainda é aliado: mandar o índice inteiro
 * para o celular entregaria a preparação do mestre na aba de rede do navegador,
 * e nenhuma filtragem na tela conserta o que já chegou.
 */
export type PersonagemDaMesa = {
  id: string;
  nome: string;
  /** O nome de quem joga este personagem. */
  dono: string;
};

export async function listNotas(codigo: string): Promise<Nota[]> {
  const response = await fetch("/eu/notas", { headers: authorized(codigo) });

  if (!response.ok)
    throw await fail(response, "Não foi possível abrir o caderno.");

  return (await response.json()) as Nota[];
}

/**
 * Abre uma nota nova, e devolve a nota já com id.
 *
 * O corpo pode ir vazio: o gesto na tela é "nota nova", e quem escreve escreve
 * DEPOIS de ela existir. Pedir um título antes de deixar escrever é a pergunta
 * mais inútil do meio de uma sessão.
 */
export async function criarNota(
  codigo: string,
  base: PatchNota = {},
): Promise<Nota> {
  const response = await fetch("/eu/notas", {
    method: "POST",
    headers: { ...authorized(codigo), "content-type": "application/json" },
    body: JSON.stringify(base),
  });

  if (!response.ok)
    throw await fail(response, "Não foi possível abrir a nota.");

  return (await response.json()) as Nota;
}

/**
 * Grava o que mudou numa nota, e só o que mudou.
 *
 * `PATCH` e não `PUT` porque as três coisas mudam em ritmos diferentes: o texto
 * sai a cada 800ms de digitação, o título quando o jogador o escreve, as
 * etiquetas quando ele as marca. Mandar o objeto inteiro faria a gravação do
 * texto levar junto uma cópia velha das etiquetas e desfazer o que acabou de
 * ser marcado.
 */
export async function mudarNota(
  codigo: string,
  id: string,
  patch: PatchNota,
): Promise<Nota> {
  const response = await fetch(`/eu/notas/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...authorized(codigo), "content-type": "application/json" },
    body: JSON.stringify(patch),
  });

  if (!response.ok)
    throw await fail(response, "Não foi possível gravar a nota.");

  return (await response.json()) as Nota;
}

export async function apagarNota(codigo: string, id: string): Promise<void> {
  const response = await fetch(`/eu/notas/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authorized(codigo),
  });

  if (!response.ok)
    throw await fail(response, "Não foi possível apagar a nota.");
}

/** Os personagens que o caderno pode mencionar. Ver `PersonagemDaMesa`. */
export async function personagensDaMesa(
  codigo: string,
): Promise<PersonagemDaMesa[]> {
  const response = await fetch("/eu/mesa/personagens", {
    headers: authorized(codigo),
  });

  if (!response.ok) throw await fail(response, "Não foi possível ler a mesa.");

  return (await response.json()) as PersonagemDaMesa[];
}
